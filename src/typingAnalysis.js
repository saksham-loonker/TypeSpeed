const LETTER_PATTERN = /^[a-z]$/i;
const DIGIT_PATTERN = /^[0-9]$/;
const PUNCTUATION_CHARS = new Set([",", ".", ";", ":", "'", "\"", "!", "?", "-", "(", ")", "[", "]"]);
const SYMBOL_CHARS = new Set(["@", "#", "$", "%", "^", "&", "*", "_", "+", "=", "/", "\\", "|", "<", ">", "~", "`"]);

const KEY_PROFILE = {
  q: { hand: "left", row: "top", finger: "left-pinky" },
  w: { hand: "left", row: "top", finger: "left-ring" },
  e: { hand: "left", row: "top", finger: "left-middle" },
  r: { hand: "left", row: "top", finger: "left-index" },
  t: { hand: "left", row: "top", finger: "left-index" },
  y: { hand: "right", row: "top", finger: "right-index" },
  u: { hand: "right", row: "top", finger: "right-index" },
  i: { hand: "right", row: "top", finger: "right-middle" },
  o: { hand: "right", row: "top", finger: "right-ring" },
  p: { hand: "right", row: "top", finger: "right-pinky" },
  a: { hand: "left", row: "home", finger: "left-pinky" },
  s: { hand: "left", row: "home", finger: "left-ring" },
  d: { hand: "left", row: "home", finger: "left-middle" },
  f: { hand: "left", row: "home", finger: "left-index" },
  g: { hand: "left", row: "home", finger: "left-index" },
  h: { hand: "right", row: "home", finger: "right-index" },
  j: { hand: "right", row: "home", finger: "right-index" },
  k: { hand: "right", row: "home", finger: "right-middle" },
  l: { hand: "right", row: "home", finger: "right-ring" },
  z: { hand: "left", row: "bottom", finger: "left-pinky" },
  x: { hand: "left", row: "bottom", finger: "left-ring" },
  c: { hand: "left", row: "bottom", finger: "left-middle" },
  v: { hand: "left", row: "bottom", finger: "left-index" },
  b: { hand: "left", row: "bottom", finger: "left-index" },
  n: { hand: "right", row: "bottom", finger: "right-index" },
  m: { hand: "right", row: "bottom", finger: "right-index" }
};

const EXERCISE_BANK = {
  speed: {
    title: "Speed ladder",
    text: "the fast hand moves with calm control the fast hand moves with calm control"
  },
  accuracy: {
    title: "Accuracy reset",
    text: "slow is smooth and smooth is fast; clean letters first, speed second."
  },
  rhythm: {
    title: "Rhythm pacing",
    text: "tap in steady waves, pause less, breathe once, keep the same tempo."
  },
  corrections: {
    title: "Correction control",
    text: "type each word once, fix only clear misses, and keep moving forward."
  },
  punctuation: {
    title: "Punctuation control",
    text: "wait, look, type; pause, check, continue. yes, no, maybe; finish."
  },
  numbers: {
    title: "Number row control",
    text: "14 27 39 58 60 82 95 31 46 73 204 519 836 471 690"
  },
  uppercase: {
    title: "Capital timing",
    text: "Ada Built Tools. Linus Fixed Kernels. Grace Shipped Compilers."
  },
  spaces: {
    title: "Space discipline",
    text: "one space after each word keeps each phrase clean and readable"
  },
  symbols: {
    title: "Symbol control",
    text: "@home #tag $cost %gain &join *mark +add =same /path"
  },
  leftHand: {
    title: "Left hand balance",
    text: "sad free water craft vast seed gaze trade waxed"
  },
  rightHand: {
    title: "Right hand balance",
    text: "jolly kiln humid nylon jump monk lily union"
  },
  topRow: {
    title: "Top row reach",
    text: "qwerty power route quiet type upper outer write"
  },
  homeRow: {
    title: "Home row anchor",
    text: "asdf jkl; flash salad half glass shall flask"
  },
  bottomRow: {
    title: "Bottom row control",
    text: "zxcvbn move civic zoom brave convex numb"
  }
};

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDurationMs({ durationMs, events }) {
  if (Number.isFinite(durationMs) && durationMs > 0) {
    return durationMs;
  }

  const timestamps = events
    .map(event => event.timestamp)
    .filter(timestamp => Number.isFinite(timestamp));

  if (timestamps.length < 2) {
    return 0;
  }

  return Math.max(...timestamps) - Math.min(...timestamps);
}

