import { randomInt, randomUUID } from "node:crypto";

const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;
const DEFAULT_DURATION_SECONDS = 60;
const ROOM_TTL_MS = 1000 * 60 * 60 * 3;
const MAX_PLAYERS = 12;
const MAX_ROOM_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 120;
const MAX_TRUSTED_RACE_WPM = 360;
const RACE_PROGRESS_GRACE_MS = 1_000;
const MESSAGE_KINDS = new Set(["chat", "reaction"]);

export class RoomStoreError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "RoomStoreError";
    this.code = code;
    this.status = status;
  }
}

export function sanitizePlayerName(name) {
  const cleaned = String(name ?? "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);

  return cleaned || "Typist";
}

export function validateRoomCode(code) {
  return ROOM_CODE_PATTERN.test(String(code ?? "").toUpperCase());
}

export function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join("");
}

function normalizeDuration(durationSeconds) {
  const numeric = Number(durationSeconds);
  if (!Number.isFinite(numeric)) return DEFAULT_DURATION_SECONDS;
  return Math.round(Math.min(300, Math.max(15, numeric)));
}

function createPlayer(name, now, overrides = {}) {
  return {
    id: overrides.id ?? randomUUID(),
    token: overrides.token ?? randomUUID(),
    name: sanitizePlayerName(name),
    joinedAt: now,
    typedChars: 0,
    progress: 0,
    wpm: 0,
    accuracy: 100,
    finished: false,
    finishedAt: null
  };
}

function normalizeRoomCode(code) {
  const normalized = String(code ?? "").toUpperCase();
  if (!validateRoomCode(normalized)) {
    throw new RoomStoreError("invalid_room_code", "Room code is invalid.", 422);
  }
  return normalized;
}

function roundTenth(value) {
  return Math.round(value * 10) / 10;
}

function getRaceElapsedMs(room, currentTime) {
  if (!Number.isFinite(room.startedAt)) return 0;
  return Math.max(0, currentTime - room.startedAt);
}

function getTrustedTypedCharLimit(room, currentTime) {
  const targetLength = String(room.targetText ?? "").length;
  if (!targetLength) return Number.POSITIVE_INFINITY;

  const trustedElapsedMs = getRaceElapsedMs(room, currentTime) + RACE_PROGRESS_GRACE_MS;
  const trustedChars = Math.floor((trustedElapsedMs / 60_000) * MAX_TRUSTED_RACE_WPM * 5);
  return Math.min(targetLength, trustedChars);
}

function normalizeProgress(input, room, now) {
  const targetLength = String(room.targetText ?? "").length;
  const requestedProgress = Math.min(100, Math.max(0, Number(input.progress) || 0));
  const requestedTypedChars = Math.max(0, Math.round(Number(input.typedChars) || 0));
  const trustedTypedLimit = getTrustedTypedCharLimit(room, now);
  const typedChars = Math.min(requestedTypedChars, trustedTypedLimit);
  const progressLimit = targetLength > 0 ? roundTenth((typedChars / targetLength) * 100) : requestedProgress;
  const progress = Math.min(requestedProgress, progressLimit);
  const wpm = Math.min(MAX_TRUSTED_RACE_WPM, Math.max(0, roundTenth(Number(input.wpm) || 0)));
  const accuracy = Math.min(100, Math.max(0, Math.round((Number(input.accuracy) || 0) * 10) / 10));
  const raceTimedOut = getRaceElapsedMs(room, now) >= room.durationSeconds * 1000;
  const requestedFinished = Boolean(input.finished) || requestedProgress >= 100;
  const finished = requestedFinished && (!targetLength || progress >= 100 || raceTimedOut);

  return {
    typedChars,
    progress,
    wpm,
    accuracy,
    finished,
    finishedAt: finished ? now : null
  };
}

