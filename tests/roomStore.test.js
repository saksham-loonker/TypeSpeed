import assert from "node:assert/strict";
import test from "node:test";

import {
  createRoomStore,
  sanitizePlayerName,
  validateRoomCode
} from "../src/roomStore.js";

test("room store creates a room, joins players, starts, and records progress immutably", () => {
  const store = createRoomStore({ now: () => 1_000, codeFactory: () => "AB12CD" });
  const room = store.createRoom({
    hostName: "Ada",
    passageId: "focus-punctuation",
    durationSeconds: 60
  });

  assert.equal(room.code, "AB12CD");
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].name, "Ada");
  assert.ok(room.players[0].token);

  const joined = store.joinRoom(room.code, { name: "Linus" });
  assert.equal(joined.players.length, 2);
  assert.notEqual(joined, room);
  assert.ok(joined.players[1].token);

  assert.throws(
    () => store.startRoom(room.code, { playerId: room.players[0].id, playerToken: "wrong" }),
    /Only the host can start/
  );

  const started = store.startRoom(room.code, {
    playerId: room.players[0].id,
    playerToken: room.players[0].token
  });
  assert.equal(started.status, "running");
  assert.equal(started.startedAt, 1_000);

  assert.throws(
    () => store.updateProgress(room.code, {
      playerId: joined.players[1].id,
      playerToken: "wrong",
      typedChars: 42,
      progress: 64,
      wpm: 78,
      accuracy: 97,
      finished: false
    }),
    /credentials/
  );

  const progressed = store.updateProgress(room.code, {
    playerId: joined.players[1].id,
    playerToken: joined.players[1].token,
    typedChars: 42,
    progress: 64,
    wpm: 78,
    accuracy: 97,
    finished: false
  });

  const player = progressed.players.find(item => item.name === "Linus");
  assert.equal(player.progress, 64);
  assert.equal(player.wpm, 78);
  assert.equal(player.accuracy, 97);
});

test("room validation rejects unsafe room codes and cleans names", () => {
  assert.equal(validateRoomCode("AB12CD"), true);
  assert.equal(validateRoomCode("../x"), false);
  assert.equal(validateRoomCode(""), false);
  assert.equal(sanitizePlayerName("  <script>Ada</script>  "), "scriptAdascript");
  assert.equal(sanitizePlayerName(""), "Typist");
});

test("room store records authenticated lobby messages without mutating prior room snapshots", () => {
  let currentTime = 5_000;
  const store = createRoomStore({
    now: () => currentTime,
    codeFactory: () => "CHAT01"
  });
  const room = store.createRoom({ hostName: "Ada" });
  const joined = store.joinRoom(room.code, { name: "Linus" });
  const player = joined.players[1];

  assert.throws(
    () => store.postRoomMessage(room.code, {
      playerId: player.id,
      playerToken: "wrong",
      kind: "chat",
      text: "Good luck"
    }),
    /credentials/
  );

  currentTime = 5_500;
  const messaged = store.postRoomMessage(room.code, {
    playerId: player.id,
    playerToken: player.token,
    kind: "chat",
    text: "  <b>Ready</b>\nnow  "
  });

  assert.equal(joined.messages.length, 0);
  assert.equal(messaged.messages.length, 1);
  assert.equal(messaged.messages[0].playerName, "Linus");
  assert.equal(messaged.messages[0].kind, "chat");
  assert.equal(messaged.messages[0].text, "<b>Ready</b> now");
  assert.equal(messaged.updatedAt, 5_500);
});

test("room store ignores stale progress packets that would move a racer backward", () => {
  const store = createRoomStore({ now: () => 7_000, codeFactory: () => "ORDER1" });
  const room = store.createRoom({ hostName: "Ada" });
  const joined = store.joinRoom(room.code, { name: "Linus" });
  const player = joined.players[1];
  store.startRoom(room.code, {
    playerId: room.players[0].id,
    playerToken: room.players[0].token
  });

  const advanced = store.updateProgress(room.code, {
    playerId: player.id,
    playerToken: player.token,
    typedChars: 80,
    progress: 80,
    wpm: 92,
    accuracy: 98,
    finished: false
  });
  const stale = store.updateProgress(room.code, {
    playerId: player.id,
    playerToken: player.token,
    typedChars: 30,
    progress: 30,
    wpm: 44,
    accuracy: 75,
    finished: false
  });
  const stalePlayer = stale.players.find(item => item.id === player.id);

  assert.equal(advanced.players.find(item => item.id === player.id).progress, 80);
  assert.equal(stalePlayer.typedChars, 80);
  assert.equal(stalePlayer.progress, 80);
  assert.equal(stalePlayer.wpm, 92);
  assert.equal(stalePlayer.accuracy, 98);
});