function getCharCategories(char) {
  const lower = char.toLowerCase();
  const profile = KEY_PROFILE[lower];
  const categories = [];

  if (LETTER_PATTERN.test(char)) {
    categories.push("letters");
    if (char !== lower) categories.push("uppercase");
  } else if (DIGIT_PATTERN.test(char)) {
    categories.push("numbers");
  } else if (PUNCTUATION_CHARS.has(char)) {
    categories.push("punctuation");
  } else if (SYMBOL_CHARS.has(char)) {
    categories.push("symbols");
  } else if (char === " ") {
    categories.push("spaces");
  }

  if (profile) {
    categories.push(`${profile.hand}Hand`);
    categories.push(`${profile.row}Row`);
    categories.push(profile.finger);
  }

  return categories;
}

function makeEmptyCategoryStat() {
  return { total: 0, correct: 0, errors: 0, accuracy: 100 };
}

function summarizeCategoryStats(operations) {
  const stats = {};

  for (const operation of operations) {
    if (!operation.targetChar) continue;

    const categories = getCharCategories(operation.targetChar);
    for (const category of categories) {
      const correct = operation.type === "match" ? 1 : 0;
      const current = stats[category] ?? (stats[category] = makeEmptyCategoryStat());
      current.total += 1;
      current.correct += correct;
      current.errors += correct ? 0 : 1;
    }
  }

  return Object.fromEntries(
    Object.entries(stats).map(([key, stat]) => [
      key,
      {
        ...stat,
        accuracy: stat.total > 0 ? round((stat.correct / stat.total) * 100) : 100
      }
    ])
  );
}