function normalizeMessageText(text) {
  return String(text ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeMessageKind(kind) {
  const normalized = String(kind ?? "chat").toLowerCase();
  if (!MESSAGE_KINDS.has(normalized)) {
    throw new RoomStoreError("validation_error", "Message kind is invalid.", 422);
  }
  return normalized;
}

function sortPlayers(players) {
  return players.toSorted((left, right) => {
    if (right.finished !== left.finished) return Number(right.finished) - Number(left.finished);
    if (right.progress !== left.progress) return right.progress - left.progress;
    if (right.wpm !== left.wpm) return right.wpm - left.wpm;
    return right.accuracy - left.accuracy;
  });
}

function findPlayer(room, playerId) {
  return room.players.find(player => player.id === playerId);
}

function assertPlayerToken(room, input, errorCode = "invalid_player_credentials", message = "Player credentials are invalid.") {
  const playerId = String(input.playerId ?? "");
  const playerToken = String(input.playerToken ?? "");
  const player = findPlayer(room, playerId);

  if (!player) {
    throw new RoomStoreError("player_not_found", "Player was not found in this room.", 404);
  }

  if (!playerToken || player.token !== playerToken) {
    throw new RoomStoreError(errorCode, message, 403);
  }

  return player;
}

export function createRoomStore(options = {}) {
  const rooms = new Map();
  const now = options.now ?? Date.now;
  const codeFactory = options.codeFactory ?? createRoomCode;

  function pruneExpiredRooms() {
    const currentTime = now();
    for (const [code, room] of rooms.entries()) {
      if (currentTime - room.updatedAt > ROOM_TTL_MS) {
        rooms.delete(code);
      }
    }
  }

  function getRoomOrThrow(code) {
    pruneExpiredRooms();
    const normalized = normalizeRoomCode(code);
    const room = rooms.get(normalized);
    if (!room) {
      throw new RoomStoreError("room_not_found", "Room was not found.", 404);
    }
    return room;
  }

  function saveRoom(room) {
    rooms.set(room.code, room);
    return room;
  }

  function createRoom(input = {}) {
    pruneExpiredRooms();
    const currentTime = now();
    const host = createPlayer(input.hostName, currentTime);
    let code = normalizeRoomCode(codeFactory());
    let attempts = 0;

    while (rooms.has(code) && attempts < 20) {
      code = normalizeRoomCode(codeFactory());
      attempts += 1;
    }

    if (rooms.has(code)) {
      throw new RoomStoreError("room_code_conflict", "Could not allocate a room code.", 500);
    }

    const room = {
      code,
      status: "lobby",
      hostId: host.id,
      passageId: String(input.passageId ?? "balanced-1").slice(0, 80),
      targetText: String(input.targetText ?? "").slice(0, 1200),
      durationSeconds: normalizeDuration(input.durationSeconds),
      createdAt: currentTime,
      updatedAt: currentTime,
      startedAt: null,
      seq: 1,
      messages: [],
      players: [host]
    };

    return saveRoom(room);
  }

  function joinRoom(code, input = {}) {
    const room = getRoomOrThrow(code);
    if (room.status !== "lobby") {
      throw new RoomStoreError("room_already_started", "Room has already started.", 409);
    }

    if (room.players.length >= MAX_PLAYERS) {
      throw new RoomStoreError("room_full", "Room is full.", 409);
    }

    const currentTime = now();
    const player = createPlayer(input.name, currentTime);
    const nextRoom = {
      ...room,
      updatedAt: currentTime,
      seq: room.seq + 1,
      players: [...room.players, player]
    };

    return saveRoom(nextRoom);
  }

  function startRoom(code, input = {}) {
    const room = getRoomOrThrow(code);
    const host = assertPlayerToken(room, input, "host_required", "Only the host can start this room.");
    if (host.id !== room.hostId) {
      throw new RoomStoreError("host_required", "Only the host can start this room.", 403);
    }

    if (room.status !== "lobby") {
      throw new RoomStoreError("room_already_started", "Room has already started.", 409);
    }

    const currentTime = now();
    const resetPlayers = room.players.map(player => ({
      ...player,
      typedChars: 0,
      progress: 0,
      wpm: 0,
      accuracy: 100,
      finished: false,
      finishedAt: null
    }));

    return saveRoom({
      ...room,
      status: "running",
      startedAt: currentTime,
      updatedAt: currentTime,
      seq: room.seq + 1,
      players: resetPlayers
    });
  }

  function updateProgress(code, input = {}) {
    const room = getRoomOrThrow(code);
    const authorizedPlayer = assertPlayerToken(room, input);

    if (room.status !== "running") {
      throw new RoomStoreError("room_not_running", "Room is not running.", 409);
    }

    const currentTime = now();
    const nextProgress = normalizeProgress(input, room, currentTime);

    const nextPlayers = room.players.map(player => {
      if (player.id !== authorizedPlayer.id) return player;
      const isStalePacket = nextProgress.typedChars < player.typedChars || nextProgress.progress < player.progress;
      if (isStalePacket) return player;

      return {
        ...player,
        ...nextProgress,
        finished: player.finished || nextProgress.finished,
        finishedAt: player.finished || nextProgress.finished ? player.finishedAt ?? currentTime : null
      };
    });

    const allFinished = nextPlayers.length > 0 && nextPlayers.every(player => player.finished);
    const nextRoom = {
      ...room,
      status: allFinished ? "finished" : room.status,
      updatedAt: currentTime,
      seq: room.seq + 1,
      players: nextPlayers
    };

    return saveRoom(nextRoom);
  }

  function resumeRoom(code, input = {}) {
    const room = getRoomOrThrow(code);
    const player = assertPlayerToken(room, input);
    const currentTime = now();
    const nextRoom = saveRoom({
      ...room,
      updatedAt: currentTime,
      seq: room.seq + 1
    });

    return {
      room: nextRoom,
      player: findPlayer(nextRoom, player.id)
    };
  }

  function postRoomMessage(code, input = {}) {
    const room = getRoomOrThrow(code);
    const player = assertPlayerToken(room, input);
    const text = normalizeMessageText(input.text);
    if (!text) {
      throw new RoomStoreError("validation_error", "Message text is required.", 422);
    }

    const currentTime = now();
    const message = {
      id: randomUUID(),
      playerId: player.id,
      playerName: player.name,
      kind: normalizeMessageKind(input.kind),
      text,
      createdAt: currentTime
    };
    const nextMessages = [...(room.messages ?? []), message].slice(-MAX_ROOM_MESSAGES);

    return saveRoom({
      ...room,
      updatedAt: currentTime,
      seq: room.seq + 1,
      messages: nextMessages
    });
  }

  function getRoom(code) {
    return getRoomOrThrow(code);
  }

  function getLeaderboard(code) {
    return sortPlayers(getRoomOrThrow(code).players);
  }

  return {
    createRoom,
    joinRoom,
    startRoom,
    updateProgress,
    resumeRoom,
    postRoomMessage,
    getRoom,
    getLeaderboard,
    pruneExpiredRooms
  };
}
