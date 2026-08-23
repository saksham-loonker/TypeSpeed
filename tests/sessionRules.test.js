import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaceGhost,
  buildTargetCharClass,
  getProgressBucket,
  normalizeDifficulty,
  normalizePaceTarget,
  shouldStopForHardcoreMistake
} from "../src/sessionRules.js";

test("normalizeDifficulty accepts supported modes and defaults safely", () => {
  assert.equal(normalizeDifficulty("normal"), "normal");
  assert.equal(normalizeDifficulty("hardcore"), "hardcore");
  assert.equal(normalizeDifficulty("master"), "master");
  assert.equal(normalizeDifficulty("unknown"), "normal");
  assert.equal(normalizeDifficulty(""), "normal");
});

test("hardcore mode stops only after a typed mismatch", () => {
  assert.equal(shouldStopForHardcoreMistake({
    difficulty: "hardcore",
    target: "calm hands",
    typed: "calm"
  }), false);
  assert.equal(shouldStopForHardcoreMistake({
    difficulty: "hardcore",
    target: "calm hands",
    typed: "calx"
  }), true);
  assert.equal(shouldStopForHardcoreMistake({
    difficulty: "normal",
    target: "calm hands",
    typed: "calx"
  }), false);
});

test("buildTargetCharClass marks pending, match, error, and master-faded chars", () => {
  assert.equal(buildTargetCharClass({ difficulty: "normal", index: 0, targetChar: "a", typed: "" }), "char pending");
  assert.equal(buildTargetCharClass({ difficulty: "normal", index: 0, targetChar: "a", typed: "a" }), "char match");
  assert.equal(buildTargetCharClass({ difficulty: "normal", index: 0, targetChar: "a", typed: "x" }), "char error");
  assert.equal(buildTargetCharClass({ difficulty: "master", index: 0, targetChar: "a", typed: "abcdef" }), "char match faded");
  assert.equal(buildTargetCharClass({ difficulty: "master", index: 4, targetChar: "e", typed: "abcde" }), "char match");
});

test("normalizePaceTarget validates ghost benchmark options", () => {
  assert.equal(normalizePaceTarget("off"), null);
  assert.equal(normalizePaceTarget("80"), 80);
  assert.equal(normalizePaceTarget(120), 120);
  assert.equal(normalizePaceTarget("12"), null);
  assert.equal(normalizePaceTarget("400"), null);
});

test("buildPaceGhost converts benchmark WPM to capped race progress", () => {
  assert.equal(buildPaceGhost({ paceTargetWpm: null, elapsedMs: 30_000, targetLength: 300 }), null);
  assert.deepEqual(buildPaceGhost({
    paceTargetWpm: 60,
    elapsedMs: 30_000,
    targetLength: 300
  }), {
    id: "pace-ghost",
    name: "60 WPM Ghost",
    progress: 50,
    wpm: 60,
    accuracy: 100,
    finished: false,
    isGhost: true
  });
  assert.equal(buildPaceGhost({
    paceTargetWpm: 120,
    elapsedMs: 60_000,
    targetLength: 300
  }).progress, 100);
});

test("getProgressBucket returns CSP-friendly five-percent progress classes", () => {
  assert.equal(getProgressBucket(-12), 0);
  assert.equal(getProgressBucket(0), 0);
  assert.equal(getProgressBucket(2), 0);
  assert.equal(getProgressBucket(3), 5);
  assert.equal(getProgressBucket(62), 60);
  assert.equal(getProgressBucket(63), 65);
  assert.equal(getProgressBucket(101), 100);
  assert.equal(getProgressBucket(Number.NaN), 0);
});
