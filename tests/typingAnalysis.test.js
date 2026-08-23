import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  analyzeTypingSession,
  buildFeedback,
  generateExercises
} from "../src/typingAnalysis.js";

test("analyzeTypingSession calculates perfect-session speed and accuracy", () => {
  const target = "the quick brown fox jumps";
  const typed = "the quick brown fox jumps";
  const analysis = analyzeTypingSession({
    target,
    typed,
    events: [],
    durationMs: 30_000
  });

  assert.equal(analysis.correctChars, target.length);
  assert.equal(analysis.incorrectChars, 0);
  assert.equal(analysis.accuracy, 100);
  assert.equal(analysis.rawWpm, 10);
  assert.equal(analysis.netWpm, 10);
  assert.equal(analysis.cpm, 50);
  assert.equal(analysis.wordAccuracy, 100);
});

test("analyzeTypingSession classifies substitutions, omissions, and weak punctuation", () => {
  const analysis = analyzeTypingSession({
    target: "Pack my box, with 5 jugs.",
    typed: "Pack my bix with S jug",
    events: [
      { type: "input", key: "P", timestamp: 0, valueLength: 1 },
      { type: "input", key: "a", timestamp: 500, valueLength: 2 },
      { type: "keydown", key: "Backspace", timestamp: 700, valueLength: 1 },
      { type: "input", key: "a", timestamp: 900, valueLength: 2 }
    ],
    durationMs: 18_000
  });

  assert.equal(analysis.errorBreakdown.substitutions, 2);
  assert.equal(analysis.errorBreakdown.omissions, 3);
  assert.ok(analysis.categoryStats.punctuation.accuracy < 100);
  assert.ok(analysis.categoryStats.numbers.accuracy < 100);
  assert.ok(analysis.backspaces, 1);
  assert.ok(analysis.weakestAreas.some(area => area.id === "punctuation"));
});

test("feedback and exercises target the weakest measured areas", () => {
  const analysis = analyzeTypingSession({
    target: "A1, B2, C3, D4.",
    typed: "Aq Bq Cq Dq",
    events: [],
    durationMs: 12_000
  });

  const feedback = buildFeedback(analysis);
  const exercises = generateExercises(analysis.weakestAreas, analysis);

  assert.ok(feedback.some(item => item.area === "numbers"));
  assert.ok(feedback.some(item => item.area === "punctuation"));
  assert.ok(exercises.some(exercise => exercise.title.includes("Number")));
  assert.ok(exercises.some(exercise => exercise.text.includes(",")));
});

test("analyzeTypingSession keeps same-length live analysis responsive", () => {
  const target = "a".repeat(1_799) + "b";
  const typed = "a".repeat(1_799) + "x";
  const startedAt = performance.now();
  const analysis = analyzeTypingSession({
    target,
    typed,
    events: [],
    durationMs: 60_000
  });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(analysis.correctChars, 1_799);
  assert.equal(analysis.incorrectChars, 1);
  assert.equal(analysis.operations.length, 1_800);
  assert.ok(elapsedMs < 250, `same-length analysis took ${elapsedMs.toFixed(1)}ms`);
});
