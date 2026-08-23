import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrainingPlan,
  summarizeHistory
} from "../src/trainingPlan.js";

test("summarizeHistory calculates current averages, bests, and trend", () => {
  const summary = summarizeHistory([
    { wpm: 48, accuracy: 92, consistency: 70, mistakes: 9 },
    { wpm: 52, accuracy: 94, consistency: 76, mistakes: 6 },
    { wpm: 58, accuracy: 96, consistency: 82, mistakes: 3 }
  ]);

  assert.equal(summary.sessions, 3);
  assert.equal(summary.averageWpm, 52.7);
  assert.equal(summary.bestWpm, 58);
  assert.equal(summary.averageAccuracy, 94);
  assert.equal(summary.trend.wpmDelta, 10);
  assert.equal(summary.trend.direction, "improving");
});

test("buildTrainingPlan produces a focused weekly plan from weak areas and history", () => {
  const plan = buildTrainingPlan({
    latestAnalysis: {
      netWpm: 42,
      accuracy: 91,
      consistencyScore: 63,
      weakestAreas: [
        { id: "punctuation", label: "Punctuation", severity: 24, evidence: "4/9 misses" },
        { id: "rhythm", label: "Rhythm", severity: 13, evidence: "63/100 consistency" }
      ]
    },
    history: [
      { wpm: 39, accuracy: 89, consistency: 58, mistakes: 10 },
      { wpm: 42, accuracy: 91, consistency: 63, mistakes: 7 }
    ]
  });

  assert.equal(plan.primaryGoal.metric, "accuracy");
  assert.ok(plan.primaryGoal.target >= 96);
  assert.equal(plan.sessions.length, 7);
  assert.ok(plan.sessions.some(session => session.focus === "Punctuation"));
  assert.ok(plan.sessions.every(session => session.minutes > 0));
  assert.ok(plan.reviewChecklist.some(item => item.includes("accuracy")));
});
