import assert from "node:assert/strict";
import test from "node:test";

import { analyzeTypingSession } from "../src/typingAnalysis.js";

test("Time-based Test: WPM calculation handles 15-second quick tests", () => {
  const target = "the quick brown fox jumps over the lazy dog";
  const typed = "the quick brown fox";
  
  // Slice target to match how the frontend computes getEffectiveTarget()
  const effectiveTarget = target.slice(0, typed.length);
  
  // "the quick brown fox" is 19 characters.
  // In 15 seconds (0.25 minutes):
  // Raw WPM = (19 / 5) / 0.25 = 3.8 / 0.25 = 15.2
  const analysis = analyzeTypingSession({
    target: effectiveTarget,
    typed,
    events: [],
    durationMs: 15_000 // 15 seconds
  });

  assert.equal(analysis.durationMs, 15_000);
  assert.equal(analysis.rawWpm, 15.2);
  assert.equal(analysis.netWpm, 15.2);
  assert.equal(analysis.accuracy, 100);
});

test("Time-based Test: WPM calculation handles fractional seconds and edge durations", () => {
  const target = "calm hands make fast work";
  const typed = "calm hands"; // 10 chars
  
  // Test with 5.5 seconds (5500 ms)
  const analysis = analyzeTypingSession({
    target: target.slice(0, typed.length),
    typed,
    events: [],
    durationMs: 5_500
  });

  const durationMin = 5_500 / 60_000;
  const expectedRawWpm = Math.round(((10 / 5) / durationMin) * 10) / 10;
  
  assert.equal(analysis.rawWpm, expectedRawWpm);
});

test("Time-based Test: Consistency score handles uniform keypress latencies perfectly", () => {
  // Let's mock a sequence of events with perfectly uniform latencies (100ms between each key)
  const events = [
    { type: "input", key: "a", timestamp: 1000 },
    { type: "input", key: "b", timestamp: 1100 },
    { type: "input", key: "c", timestamp: 1200 },
    { type: "input", key: "d", timestamp: 1300 },
    { type: "input", key: "e", timestamp: 1400 }
  ];

  const analysis = analyzeTypingSession({
    target: "abcde",
    typed: "abcde",
    events,
    durationMs: 400
  });

  // Since all latencies are exactly 100ms, standard deviation is 0.
  // Consistency score = 100 - (0 / 100 * 100) = 100.
  assert.equal(analysis.consistencyScore, 100);
  assert.equal(analysis.meanLatencyMs, 100);
  assert.equal(analysis.latencyStdDevMs, 0);
});

test("Time-based Test: Consistency score declines with irregular typing tempos", () => {
  // Irregular latencies: 100ms, 400ms, 150ms, 600ms
  const events = [
    { type: "input", key: "a", timestamp: 1000 },
    { type: "input", key: "b", timestamp: 1100 }, // +100ms
    { type: "input", key: "c", timestamp: 1500 }, // +400ms
    { type: "input", key: "d", timestamp: 1650 }, // +150ms
    { type: "input", key: "e", timestamp: 2250 }  // +600ms
  ];

  const analysis = analyzeTypingSession({
    target: "abcde",
    typed: "abcde",
    events,
    durationMs: 1250
  });

  // Standard deviation of [100, 400, 150, 600] will be high, consistency score should be < 100
  assert.ok(analysis.consistencyScore < 85);
  assert.ok(analysis.latencyStdDevMs > 0);
  assert.equal(analysis.meanLatencyMs, 313); // Rounded from 312.5 to 0 decimal places
});

test("Time-based Test: Progress calculations accurately cap at 100%", () => {
  const target = "short";
  const typed = "short and way more text typed";

  const analysis = analyzeTypingSession({
    target,
    typed,
    events: [],
    durationMs: 10_000
  });

  // Progress = Math.min(typed.length, target.length) / target.length
  assert.equal(analysis.progress, 100);
  assert.equal(analysis.correctChars, 5); // 'short'
});
