import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoachReport,
  buildCoachReportFilename
} from "../src/coachReport.js";

test("buildCoachReport creates a readable coaching report from history and latest analysis", () => {
  const report = buildCoachReport({
    latestAnalysis: {
      netWpm: 58,
      rawWpm: 62,
      accuracy: 94,
      consistencyScore: 72,
      incorrectChars: 6,
      durationMs: 60000,
      weakestAreas: [
        { id: "punctuation", label: "Punctuation", severity: 22, evidence: "comma misses" }
      ]
    },
    history: [
      {
        timestamp: "2026-05-23T10:00:00.000Z",
        mode: "time",
        wpm: 54,
        accuracy: 93,
        consistency: 70,
        mistakes: 7,
        durationMs: 60000,
        weakestAreas: [{ id: "punctuation", label: "Punctuation", severity: 20, evidence: "semicolon misses" }]
      }
    ],
    generatedAt: "2026-05-24T10:00:00.000Z"
  });

  assert.match(report, /^# TypeSpeed Coach Report/m);
  assert.match(report, /Generated: 2026-05-24T10:00:00.000Z/);
  assert.match(report, /Sessions analyzed: 2/);
  assert.match(report, /Punctuation/);
  assert.match(report, /wait, check, continue/);
  assert.match(report, /7-Day Training Plan/);
  assert.doesNotMatch(report, /undefined|null|\[object Object\]/);
});

test("buildCoachReportFilename creates a stable markdown filename", () => {
  assert.equal(
    buildCoachReportFilename("2026-05-24T10:11:12.000Z"),
    "typespeed-coach-report-2026-05-24T10-11-12-000Z.md"
  );
});
