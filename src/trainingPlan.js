function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeSession(session) {
  return {
    wpm: Number(session.wpm ?? session.netWpm ?? 0),
    accuracy: Number(session.accuracy ?? 0),
    consistency: Number(session.consistency ?? session.consistencyScore ?? 0),
    mistakes: Number(session.mistakes ?? session.incorrectChars ?? 0)
  };
}

export function summarizeHistory(history = []) {
  const sessions = history.map(normalizeSession).filter(session => session.wpm || session.accuracy);
  if (!sessions.length) {
    return {
      sessions: 0,
      averageWpm: 0,
      bestWpm: 0,
      averageAccuracy: 0,
      averageConsistency: 0,
      averageMistakes: 0,
      trend: {
        wpmDelta: 0,
        accuracyDelta: 0,
        direction: "new"
      }
    };
  }

  const first = sessions.at(0);
  const latest = sessions.at(-1);
  const wpmDelta = round(latest.wpm - first.wpm);
  const accuracyDelta = round(latest.accuracy - first.accuracy);

  return {
    sessions: sessions.length,
    averageWpm: round(average(sessions.map(session => session.wpm))),
    bestWpm: Math.max(...sessions.map(session => session.wpm)),
    averageAccuracy: round(average(sessions.map(session => session.accuracy))),
    averageConsistency: round(average(sessions.map(session => session.consistency))),
    averageMistakes: round(average(sessions.map(session => session.mistakes))),
    trend: {
      wpmDelta,
      accuracyDelta,
      direction: wpmDelta >= 3 || accuracyDelta >= 2 ? "improving" : wpmDelta <= -3 || accuracyDelta <= -2 ? "declining" : "steady"
    }
  };
}

function choosePrimaryGoal(latestAnalysis, summary) {
  const accuracy = Number(latestAnalysis?.accuracy ?? summary.averageAccuracy);
  const consistency = Number(latestAnalysis?.consistencyScore ?? summary.averageConsistency);
  const netWpm = Number(latestAnalysis?.netWpm ?? summary.averageWpm);

  if (accuracy < 96) {
    return {
      metric: "accuracy",
      current: round(accuracy),
      target: Math.max(96, round(accuracy + 3)),
      reason: "Accuracy below 96% costs more progress than raw speed."
    };
  }

  if (consistency < 80) {
    return {
      metric: "consistency",
      current: round(consistency),
      target: Math.max(82, round(consistency + 8)),
      reason: "Uneven rhythm usually creates late-session errors."
    };
  }

  return {
    metric: "speed",
    current: round(netWpm),
    target: Math.max(40, round(netWpm + 6)),
    reason: "Accuracy and rhythm are stable enough to push speed."
  };
}

const DEFAULT_FOCI = [
  { id: "accuracy", label: "Accuracy", evidence: "baseline" },
  { id: "rhythm", label: "Rhythm", evidence: "baseline" },
  { id: "speed", label: "Speed", evidence: "baseline" }
];

function drillTextForFocus(focus) {
  if (focus.id === "punctuation") return "wait, check, continue; pause, type, finish.";
  if (focus.id === "numbers") return "12 24 36 48 60 72 84 96 108 120";
  if (focus.id === "rhythm") return "steady timing wins when every word lands evenly";
  if (focus.id === "speed") return "fast calm hands build speed without forcing mistakes";
  if (focus.id?.startsWith("char:")) {
    const char = focus.id.slice("char:".length);
    return `${char} ${char}${char} ${char}a ${char}e ${char}i ${char}o`;
  }
  return "clean words first, speed second, rhythm always";
}

export function buildTrainingPlan({ latestAnalysis = {}, history = [] } = {}) {
  const summary = summarizeHistory(history);
  const primaryGoal = choosePrimaryGoal(latestAnalysis, summary);
  const weakAreas = latestAnalysis.weakestAreas?.length
    ? latestAnalysis.weakestAreas
    : DEFAULT_FOCI;
  const orderedFocus = [...weakAreas]
    .toSorted((left, right) => (right.severity ?? 0) - (left.severity ?? 0))
    .slice(0, 4);

  const sessions = Array.from({ length: 7 }, (_, index) => {
    const focus = orderedFocus[index % orderedFocus.length] ?? DEFAULT_FOCI[index % DEFAULT_FOCI.length];
    const isReview = index === 6;
    return {
      day: index + 1,
      focus: isReview ? "Benchmark review" : focus.label,
      minutes: isReview ? 12 : 15 + (index % 3) * 5,
      target: isReview
        ? `Retest and compare ${primaryGoal.metric}`
        : `Raise ${primaryGoal.metric} toward ${primaryGoal.target}`,
      drill: isReview ? "Run one clean timed test and export the result" : drillTextForFocus(focus)
    };
  });

  return {
    summary,
    primaryGoal,
    sessions,
    reviewChecklist: [
      `Compare ${primaryGoal.metric} against the ${primaryGoal.target} target.`,
      "Keep only drills that reduced mistakes or raised consistency.",
      "Export history before clearing or switching machines."
    ]
  };
}
