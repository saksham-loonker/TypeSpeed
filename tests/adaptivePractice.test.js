import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdaptivePractice,
  choosePracticeFocus
} from "../src/adaptivePractice.js";

test("choosePracticeFocus prioritizes recurring profile weakness over generic speed", () => {
  const focus = choosePracticeFocus({
    profile: {
      nextAction: {
        focusId: "punctuation",
        label: "Punctuation",
        reason: "Punctuation appeared in 3 sessions."
      }
    },
    latestAnalysis: {
      weakestAreas: [{ id: "speed", label: "Speed", severity: 4 }]
    }
  });

  assert.equal(focus.id, "punctuation");
  assert.equal(focus.source, "profile");
});

test("buildAdaptivePractice creates targeted punctuation text with coaching metadata", () => {
  const practice = buildAdaptivePractice({
    profile: {
      nextAction: { focusId: "punctuation", label: "Punctuation" }
    },
    wordCount: 28
  });

  assert.equal(practice.focus.id, "punctuation");
  assert.match(practice.title, /Adaptive punctuation/i);
  assert.ok(practice.text.length > 80);
  assert.match(practice.text, /[,.;:!?]/);
  assert.equal(practice.tokens.length, 28);
  assert.doesNotMatch(practice.text, /undefined|null|\[object Object\]/);
});

test("buildAdaptivePractice loops custom trouble characters and words", () => {
  const charPractice = buildAdaptivePractice({
    profile: {
      nextAction: { focusId: "char:q", label: "Q key" }
    },
    wordCount: 16
  });
  assert.match(charPractice.text, /q/);
  assert.equal(charPractice.focus.id, "char:q");

  const wordPractice = buildAdaptivePractice({
    profile: {
      nextAction: { focusId: "word:algorithm", label: "algorithm" }
    },
    wordCount: 16
  });
  assert.match(wordPractice.text, /algorithm/);
  assert.equal(wordPractice.focus.id, "word:algorithm");
});
