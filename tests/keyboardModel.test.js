import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKeyboardRenderKey,
  buildKeyboardRows,
  recordKeyStat,
  summarizeHandWorkload
} from "../src/keyboardModel.js";

test("recordKeyStat updates success and failure maps immutably", () => {
  const successes = { a: 1 };
  const failures = { b: 2 };

  const successResult = recordKeyStat({
    successes,
    failures,
    expected: "A",
    actual: "a",
    statsVersion: 4
  });
  const failureResult = recordKeyStat({
    successes,
    failures,
    expected: "B",
    actual: "x",
    statsVersion: 4
  });

  assert.deepEqual(successes, { a: 1 });
  assert.deepEqual(failures, { b: 2 });
  assert.notEqual(successResult.successes, successes);
  assert.equal(successResult.successes.a, 2);
  assert.equal(successResult.failures, failures);
  assert.equal(successResult.statsVersion, 5);
  assert.notEqual(failureResult.failures, failures);
  assert.equal(failureResult.failures.b, 3);
  assert.equal(failureResult.successes, successes);
  assert.equal(failureResult.statsVersion, 5);
});

test("recordKeyStat ignores missing expected keys without changing version", () => {
  const successes = {};
  const failures = {};
  const result = recordKeyStat({
    successes,
    failures,
    expected: "",
    actual: "x",
    statsVersion: 9
  });

  assert.equal(result.successes, successes);
  assert.equal(result.failures, failures);
  assert.equal(result.statsVersion, 9);
});

test("buildKeyboardRenderKey only depends on visible keyboard state", () => {
  assert.equal(
    buildKeyboardRenderKey({
      layoutName: "colemak",
      showGuides: true,
      showHeatmap: true,
      statsVersion: 12
    }),
    "colemak|guides|heat-12"
  );
  assert.equal(
    buildKeyboardRenderKey({
      layoutName: "colemak",
      showGuides: true,
      showHeatmap: false,
      statsVersion: 12
    }),
    "colemak|guides|no-heat"
  );
});

test("buildKeyboardRows returns key classes, labels, and heat levels for rendering", () => {
  const rows = buildKeyboardRows({
    layoutName: "qwerty",
    showGuides: true,
    showHeatmap: true,
    successes: { a: 8, b: 1 },
    failures: { a: 2, b: 4 }
  });
  const flattened = rows.flat();
  const aKey = flattened.find(key => key.key === "a");
  const bKey = flattened.find(key => key.key === "b");
  const spaceKey = flattened.find(key => key.key === " ");

  assert.ok(aKey.classes.includes("key"));
  assert.ok(aKey.classes.includes("size-normal"));
  assert.ok(aKey.classes.includes("finger-pinky"));
  assert.ok(aKey.classes.includes("heat-med"));
  assert.equal(aKey.label, "a");
  assert.equal(aKey.total, 10);
  assert.equal(aKey.errorRatio, 0.2);
  assert.ok(bKey.classes.includes("heat-high"));
  assert.equal(spaceKey.label, "Space");
  assert.ok(spaceKey.classes.includes("size-space"));
});

test("summarizeHandWorkload reports left and right hand balance", () => {
  assert.deepEqual(summarizeHandWorkload("asdf hjkl"), {
    left: 50,
    right: 50,
    leftCount: 4,
    rightCount: 4
  });

  assert.deepEqual(summarizeHandWorkload("aaaa"), {
    left: 100,
    right: 0,
    leftCount: 4,
    rightCount: 0
  });

  assert.deepEqual(summarizeHandWorkload("  123"), {
    left: 100,
    right: 0,
    leftCount: 3,
    rightCount: 0
  });

  assert.deepEqual(summarizeHandWorkload(""), {
    left: 50,
    right: 50,
    leftCount: 0,
    rightCount: 0
  });
});