test("room store rejects duplicate starts without resetting active race progress", () => {
  const store = createRoomStore({ now: () => 9_000, codeFactory: () => "START1" });
  const room = store.createRoom({ hostName: "Ada" });
  const joined = store.joinRoom(room.code, { name: "Linus" });
  const host = room.players[0];
  const guest = joined.players[1];

  const started = store.startRoom(room.code, {
    playerId: host.id,
    playerToken: host.token
  });
  assert.equal(started.status, "running");

  const progressed = store.updateProgress(room.code, {
    playerId: guest.id,
    playerToken: guest.token,
    typedChars: 60,
    progress: 60,
    wpm: 88,
    accuracy: 97,
    finished: false
  });
  assert.equal(progressed.players.find(player => player.id === guest.id).progress, 60);

  assert.throws(
    () => store.startRoom(room.code, {
      playerId: host.id,
      playerToken: host.token
    }),
    /already started/
  );

  const stillProgressed = store.getRoom(room.code).players.find(player => player.id === guest.id);
  assert.equal(stillProgressed.typedChars, 60);
  assert.equal(stillProgressed.progress, 60);
  assert.equal(stillProgressed.wpm, 88);
  assert.equal(stillProgressed.accuracy, 97);
});

test("room store caps implausible race progress against elapsed time and target length", () => {
  let currentTime = 20_000;
  const store = createRoomStore({
    now: () => currentTime,
    codeFactory: () => "FAIR01"
  });
  const room = store.createRoom({
    hostName: "Ada",
    durationSeconds: 60,
    targetText: "a".repeat(200)
  });
  const joined = store.joinRoom(room.code, { name: "Linus" });
  const host = room.players[0];
  const guest = joined.players[1];

  store.startRoom(room.code, {
    playerId: host.id,
    playerToken: host.token
  });

  const capped = store.updateProgress(room.code, {
    playerId: guest.id,
    playerToken: guest.token,
    typedChars: 200,
    progress: 100,
    wpm: 500,
    accuracy: 100,
    finished: true
  });
  const cappedGuest = capped.players.find(player => player.id === guest.id);

  assert.equal(cappedGuest.typedChars, 30);
  assert.equal(cappedGuest.progress, 15);
  assert.equal(cappedGuest.wpm, 360);
  assert.equal(cappedGuest.finished, false);
  assert.equal(capped.status, "running");

  currentTime += 60_000;
  const finished = store.updateProgress(room.code, {
    playerId: guest.id,
    playerToken: guest.token,
    typedChars: 200,
    progress: 100,
    wpm: 120,
    accuracy: 100,
    finished: true
  });
  const finishedGuest = finished.players.find(player => player.id === guest.id);

  assert.equal(finishedGuest.typedChars, 200);
  assert.equal(finishedGuest.progress, 100);
  assert.equal(finishedGuest.wpm, 120);
  assert.equal(finishedGuest.finished, true);
});

test("room store resumes an authenticated player without duplicating the roster", () => {
  let currentTime = 80_000;
  const store = createRoomStore({
    now: () => currentTime,
    codeFactory: () => "REJOIN"
  });
  const room = store.createRoom({ hostName: "Ada", targetText: "a".repeat(100) });
  const joined = store.joinRoom(room.code, { name: "Linus" });
  const host = room.players[0];
  const guest = joined.players[1];

  store.startRoom(room.code, {
    playerId: host.id,
    playerToken: host.token
  });

  currentTime += 10_000;
  store.updateProgress(room.code, {
    playerId: guest.id,
    playerToken: guest.token,
    typedChars: 40,
    progress: 40,
    wpm: 72,
    accuracy: 96,
    finished: false
  });

  assert.throws(
    () => store.resumeRoom(room.code, {
      playerId: guest.id,
      playerToken: "wrong"
    }),
    /credentials/
  );

  const resumed = store.resumeRoom(room.code, {
    playerId: guest.id,
    playerToken: guest.token
  });
  const resumedGuest = resumed.room.players.find(player => player.id === guest.id);

  assert.equal(resumed.player.id, guest.id);
  assert.equal(resumed.room.players.length, 2);
  assert.equal(resumed.room.status, "running");
  assert.equal(resumedGuest.progress, 40);
  assert.equal(resumedGuest.wpm, 72);
});
