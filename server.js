import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

import packageJson from "./package.json" with { type: "json" };
import { PASSAGES, getPassageById } from "./src/passages.js";
import {
  RoomStoreError,
  createRoomStore,
  sanitizePlayerName,
  validateRoomCode
} from "./src/roomStore.js";

const __dirname = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PUBLIC_DIR = resolve(__dirname, "public");
const SRC_DIR = resolve(__dirname, "src");
const DEFAULT_PORT = 4173;
const MAX_JSON_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 240;
const APP_VERSION = packageJson.version;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

class HttpError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
  }
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'"
    ].join("; ")
  );
}

function sendJson(response, status, payload) {
  setSecurityHeaders(response);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const status = error.status ?? 500;
  const code = error.code ?? "internal_error";
  const message = status >= 500 ? "Internal server error." : error.message;
  sendJson(response, status, { error: { code, message } });
}

function toPublicPlayer(player) {
  const { token, ...publicPlayer } = player;
  return publicPlayer;
}

function toPublicRoom(room) {
  return {
    ...room,
    players: room.players.map(toPublicPlayer)
  };
}

function writeRoomEvent(response, room) {
  response.write(`event: room\ndata: ${JSON.stringify({ room: toPublicRoom(room) })}\n\n`);
}

function getClientIp(request) {
  return request.socket.remoteAddress ?? "unknown";
}

function createRateLimiter() {
  const buckets = new Map();

  return function checkRateLimit(request) {
    const currentTime = Date.now();
    const key = getClientIp(request);
    const bucket = buckets.get(key);

    if (!bucket || currentTime - bucket.startedAt > RATE_WINDOW_MS) {
      buckets.set(key, { startedAt: currentTime, count: 1 });
      return;
    }

    const nextBucket = { ...bucket, count: bucket.count + 1 };
    buckets.set(key, nextBucket);

    if (nextBucket.count > RATE_LIMIT) {
      throw new HttpError("rate_limited", "Too many requests. Try again shortly.", 429);
    }
  };
}

function parseJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    const chunks = [];

    request.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        request.destroy();
        rejectBody(new HttpError("payload_too_large", "Request body is too large.", 413));
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (!chunks.length) {
        resolveBody({});
        return;
      }

      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        rejectBody(new HttpError("invalid_json", "Request body must be valid JSON.", 400));
      }
    });

    request.on("error", rejectBody);
  });
}

function requireFiniteNumber(value, fieldName) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new HttpError("validation_error", `${fieldName} must be a finite number.`, 422);
  }
  return numeric;
}

function requireFiniteRange(value, fieldName, min, max) {
  const numeric = requireFiniteNumber(value, fieldName);
  if (numeric < min || numeric > max) {
    throw new HttpError("validation_error", `${fieldName} must be between ${min} and ${max}.`, 422);
  }
  return numeric;
}

function validateCreateRoomPayload(body) {
  const rawHostName = String(body.hostName ?? "");
  const durationSeconds = requireFiniteRange(body.durationSeconds ?? 60, "durationSeconds", 15, 300);
  const targetText = String(body.targetText ?? "");

  if (rawHostName.trim().length > 24) {
    throw new HttpError("validation_error", "Host name must be 24 characters or less.", 422);
  }

  if (targetText.length > 1200) {
    throw new HttpError("validation_error", "Challenge text must be 1200 characters or less.", 422);
  }

  const passage = getPassageById(body.passageId);

  return {
    hostName: sanitizePlayerName(rawHostName),
    durationSeconds,
    passageId: String(body.passageId ?? passage.id),
    targetText: targetText || passage.text
  };
}

function validateJoinPayload(body) {
  const rawName = String(body.name ?? "");
  if (rawName.trim().length > 24) {
    throw new HttpError("validation_error", "Player name must be 24 characters or less.", 422);
  }

  return { name: sanitizePlayerName(rawName) };
}

function validateProgressPayload(body) {
  const playerId = String(body.playerId ?? "");
  if (!playerId) {
    throw new HttpError("validation_error", "playerId is required.", 422);
  }

  return {
    playerId,
    playerToken: String(body.playerToken ?? ""),
    typedChars: requireFiniteRange(body.typedChars ?? 0, "typedChars", 0, 10_000),
    progress: requireFiniteRange(body.progress ?? 0, "progress", 0, 100),
    wpm: requireFiniteRange(body.wpm ?? 0, "wpm", 0, 500),
    accuracy: requireFiniteRange(body.accuracy ?? 100, "accuracy", 0, 100),
    finished: Boolean(body.finished)
  };
}

