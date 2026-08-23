import assert from "node:assert/strict";
import test from "node:test";

import { createAppServer } from "../server.js";

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test("local server exposes room creation, join, and progress API", async t => {
  let currentTime = 10_000;
  const server = createAppServer({
    now: () => currentTime,
    codeFactory: () => "ROOM42"
  });
  t.after(() => server.close());

  const baseUrl = await listen(server);
  const createdResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostName: "Host", durationSeconds: 45 })
  });
  assert.equal(createdResponse.status, 201);

  const created = await createdResponse.json();
  assert.equal(created.data.room.code, "ROOM42");
  assert.ok(created.data.shareUrl.includes("ROOM42"));
  assert.ok(created.data.playerToken);
  assert.equal(created.data.room.players[0].token, undefined);
  assert.equal(created.data.room.players[0].playerToken, undefined);

  const joinedResponse = await fetch(`${baseUrl}/api/rooms/ROOM42/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Guest" })
  });
  assert.equal(joinedResponse.status, 200);

  const joined = await joinedResponse.json();
  assert.equal(joined.data.room.players.length, 2);
  assert.ok(joined.data.playerToken);
  assert.equal(joined.data.room.players[1].token, undefined);
  assert.equal(joined.data.room.players[1].playerToken, undefined);

  const playerId = joined.data.playerId;
  const spoofedProgressResponse = await fetch(`${baseUrl}/api/rooms/ROOM42/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId,
      typedChars: 20,
      progress: 50,
      wpm: 65,
      accuracy: 93,
      finished: false
    })
  });
  assert.equal(spoofedProgressResponse.status, 403);

  const startedResponse = await fetch(`${baseUrl}/api/rooms/ROOM42/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: created.data.playerId,
      playerToken: created.data.playerToken
    })
  });
  assert.equal(startedResponse.status, 200);

  currentTime += 10_000;
  const halfwayTypedChars = Math.ceil(created.data.room.targetText.length / 2);
  const progressResponse = await fetch(`${baseUrl}/api/rooms/ROOM42/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId,
      playerToken: joined.data.playerToken,
      typedChars: halfwayTypedChars,
      progress: 50,
      wpm: 65,
      accuracy: 93,
      finished: false
    })
  });
  assert.equal(progressResponse.status, 200);

  const progress = await progressResponse.json();
  assert.equal(progress.data.room.players[1].progress, 50);
});

async function readSseEvent(reader) {
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 3000;

  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const marker = buffer.indexOf("\n\n");
    if (marker === -1) continue;

    const raw = buffer.slice(0, marker);
    const dataLine = raw.split("\n").find(line => line.startsWith("data: "));
    assert.ok(dataLine, `Expected SSE data line in ${raw}`);
    return JSON.parse(dataLine.slice("data: ".length));
  }

  throw new Error("Timed out waiting for SSE event.");
}

