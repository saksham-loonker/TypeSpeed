const KEYBOARD_FINGERS = {
  q: "pinky-l", a: "pinky-l", z: "pinky-l", "1": "pinky-l",
  w: "ring-l", s: "ring-l", x: "ring-l", "2": "ring-l",
  e: "middle-l", d: "middle-l", c: "middle-l", "3": "middle-l",
  r: "index-l", f: "index-l", v: "index-l", t: "index-l", g: "index-l", b: "index-l",
  y: "index-r", h: "index-r", n: "index-r", u: "index-r", j: "index-r", m: "index-r",
  i: "middle-r", k: "middle-r", ",": "middle-r",
  o: "ring-r", l: "ring-r", ".": "ring-r",
  p: "pinky-r", ";": "pinky-r", "/": "pinky-r", "0": "pinky-r",
  " ": "thumb"
};

const KEYBOARD_LAYOUTS = {
  qwerty: [
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"],
    ["Tab", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
    ["CapsLock", "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "Enter"],
    ["Shift", "z", "x", "c", "v", "b", "n", "m", ",", ".", "/", "Shift"],
    ["Control", "Alt", " ", "Alt", "Control"]
  ],
  dvorak: [
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "[", "]", "Backspace"],
    ["Tab", "'", ",", ".", "p", "y", "f", "g", "c", "r", "l", "/", "=", "\\"],
    ["CapsLock", "a", "o", "e", "u", "i", "d", "h", "t", "n", "s", "-", "Enter"],
    ["Shift", ";", "q", "j", "k", "x", "b", "m", "w", "v", "z", "Shift"],
    ["Control", "Alt", " ", "Alt", "Control"]
  ],
  colemak: [
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"],
    ["Tab", "q", "w", "f", "p", "g", "j", "l", "u", "y", ";", "[", "]", "\\"],
    ["CapsLock", "a", "r", "s", "t", "d", "h", "n", "e", "i", "o", "'", "Enter"],
    ["Shift", "z", "x", "c", "v", "b", "k", "m", ",", ".", "/", "Shift"],
    ["Control", "Alt", " ", "Alt", "Control"]
  ]
};

function getKeySizeClass(key) {
  if (key === "Backspace") return "size-backspace size-grow";
  if (key === "Tab") return "size-tab";
  if (key === "CapsLock") return "size-caps";
  if (key === "Enter") return "size-enter size-grow";
  if (key === "Shift") return "size-lshift";
  if (key === "Control") return "size-control";
  if (key === "Alt") return "size-alt";
  if (key === " ") return "size-space";
  return "size-normal";
}

function normalizeKey(key) {
  return String(key ?? "").toLowerCase();
}

export function recordKeyStat({
  successes,
  failures,
  expected,
  actual,
  statsVersion
}) {
  const normalizedExpected = normalizeKey(expected);
  if (!normalizedExpected) {
    return { successes, failures, statsVersion };
  }

  if (normalizeKey(actual) === normalizedExpected) {
    return {
      successes: {
        ...successes,
        [normalizedExpected]: (successes[normalizedExpected] ?? 0) + 1
      },
      failures,
      statsVersion: statsVersion + 1
    };
  }

  return {
    successes,
    failures: {
      ...failures,
      [normalizedExpected]: (failures[normalizedExpected] ?? 0) + 1
    },
    statsVersion: statsVersion + 1
  };
}

export function buildKeyboardRenderKey({
  layoutName,
  showGuides,
  showHeatmap,
  statsVersion
}) {
  return [
    layoutName,
    showGuides ? "guides" : "plain",
    showHeatmap ? `heat-${statsVersion}` : "no-heat"
  ].join("|");
}

export function buildKeyboardRows({
  layoutName,
  showGuides,
  showHeatmap,
  successes,
  failures
}) {
  const layout = KEYBOARD_LAYOUTS[layoutName] ?? KEYBOARD_LAYOUTS.qwerty;

  return layout.map(row => row.map(key => {
    const normalized = normalizeKey(key);
    const total = (failures[normalized] ?? 0) + (successes[normalized] ?? 0);
    const errorRatio = total ? (failures[normalized] ?? 0) / total : 0;
    const classes = ["key", ...getKeySizeClass(key).split(" ")];
    const finger = KEYBOARD_FINGERS[normalized];

    if (showGuides && finger) {
      classes.push(`finger-${finger.split("-")[0]}`);
    }

    if (showHeatmap && total > 0) {
      classes.push(errorRatio > 0.4 ? "heat-high" : errorRatio > 0.15 ? "heat-med" : "heat-low");
    }

    return {
      key,
      label: key === " " ? "Space" : key,
      classes,
      total,
      errorRatio: Math.round(errorRatio * 100) / 100
    };
  }));
}

export function summarizeHandWorkload(text) {
  const counts = [...String(text ?? "").toLowerCase()].reduce((accumulator, char) => {
    const finger = KEYBOARD_FINGERS[char];
    if (finger?.endsWith("-l")) return { ...accumulator, leftCount: accumulator.leftCount + 1 };
    if (finger?.endsWith("-r")) return { ...accumulator, rightCount: accumulator.rightCount + 1 };
    return accumulator;
  }, { leftCount: 0, rightCount: 0 });
  const total = counts.leftCount + counts.rightCount;

  if (!total) {
    return {
      left: 50,
      right: 50,
      leftCount: 0,
      rightCount: 0
    };
  }

  const left = Math.round((counts.leftCount / total) * 100);
  return {
    left,
    right: 100 - left,
    ...counts
  };
}