function validateMessagePayload(body) {
  const playerId = String(body.playerId ?? "");
  if (!playerId) {
    throw new HttpError("validation_error", "playerId is required.", 422);
  }

  return {
    playerId,
    playerToken: String(body.playerToken ?? ""),
    kind: String(body.kind ?? "chat"),
    text: String(body.text ?? "")
  };
}

function validateResumePayload(body) {
  const playerId = String(body.playerId ?? "");
  if (!playerId) {
    throw new HttpError("validation_error", "playerId is required.", 422);
  }

  return {
    playerId,
    playerToken: String(body.playerToken ?? "")
  };
}

function getLocalAddresses(port) {
  return Object.values(networkInterfaces())
    .flat()
    .filter(item => item && item.family === "IPv4" && !item.internal)
    .map(item => `http://${item.address}:${port}`);
}

function getShareUrl(request, code) {
  const host = request.headers.host ?? `localhost:${DEFAULT_PORT}`;
  const port = host.includes(":") ? host.split(":").at(-1) : String(DEFAULT_PORT);
  const [lanUrl] = getLocalAddresses(port);
  const baseUrl = lanUrl ?? `http://${host}`;
  return `${baseUrl}/?room=${encodeURIComponent(code)}`;
}

function isPathInside(candidate, root) {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate === root || candidate.startsWith(normalizedRoot);
}

function createRoomBroadcaster() {
  const subscribers = new Map();

  return {
    subscribe({ request, response, code, room }) {
      setSecurityHeaders(response);
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive"
      });
      writeRoomEvent(response, room);

      const nextSubscribers = subscribers.get(code) ?? new Set();
      nextSubscribers.add(response);
      subscribers.set(code, nextSubscribers);

      const heartbeat = setInterval(() => {
        if (!response.destroyed) response.write(": keep-alive\n\n");
      }, 25_000);

      request.on("close", () => {
        clearInterval(heartbeat);
        const currentSubscribers = subscribers.get(code);
        if (!currentSubscribers) return;
        currentSubscribers.delete(response);
        if (!currentSubscribers.size) subscribers.delete(code);
      });
    },

    publish(room) {
      const currentSubscribers = subscribers.get(room.code);
      if (!currentSubscribers) return;
      for (const response of currentSubscribers) {
        if (response.destroyed) {
          currentSubscribers.delete(response);
          continue;
        }
        writeRoomEvent(response, room);
      }
      if (!currentSubscribers.size) subscribers.delete(room.code);
    }
  };
}