test("local server streams room updates over server-sent events", async t => {
  const server = createAppServer({
    now: () => 10_000,
    codeFactory: () => "ROOM99"
  });
  t.after(() => server.close());

  const baseUrl = await listen(server);
  const createdResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostName: "Host", durationSeconds: 45 })
  });
  assert.equal(createdResponse.status, 201);

  const streamResponse = await fetch(`${baseUrl}/api/rooms/ROOM99/events`);
  assert.equal(streamResponse.status, 200);
  assert.match(streamResponse.headers.get("content-type") ?? "", /text\/event-stream/);
  assert.equal(streamResponse.headers.get("cache-control"), "no-cache, no-transform");

  const reader = streamResponse.body.getReader();
  t.after(async () => {
    await reader.cancel();
  });
  const initial = await readSseEvent(reader);
  assert.equal(initial.room.code, "ROOM99");
  assert.equal(initial.room.players.length, 1);
  assert.equal(initial.room.players[0].token, undefined);

  const joinedResponse = await fetch(`${baseUrl}/api/rooms/ROOM99/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Guest" })
  });
  assert.equal(joinedResponse.status, 200);

  const joined = await readSseEvent(reader);
  assert.equal(joined.room.players.length, 2);
  assert.equal(joined.room.players[0].token, undefined);
  assert.equal(joined.room.players[1].token, undefined);
});

test("local server rejects malformed room payloads", async t => {
  const server = createAppServer();
  t.after(() => server.close());

  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostName: "x".repeat(200), durationSeconds: -1 })
  });

  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(payload.error.code, "validation_error");
});

test("local server rejects non-finite multiplayer progress telemetry", async t => {
  const server = createAppServer({
    now: () => 20_000,
    codeFactory: () => "FINITE"
  });
  t.after(() => server.close());

  const baseUrl = await listen(server);
  const createdResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostName: "Host", durationSeconds: 45 })
  });
  const created = await createdResponse.json();

  const joinedResponse = await fetch(`${baseUrl}/api/rooms/FINITE/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Guest" })
  });
  const joined = await joinedResponse.json();

  const startedResponse = await fetch(`${baseUrl}/api/rooms/FINITE/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: created.data.playerId,
      playerToken: created.data.playerToken
    })
  });
  assert.equal(startedResponse.status, 200);

  const response = await fetch(`${baseUrl}/api/rooms/FINITE/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: `{"playerId":"${joined.data.playerId}","playerToken":"${joined.data.playerToken}","typedChars":20,"progress":50,"wpm":1e309,"accuracy":93,"finished":false}`
  });
  assert.equal(response.status, 422);

  const payload = await response.json();
  assert.equal(payload.error.code, "validation_error");

  const roomResponse = await fetch(`${baseUrl}/api/rooms/FINITE`);
  const room = await roomResponse.json();
  assert.equal(room.data.room.players[1].wpm, 0);
  assert.equal(room.data.room.players[1].progress, 0);
});

test("local server rejects duplicate room starts without resetting progress", async t => {
  let currentTime = 40_000;
  const server = createAppServer({
    now: () => currentTime,
    codeFactory: () => "START1"
  });
  t.after(() => server.close());

  const baseUrl = await listen(server);
  const created = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      hostName: "Host",
      durationSeconds: 45,
      targetText: "a".repeat(100)
    })
  }).then(response => response.json());

  const joined = await fetch(`${baseUrl}/api/rooms/START1/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Guest" })
  }).then(response => response.json());

  const startBody = {
    playerId: created.data.playerId,
    playerToken: created.data.playerToken
  };
  const firstStart = await fetch(`${baseUrl}/api/rooms/START1/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(startBody)
  });
  assert.equal(firstStart.status, 200);

  currentTime += 10_000;
  await fetch(`${baseUrl}/api/rooms/START1/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
      typedChars: 60,
      progress: 60,
      wpm: 88,
      accuracy: 97,
      finished: false
    })
  });

  const duplicateStart = await fetch(`${baseUrl}/api/rooms/START1/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(startBody)
  });
  assert.equal(duplicateStart.status, 409);

  const room = await fetch(`${baseUrl}/api/rooms/START1`).then(response => response.json());
  const guest = room.data.room.players.find(player => player.id === joined.data.playerId);
  assert.equal(guest.progress, 60);
  assert.equal(guest.wpm, 88);
});

test("local server caps implausible multiplayer progress from forged clients", async t => {
  let currentTime = 50_000;
  const server = createAppServer({
    now: () => currentTime,
    codeFactory: () => "FAIR01"
  });
  t.after(() => server.close());

  const baseUrl = await listen(server);
  const created = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      hostName: "Host",
      durationSeconds: 60,
      targetText: "a".repeat(200)
    })
  }).then(response => response.json());

  const joined = await fetch(`${baseUrl}/api/rooms/FAIR01/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Guest" })
  }).then(response => response.json());

  const startedResponse = await fetch(`${baseUrl}/api/rooms/FAIR01/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: created.data.playerId,
      playerToken: created.data.playerToken
    })
  });
  assert.equal(startedResponse.status, 200);

  const forgedProgressResponse = await fetch(`${baseUrl}/api/rooms/FAIR01/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
      typedChars: 200,
      progress: 100,
      wpm: 500,
      accuracy: 100,
      finished: true
    })
  });
  assert.equal(forgedProgressResponse.status, 200);

  const forgedProgress = await forgedProgressResponse.json();
  const cappedGuest = forgedProgress.data.room.players.find(player => player.id === joined.data.playerId);
  assert.equal(cappedGuest.typedChars, 30);
  assert.equal(cappedGuest.progress, 15);
  assert.equal(cappedGuest.wpm, 360);
  assert.equal(cappedGuest.finished, false);
  assert.equal(forgedProgress.data.room.status, "running");

  currentTime += 60_000;
  const completedProgress = await fetch(`${baseUrl}/api/rooms/FAIR01/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
      typedChars: 200,
      progress: 100,
      wpm: 120,
      accuracy: 100,
      finished: true
    })
  }).then(response => response.json());

  const completedGuest = completedProgress.data.room.players.find(player => player.id === joined.data.playerId);
  assert.equal(completedGuest.progress, 100);
  assert.equal(completedGuest.finished, true);
});

