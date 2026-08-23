const DEFAULT_WORD_COUNT = 40;

const FOCUS_BANKS = {
  punctuation: {
    title: "Adaptive punctuation drill",
    tokens: ["wait,", "check,", "continue;", "pause:", "type.", "finish!", "yes?", "steady."]
  },
  numbers: {
    title: "Adaptive number-row drill",
    tokens: ["12", "24", "36", "48", "60", "72", "84", "96", "108", "120"]
  },
  rhythm: {
    title: "Adaptive rhythm drill",
    tokens: ["steady", "timing", "wins", "when", "every", "word", "lands", "evenly"]
  },
  speed: {
    title: "Adaptive speed ladder",
    tokens: ["fast", "calm", "hands", "build", "speed", "without", "forcing", "mistakes"]
  },
  accuracy: {
    title: "Adaptive accuracy reset",
    tokens: ["clean", "words", "first", "speed", "second", "rhythm", "always", "steady"]
  },
  spaces: {
    title: "Adaptive spacing drill",
    tokens: ["one", "space", "between", "words", "keeps", "phrases", "clean", "readable"]
  },
  uppercase: {
    title: "Adaptive capital timing drill",
    tokens: ["Ada", "Built", "Tools.", "Grace", "Shipped", "Compilers.", "Clean", "Caps."]
  },
  symbols: {
    title: "Adaptive symbol drill",
    tokens: ["@home", "#tag", "$cost", "%gain", "&join", "*mark", "+add", "=same"]
  }
};

const DEFAULT_FOCUS = {
  id: "accuracy",
  label: "Accuracy",
  source: "default"
};

function normalizeFocus(id, label, source) {
  const safeId = String(id ?? "").trim() || DEFAULT_FOCUS.id;
  return {
    id: safeId,
    label: String(label ?? safeId),
    source
  };
}

export function choosePracticeFocus({ profile = null, latestAnalysis = null } = {}) {
  const profileFocusId = profile?.nextAction?.focusId;
  if (profileFocusId && profileFocusId !== "baseline") {
    return normalizeFocus(profileFocusId, profile.nextAction.label, "profile");
  }

  const [latestWeakArea] = [...(latestAnalysis?.weakestAreas ?? [])]
    .toSorted((left, right) => (right.severity ?? 0) - (left.severity ?? 0));
  if (latestWeakArea?.id) {
    return normalizeFocus(latestWeakArea.id, latestWeakArea.label, "latest");
  }

  return DEFAULT_FOCUS;
}

function tokensForFocus(focus) {
  if (focus.id.startsWith("char:")) {
    const char = focus.id.slice("char:".length) || "e";
    return [char, `${char}${char}`, `${char}a`, `${char}e`, `${char}i`, `${char}o`, `${char}u`, `${char}${char}${char}`];
  }

  if (focus.id.startsWith("word:")) {
    const word = focus.id.slice("word:".length) || "practice";
    return [word, word, `${word},`, "again", "steady", "timing", word, "cleanly"];
  }

  const baseId = focus.id.replace(/Row|Hand$/, match => match === "Row" ? "row" : "hand");
  return FOCUS_BANKS[focus.id]?.tokens
    ?? FOCUS_BANKS[baseId]?.tokens
    ?? FOCUS_BANKS.accuracy.tokens;
}

function titleForFocus(focus) {
  if (focus.id.startsWith("char:")) return `Adaptive ${focus.label} drill`;
  if (focus.id.startsWith("word:")) return `Adaptive ${focus.label} repair`;
  return FOCUS_BANKS[focus.id]?.title ?? `Adaptive ${focus.label} drill`;
}

export function buildAdaptivePractice({ profile = null, latestAnalysis = null, wordCount = DEFAULT_WORD_COUNT } = {}) {
  const focus = choosePracticeFocus({ profile, latestAnalysis });
  const sourceTokens = tokensForFocus(focus);
  const count = Math.max(8, Math.min(120, Number(wordCount) || DEFAULT_WORD_COUNT));
  const tokens = Array.from({ length: count }, (_, index) => sourceTokens[index % sourceTokens.length]);
  const text = tokens.join(" ");

  return {
    title: titleForFocus(focus),
    focus,
    tokens,
    text,
    instruction: `Practice ${focus.label.toLowerCase()} with clean accuracy before increasing speed.`
  };
}
