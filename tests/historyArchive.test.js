import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeHistory,
  parseHistoryArchive
} from "../src/historyArchive.js";

test("parseHistoryArchive accepts exported arrays and preserves weak-area evidence", () => {
  const archive = parseHistoryArchive(JSON.stringify([
    {
      timestamp: "2026-05-24T10:00:00.000Z",
      mode: "time",
      wpm: 61,
      accuracy: 96,
      consistency: 82,
      mistakes: 3,
      weakestAreas: [{ id: "numbers", label: "Numbers", severity: 17, evidence: "number misses" }]
    }
  ]));

  assert.equal(archive.entries.length, 1);
  assert.equal(archive.rejected, 0);
  assert.equal(archive.entries[0].weakestAreas[0].id, "numbers");
});

test("parseHistoryArchive rejects invalid JSON and unsupported archive shapes", () => {
  assert.throws(() => parseHistoryArchive("{"), /valid JSON/);
  assert.throws(() => parseHistoryArchive(JSON.stringify({ nope: [] })), /history array/);
});

test("mergeHistory deduplicates, sorts newest first, and enforces a limit", () => {
  const merged = mergeHistory({
    existingHistory: [
      { timestamp: "2026-05-22T10:00:00.000Z", mode: "time", wpm: 50, accuracy: 94 },
      { timestamp: "2026-05-21T10:00:00.000Z", mode: "time", wpm: 48, accuracy: 93 }
    ],
    importedHistory: [
      { timestamp: "2026-05-22T10:00:00.000Z", mode: "time", wpm: 50, accuracy: 94 },
      { timestamp: "2026-05-24T10:00:00.000Z", mode: "words", wpm: 63, accuracy: 97 },
      { timestamp: "2026-05-23T10:00:00.000Z", mode: "quote", wpm: 59, accuracy: 96 }
    ],
    limit: 3
  });

  assert.deepEqual(merged.map(entry => entry.timestamp), [
    "2026-05-24T10:00:00.000Z",
    "2026-05-23T10:00:00.000Z",
    "2026-05-22T10:00:00.000Z"
  ]);
  assert.equal(merged.length, 3);
});