test("local server resumes authenticated room sessions without adding duplicate players", async t => {
  let currentTime = 60_000;
  const server = createAppServer({
    now: () => currentTime,
    codeFactory: () => "REJOIN"
  });
  t.after(() => server.close());

  const baseUrl = await listen(server);
  const created = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      hostName: "Host",
      targetText: "a".repeat(100)
    })
  }).then(response => response.json());

  const joined = await fetch(`${baseUrl}/api/rooms/REJOIN/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Guest" })
  }).then(response => response.json());

  await fetch(`${baseUrl}/api/rooms/REJOIN/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: created.data.playerId,
      playerToken: created.data.playerToken
    })
  });

  currentTime += 10_000;
  await fetch(`${baseUrl}/api/rooms/REJOIN/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
      typedChars: 40,
      progress: 40,
      wpm: 72,
      accuracy: 96,
      finished: false
    })
  });

  const spoofedResume = await fetch(`${baseUrl}/api/rooms/REJOIN/resume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: joined.data.playerId,
      playerToken: "wrong"
    })
  });
  assert.equal(spoofedResume.status, 403);

  const resumedResponse = await fetch(`${baseUrl}/api/rooms/REJOIN/resume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken
    })
  });
  assert.equal(resumedResponse.status, 200);

  const resumed = await resumedResponse.json();
  const publicRoom = JSON.stringify(resumed.data.room);
  const resumedGuest = resumed.data.room.players.find(player => player.id === joined.data.playerId);

  assert.equal(resumed.data.playerId, joined.data.playerId);
  assert.equal(resumed.data.playerToken, joined.data.playerToken);
  assert.equal(resumed.data.isHost, false);
  assert.equal(resumed.data.room.players.length, 2);
  assert.equal(resumedGuest.progress, 40);
  assert.equal(publicRoom.includes(joined.data.playerToken), false);
  assert.equal(publicRoom.includes(created.data.playerToken), false);
});

test("local server posts authenticated room messages without leaking credentials", async t => {
  const server = createAppServer({
    now: () => 30_000,
    codeFactory: () => "CHAT01"
  });
  t.after(() => server.close());

  const baseUrl = await listen(server);
  const created = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostName: "Host", durationSeconds: 45 })
  }).then(response => response.json());

  const joined = await fetch(`${baseUrl}/api/rooms/CHAT01/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Guest" })
  }).then(response => response.json());

  const spoofedMessageResponse = await fetch(`${baseUrl}/api/rooms/CHAT01/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: joined.data.playerId,
      playerToken: "wrong",
      kind: "chat",
      text: "Ready"
    })
  });
  assert.equal(spoofedMessageResponse.status, 403);

  const messageResponse = await fetch(`${baseUrl}/api/rooms/CHAT01/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
      kind: "chat",
      text: "Good luck everyone!"
    })
  });
  assert.equal(messageResponse.status, 200);

  const message = await messageResponse.json();
  assert.equal(message.data.room.messages.length, 1);
  assert.equal(message.data.room.messages[0].playerName, "Guest");
  assert.equal(message.data.room.messages[0].text, "Good luck everyone!");

  const publicRoom = JSON.stringify(message.data.room);
  assert.equal(publicRoom.includes(joined.data.playerToken), false);
  assert.equal(publicRoom.includes(created.data.playerToken), false);
});
