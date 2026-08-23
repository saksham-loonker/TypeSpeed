import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUserProfile,
  normalizeHistoryEntry
} from "../src/profileCoach.js";

test("normalizeHistoryEntry preserves coaching evidence from saved analyses", () => {
  const entry = normalizeHistoryEntry({
    timestamp: "2026-05-24T10:00:00.000Z",
    mode: "time",
    wpm: "54",
    accuracy: "93.5",
    consistency: "71",
    mistakes: "8",
    durationMs: "60000",
    weakestAreas: [
      { id: "punctuation", label: "Punctuation", severity: 24, evidence: "4 misses" },
      { id: "numbers", label: "Numbers", severity: 13, evidence: "2 misses" }
    ]
  });

  assert.equal(entry.wpm, 54);
  assert.equal(entry.accuracy, 93.5);
  assert.equal(entry.durationMs, 60000);
  assert.deepEqual(entry.weakestAreas.map(area => area.id), ["punctuation", "numbers"]);
});

test("buildUserProfile ranks recurring weak areas across latest and history", () => {
  const profile = buildUserProfile({
    latestAnalysis: {
      netWpm: 57,
      accuracy: 94,
      consistencyScore: 72,
      incorrectChars: 6,
      durationMs: 60000,
      weakestAreas: [
        { id: "punctuation", label: "Punctuation", severity: 22, evidence: "latest comma misses" },
        { id: "rhythm", label: "Rhythm", severity: 12, evidence: "uneven latency" }
      ]
    },
    history: [
      {
        timestamp: "2026-05-21T10:00:00.000Z",
        wpm: 52,
        accuracy: 92,
        consistency: 69,
        mistakes: 9,
        durationMs: 60000,
        weakestAreas: [{ id: "punctuation", label: "Punctuation", severity: 25, evidence: "semicolon misses" }]
      },
      {
        timestamp: "2026-05-22T10:00:00.000Z",
        wpm: 54,
        accuracy: 93,
        consistency: 71,
        mistakes: 7,
        durationMs: 60000,
        weakestAreas: [{ id: "numbers", label: "Numbers", severity: 18, evidence: "number row misses" }]
      },
      {
        timestamp: "2026-05-23T10:00:00.000Z",
        wpm: 56,
        accuracy: 94,
        consistency: 70,
        mistakes: 7,
        durationMs: 60000,
        weakestAreas: [{ id: "punctuation", label: "Punctuation", severity: 20, evidence: "quote misses" }]
      }
    ]
  });

  assert.equal(profile.summary.sessions, 4);
  assert.equal(profile.sustainedWeakAreas[0].id, "punctuation");
  assert.equal(profile.sustainedWeakAreas[0].sessionsSeen, 3);
  assert.match(profile.nextAction.reason, /3 of 4 sessions/);
  assert.match(profile.nextAction.drillText, /wait, check, continue/);
});

test("buildUserProfile detects speed plateaus and produces a benchmark action", () => {
  const profile = buildUserProfile({
    history: [
      { wpm: 58, accuracy: 97, consistency: 84, mistakes: 2 },
      { wpm: 59, accuracy: 97, consistency: 85, mistakes: 1 },
      { wpm: 58, accuracy: 98, consistency: 86, mistakes: 1 },
      { wpm: 59, accuracy: 97, consistency: 85, mistakes: 2 },
      { wpm: 58, accuracy: 98, consistency: 86, mistakes: 1 },
      { wpm: 59, accuracy: 98, consistency: 86, mistakes: 1 }
    ]
  });

  assert.equal(profile.plateau.speed, true);
  assert.equal(profile.nextAction.focusId, "speed");
  assert.match(profile.nextAction.reason, /speed has flattened/i);
  assert.match(profile.nextAction.drillText, /fast calm hands/);
});