async function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError("method_not_allowed", "Method not allowed.", 405);
  }

  const pathname = decodeURIComponent(url.pathname);
  const root = pathname.startsWith("/src/") ? SRC_DIR : PUBLIC_DIR;
  const relativePath = pathname === "/"
    ? "index.html"
    : pathname.startsWith("/src/")
      ? pathname.replace(/^\/src\//, "")
      : pathname.replace(/^\//, "");
  const filePath = resolve(join(root, relativePath));

  if (!isPathInside(filePath, root)) {
    throw new HttpError("not_found", "File was not found.", 404);
  }

  let content;
  try {
    content = await readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      throw new HttpError("not_found", "File was not found.", 404);
    }
    throw error;
  }

  const extension = extname(filePath);
  setSecurityHeaders(response);
  response.writeHead(200, {
    "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
    "cache-control": extension === ".html" ? "no-store" : "no-cache"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(content);
}

async function routeApi({ request, response, url, store, broadcaster }) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, {
      data: {
        status: "ok",
        version: APP_VERSION,
        uptimeSeconds: Math.round(process.uptime())
      }
    });
    return true;
  }

  if (url.pathname === "/api/network-info" && request.method === "GET") {
    const host = request.headers.host ?? `localhost:${DEFAULT_PORT}`;
    const port = host.includes(":") ? host.split(":").at(-1) : String(DEFAULT_PORT);
    sendJson(response, 200, {
      data: {
        localUrl: `http://localhost:${port}`,
        lanUrls: getLocalAddresses(port)
      }
    });
    return true;
  }

  if (url.pathname === "/api/passages" && request.method === "GET") {
    sendJson(response, 200, { data: { passages: PASSAGES } });
    return true;
  }

  if (url.pathname === "/api/rooms" && request.method === "POST") {
    const body = await parseJsonBody(request);
    const room = store.createRoom(validateCreateRoomPayload(body));
    const host = room.players[0];
    broadcaster.publish(room);
    sendJson(response, 201, {
      data: {
        room: toPublicRoom(room),
        playerId: room.hostId,
        playerToken: host.token,
        shareUrl: getShareUrl(request, room.code)
      }
    });
    return true;
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})(?:\/([a-z-]+))?$/i);
  if (!roomMatch) return false;

  const code = roomMatch[1].toUpperCase();
  const action = roomMatch[2] ?? "";
  if (!validateRoomCode(code)) {
    throw new HttpError("invalid_room_code", "Room code is invalid.", 422);
  }

  if (!action && request.method === "GET") {
    sendJson(response, 200, { data: { room: toPublicRoom(store.getRoom(code)) } });
    return true;
  }

  if (action === "events" && request.method === "GET") {
    broadcaster.subscribe({
      request,
      response,
      code,
      room: store.getRoom(code)
    });
    return true;
  }

  if (action === "join" && request.method === "POST") {
    const body = await parseJsonBody(request);
    const room = store.joinRoom(code, validateJoinPayload(body));
    const player = room.players.at(-1);
    broadcaster.publish(room);
    sendJson(response, 200, {
      data: {
        room: toPublicRoom(room),
        playerId: player.id,
        playerToken: player.token
      }
    });
    return true;
  }

  if (action === "resume" && request.method === "POST") {
    const body = await parseJsonBody(request);
    const { room, player } = store.resumeRoom(code, validateResumePayload(body));
    broadcaster.publish(room);
    sendJson(response, 200, {
      data: {
        room: toPublicRoom(room),
        playerId: player.id,
        playerToken: player.token,
        isHost: player.id === room.hostId,
        shareUrl: getShareUrl(request, room.code)
      }
    });
    return true;
  }

  if (action === "start" && request.method === "POST") {
    const body = await parseJsonBody(request);
    const room = store.startRoom(code, {
      playerId: String(body.playerId ?? ""),
      playerToken: String(body.playerToken ?? "")
    });
    broadcaster.publish(room);
    sendJson(response, 200, { data: { room: toPublicRoom(room) } });
    return true;
  }

  if (action === "progress" && request.method === "POST") {
    const body = await parseJsonBody(request);
    const room = store.updateProgress(code, validateProgressPayload(body));
    broadcaster.publish(room);
    sendJson(response, 200, { data: { room: toPublicRoom(room) } });
    return true;
  }

  if (action === "message" && request.method === "POST") {
    const body = await parseJsonBody(request);
    const room = store.postRoomMessage(code, validateMessagePayload(body));
    broadcaster.publish(room);
    sendJson(response, 200, { data: { room: toPublicRoom(room) } });
    return true;
  }

  throw new HttpError("method_not_allowed", "Method not allowed.", 405);
}

export function createAppServer(options = {}) {
  const store = options.store ?? createRoomStore({
    now: options.now,
    codeFactory: options.codeFactory
  });
  const checkRateLimit = createRateLimiter();
  const broadcaster = createRoomBroadcaster();

  return createServer(async (request, response) => {
    try {
      checkRateLimit(request);
      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname.startsWith("/api/")) {
        const handled = await routeApi({ request, response, url, store, broadcaster });
        if (!handled) throw new HttpError("not_found", "Endpoint was not found.", 404);
        return;
      }

      await serveStatic(request, response, url);
    } catch (error) {
      if (error instanceof RoomStoreError || error instanceof HttpError) {
        sendError(response, error);
        return;
      }

      console.error("Unexpected server error:", error);
      sendError(response, new HttpError("internal_error", "Internal server error.", 500));
    }
  });
}

function startServer() {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = createAppServer();

  server.listen(port, "0.0.0.0", () => {
    const lanUrls = getLocalAddresses(port);
    console.log(`TypeSpeed is running at http://localhost:${port}`);
    for (const lanUrl of lanUrls) {
      console.log(`LAN: ${lanUrl}`);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