function getEventLatencies(events) {
  const typingEvents = events
    .filter(event => event.key && event.key !== "Backspace" && Number.isFinite(event.timestamp))
    .toSorted((left, right) => left.timestamp - right.timestamp);

  return typingEvents
    .slice(1)
    .map((event, index) => event.timestamp - typingEvents[index].timestamp)
    .filter(latency => latency > 0 && latency < 5_000);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map(value => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function alignSameLengthText(target, typed) {
  const operations = new Array(target.length);
  for (let index = 0; index < target.length; index += 1) {
    operations[index] = {
      type: target[index] === typed[index] ? "match" : "substitute",
      targetChar: target[index],
      typedChar: typed[index],
      targetIndex: index,
      typedIndex: index
    };
  }
  return operations;
}

function alignTypedPrefix(target, typed) {
  const matched = Array.from({ length: typed.length }, (_, index) => ({
    type: "match",
    targetChar: target[index],
    typedChar: typed[index],
    targetIndex: index,
    typedIndex: index
  }));
  const omitted = Array.from({ length: target.length - typed.length }, (_, offset) => {
    const index = typed.length + offset;
    return {
      type: "delete",
      targetChar: target[index],
      typedChar: "",
      targetIndex: index,
      typedIndex: typed.length
    };
  });

  return [...matched, ...omitted];
}

function alignTargetPrefix(target, typed) {
  const matched = Array.from({ length: target.length }, (_, index) => ({
    type: "match",
    targetChar: target[index],
    typedChar: typed[index],
    targetIndex: index,
    typedIndex: index
  }));
  const inserted = Array.from({ length: typed.length - target.length }, (_, offset) => {
    const index = target.length + offset;
    return {
      type: "insert",
      targetChar: "",
      typedChar: typed[index],
      targetIndex: target.length,
      typedIndex: index
    };
  });

  return [...matched, ...inserted];
}

function alignText(target, typed) {
  if (target.length === typed.length) {
    return alignSameLengthText(target, typed);
  }

  if (target.startsWith(typed)) {
    return alignTypedPrefix(target, typed);
  }

  if (typed.startsWith(target)) {
    return alignTargetPrefix(target, typed);
  }

  const rowCount = target.length + 1;
  const columnCount = typed.length + 1;
  const costs = Array.from({ length: rowCount }, () => Array(columnCount).fill(0));
  const steps = Array.from({ length: rowCount }, () => Array(columnCount).fill("match"));

  for (let row = 1; row < rowCount; row += 1) {
    costs[row][0] = row;
    steps[row][0] = "delete";
  }

  for (let column = 1; column < columnCount; column += 1) {
    costs[0][column] = column;
    steps[0][column] = "insert";
  }

  for (let row = 1; row < rowCount; row += 1) {
    for (let column = 1; column < columnCount; column += 1) {
      const isMatch = target[row - 1] === typed[column - 1];
      const substitutionCost = costs[row - 1][column - 1] + (isMatch ? 0 : 1);
      const deletionCost = costs[row - 1][column] + 1;
      const insertionCost = costs[row][column - 1] + 1;
      const best = Math.min(substitutionCost, deletionCost, insertionCost);

      costs[row][column] = best;
      if (best === substitutionCost) {
        steps[row][column] = isMatch ? "match" : "substitute";
      } else if (best === deletionCost) {
        steps[row][column] = "delete";
      } else {
        steps[row][column] = "insert";
      }
    }
  }

  const operations = [];
  let row = target.length;
  let column = typed.length;

  while (row > 0 || column > 0) {
    const step = steps[row][column];
    if ((step === "match" || step === "substitute") && row > 0 && column > 0) {
      operations.push({
        type: step,
        targetChar: target[row - 1],
        typedChar: typed[column - 1],
        targetIndex: row - 1,
        typedIndex: column - 1
      });
      row -= 1;
      column -= 1;
    } else if (step === "delete" && row > 0) {
      operations.push({
        type: "delete",
        targetChar: target[row - 1],
        typedChar: "",
        targetIndex: row - 1,
        typedIndex: column
      });
      row -= 1;
    } else {
      operations.push({
        type: "insert",
        targetChar: "",
        typedChar: typed[column - 1],
        targetIndex: row,
        typedIndex: column - 1
      });
      column -= 1;
    }
  }

  return operations.reverse();
}

function summarizeWords(target, typed) {
  const targetWords = target.trim().split(/\s+/).filter(Boolean);
  const typedWords = typed.trim().split(/\s+/).filter(Boolean);
  if (!targetWords.length) {
    return { wordAccuracy: 100, problemWords: [] };
  }

  const problemWords = targetWords
    .map((word, index) => ({
      word,
      typed: typedWords[index] ?? "",
      correct: word === (typedWords[index] ?? "")
    }))
    .filter(item => !item.correct);

  return {
    wordAccuracy: round(((targetWords.length - problemWords.length) / targetWords.length) * 100),
    problemWords: problemWords.slice(0, 8)
  };
}

function summarizeTroubleChars(operations) {
  const counts = new Map();
  for (const operation of operations) {
    if (operation.type === "match" || !operation.targetChar) continue;
    const current = counts.get(operation.targetChar) ?? 0;
    counts.set(operation.targetChar, current + 1);
  }

  return [...counts.entries()]
    .map(([char, count]) => ({ char, count }))
    .toSorted((left, right) => right.count - left.count || left.char.localeCompare(right.char))
    .slice(0, 10);
}

function summarizeTroubleBigrams(target, operations) {
  const counts = new Map();
  for (const operation of operations) {
    if (operation.type === "match" || operation.targetIndex < 0) continue;
    const start = Math.max(0, operation.targetIndex - 1);
    const bigram = target.slice(start, start + 2);
    if (bigram.trim().length < 2) continue;
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([text, count]) => ({ text, count }))
    .toSorted((left, right) => right.count - left.count || left.text.localeCompare(right.text))
    .slice(0, 8);
}

function buildWeakAreas({
  accuracy,
  netWpm,
  consistencyScore,
  backspaceRate,
  categoryStats,
  troubleChars,
  problemWords
}) {
  const categoryLabels = {
    punctuation: "Punctuation",
    numbers: "Numbers",
    uppercase: "Capital letters",
    symbols: "Symbols",
    spaces: "Spacing",
    leftHand: "Left hand",
    rightHand: "Right hand",
    topRow: "Top row",
    homeRow: "Home row",
    bottomRow: "Bottom row"
  };

  const categoryWeaknesses = Object.entries(categoryLabels)
    .flatMap(([id, label]) => {
      const stat = categoryStats[id];
      if (!stat || stat.total === 0 || stat.accuracy >= 92) return [];
      const severity = round(100 - stat.accuracy + Math.min(12, stat.errors * 2));
      return [{ id, label, severity, accuracy: stat.accuracy, evidence: `${stat.errors}/${stat.total} misses` }];
    });

  const globalWeaknesses = [
    netWpm < 40
      ? { id: "speed", label: "Speed", severity: round(40 - netWpm), evidence: `${netWpm} net WPM` }
      : null,
    accuracy < 96
      ? { id: "accuracy", label: "Accuracy", severity: round(100 - accuracy), evidence: `${accuracy}% character accuracy` }
      : null,
    consistencyScore < 72
      ? { id: "rhythm", label: "Rhythm", severity: round(72 - consistencyScore), evidence: `${consistencyScore}/100 consistency` }
      : null,
    backspaceRate > 8
      ? { id: "corrections", label: "Corrections", severity: round(backspaceRate), evidence: `${backspaceRate}% backspace rate` }
      : null
  ].filter(Boolean);

  const characterWeaknesses = troubleChars.slice(0, 3).map(item => ({
    id: `char:${item.char}`,
    label: `Character "${item.char}"`,
    severity: 8 + item.count,
    evidence: `${item.count} miss${item.count === 1 ? "" : "es"}`
  }));

  const wordWeaknesses = problemWords.slice(0, 2).map(item => ({
    id: `word:${item.word}`,
    label: `Word "${item.word}"`,
    severity: 7,
    evidence: item.typed ? `typed as "${item.typed}"` : "omitted"
  }));

  return [...categoryWeaknesses, ...globalWeaknesses, ...characterWeaknesses, ...wordWeaknesses]
    .toSorted((left, right) => right.severity - left.severity)
    .slice(0, 10);
}

export function analyzeTypingSession(input) {
  const target = String(input.target ?? "");
  const typed = String(input.typed ?? "");
  const events = Array.isArray(input.events) ? input.events : [];
  const durationMs = getDurationMs({ durationMs: input.durationMs, events });
  const durationMinutes = Math.max(durationMs / 60_000, 1 / 60_000);
  const operations = alignText(target, typed);
  let correctChars = 0;
  let substitutions = 0;
  let omissions = 0;
  let insertions = 0;
  for (const operation of operations) {
    if (operation.type === "match") correctChars += 1;
    else if (operation.type === "substitute") substitutions += 1;
    else if (operation.type === "delete") omissions += 1;
    else if (operation.type === "insert") insertions += 1;
  }
  const incorrectChars = substitutions + omissions + insertions;
  const accuracyBase = Math.max(target.length, typed.length, 1);
  const rawWpm = round((typed.length / 5) / durationMinutes);
  const netWpm = round((Math.max(correctChars - incorrectChars, 0) / 5) / durationMinutes);
  const cpm = round(typed.length / durationMinutes);
  const kpm = round(events.filter(event => event.key).length / durationMinutes);
  const backspaces = events.filter(event => event.key === "Backspace").length;
  const backspaceRate = round((backspaces / Math.max(typed.length + backspaces, 1)) * 100);
  const latencies = getEventLatencies(events);
  const meanLatencyMs = round(average(latencies), 0);
  const latencyStdDevMs = round(standardDeviation(latencies), 0);
  const consistencyScore = latencies.length
    ? round(clamp(100 - ((latencyStdDevMs / Math.max(meanLatencyMs, 1)) * 100), 0, 100))
    : 100;
  const fastestLatencies = latencies.toSorted((left, right) => left - right).slice(0, 10);
  const burstWpm = fastestLatencies.length
    ? round(60_000 / Math.max(average(fastestLatencies) * 5, 1))
    : rawWpm;
  const pauses = latencies.filter(latency => latency > 900).length;
  const categoryStats = summarizeCategoryStats(operations);
  const { wordAccuracy, problemWords } = summarizeWords(target, typed);
  const troubleChars = summarizeTroubleChars(operations);
  const troubleBigrams = summarizeTroubleBigrams(target, operations);
  const accuracy = round((correctChars / accuracyBase) * 100);
  const correctionEfficiency = round(clamp(100 - (incorrectChars / Math.max(backspaces + incorrectChars, 1)) * 100, 0, 100));
  const weakContext = {
    accuracy,
    netWpm,
    consistencyScore,
    backspaceRate,
    categoryStats,
    troubleChars,
    problemWords
  };

  return {
    targetLength: target.length,
    typedChars: typed.length,
    correctChars,
    incorrectChars,
    accuracy,
    rawWpm,
    netWpm,
    cpm,
    kpm,
    wordAccuracy,
    durationMs,
    backspaces,
    backspaceRate,
    correctionEfficiency,
    consistencyScore,
    meanLatencyMs,
    latencyStdDevMs,
    burstWpm,
    pauses,
    progress: round((Math.min(typed.length, target.length) / Math.max(target.length, 1)) * 100),
    errorBreakdown: {
      substitutions,
      omissions,
      insertions
    },
    categoryStats,
    troubleChars,
    troubleBigrams,
    problemWords,
    weakestAreas: buildWeakAreas(weakContext),
    operations
  };
}

export function buildFeedback(analysis) {
  if (!analysis.weakestAreas.length) {
    return [
      {
        area: "balanced",
        title: "Balanced profile",
        message: "Your speed, accuracy, rhythm, and correction behavior are balanced in this sample.",
        priority: 0
      }
    ];
  }

  return analysis.weakestAreas.slice(0, 6).map((area, index) => {
    const exercise = EXERCISE_BANK[area.id] ?? EXERCISE_BANK[area.id.split(":")[0]] ?? EXERCISE_BANK.accuracy;
    return {
      area: area.id,
      title: area.label,
      message: `${area.label} is costing you the most right now (${area.evidence}).`,
      exerciseHint: exercise.title,
      priority: index + 1
    };
  });
}

export function generateExercises(weakestAreas, analysis = {}) {
  const areas = weakestAreas.length ? weakestAreas : [{ id: "accuracy", label: "Accuracy" }];
  const generated = areas.slice(0, 6).map(area => {
    if (area.id.startsWith("char:")) {
      const char = area.id.slice("char:".length);
      return {
        id: `drill-${encodeURIComponent(area.id)}`,
        title: `Character "${char}" control`,
        focus: area.label,
        text: `${char} ${char}${char} ${char}a ${char}e ${char}i ${char}o ${char}u ${char} ${char}${char}`
      };
    }

    if (area.id.startsWith("word:")) {
      const word = area.id.slice("word:".length);
      return {
        id: `drill-${encodeURIComponent(area.id)}`,
        title: `Word "${word}" repair`,
        focus: area.label,
        text: `${word} ${word} ${word}, then ${word} again with steady timing.`
      };
    }

    const banked = EXERCISE_BANK[area.id] ?? EXERCISE_BANK.accuracy;
    return {
      id: `drill-${area.id}`,
      title: banked.title,
      focus: area.label,
      text: banked.text
    };
  });

  if (analysis.troubleBigrams?.length) {
    const text = analysis.troubleBigrams.map(item => item.text).join(" ");
    return [
      ...generated,
      {
        id: "drill-bigrams",
        title: "Trouble pair loop",
        focus: "Letter pairs",
        text: `${text} ${text} ${text}`
      }
    ].slice(0, 7);
  }

  return generated;
}

export function getExerciseBank() {
  return { ...EXERCISE_BANK };
}
