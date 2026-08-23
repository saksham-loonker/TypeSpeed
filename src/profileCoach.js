import { getExerciseBank } from "./typingAnalysis.js";
import { summarizeHistory } from "./trainingPlan.js";

const DEFAULT_PROFILE_LIMIT = 12;
const DEFAULT_ACTION = {
  focusId: "baseline",
  label: "Baseline benchmark",
  reason: "Complete a few more typing tests so TypeSpeed can separate one-off misses from persistent weak areas.",
  drillText: "type one normal timed test, then one accuracy-first test, then compare the result"
};

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeWeakArea(area) {
  const id = String(area?.id ?? "").trim();
  if (!id) return null;

  return {
    id,
    label: String(area?.label ?? id),
    severity: Math.max(0, toNumber(area?.severity)),
    evidence: String(area?.evidence ?? "No evidence recorded")
  };
}

export function normalizeHistoryEntry(entry = {}) {
  const weakestAreas = Array.isArray(entry.weakestAreas)
    ? entry.weakestAreas.map(normalizeWeakArea).filter(Boolean)
    : [];

  return {
    timestamp: String(entry.timestamp ?? ""),
    mode: String(entry.mode ?? "unknown"),
    wpm: toNumber(entry.wpm ?? entry.netWpm),
    rawWpm: toNumber(entry.rawWpm),
    accuracy: toNumber(entry.accuracy),
    consistency: toNumber(entry.consistency ?? entry.consistencyScore),
    mistakes: toNumber(entry.mistakes ?? entry.incorrectChars),
    durationMs: toNumber(entry.durationMs),
    weakestAreas
  };
}

function latestAnalysisToEntry(latestAnalysis) {
  if (!latestAnalysis || Object.keys(latestAnalysis).length === 0) return null;

  return normalizeHistoryEntry({
    timestamp: new Date().toISOString(),
    mode: "latest",
    wpm: latestAnalysis.netWpm ?? latestAnalysis.wpm,
    rawWpm: latestAnalysis.rawWpm,
    accuracy: latestAnalysis.accuracy,
    consistency: latestAnalysis.consistencyScore ?? latestAnalysis.consistency,
    mistakes: latestAnalysis.incorrectChars ?? latestAnalysis.mistakes,
    durationMs: latestAnalysis.durationMs,
    weakestAreas: latestAnalysis.weakestAreas ?? []
  });
}

function collectEntries({ latestAnalysis, history }) {
  const normalizedHistory = history.map(normalizeHistoryEntry).filter(entry => entry.wpm || entry.accuracy);
  const latestEntry = latestAnalysisToEntry(latestAnalysis);
  return latestEntry && (latestEntry.wpm || latestEntry.accuracy)
    ? [...normalizedHistory, latestEntry]
    : normalizedHistory;
}

function aggregateWeakAreas(entries) {
  const byId = new Map();

  for (const entry of entries) {
    for (const area of entry.weakestAreas.slice(0, 6)) {
      const current = byId.get(area.id) ?? {
        id: area.id,
        label: area.label,
        severityTotal: 0,
        sessionsSeen: 0,
        evidence: area.evidence
      };

      byId.set(area.id, {
        ...current,
        label: area.label || current.label,
        severityTotal: current.severityTotal + area.severity,
        sessionsSeen: current.sessionsSeen + 1,
        evidence: area.evidence || current.evidence
      });
    }
  }

  return [...byId.values()]
    .map(area => ({
      id: area.id,
      label: area.label,
      averageSeverity: round(area.severityTotal / Math.max(1, area.sessionsSeen)),
      sessionsSeen: area.sessionsSeen,
      priority: round(area.severityTotal * (1 + area.sessionsSeen / Math.max(1, entries.length))),
      evidence: area.evidence
    }))
    .toSorted((left, right) => right.priority - left.priority || right.sessionsSeen - left.sessionsSeen)
    .slice(0, 6);
}

function detectPlateau(entries) {
  if (entries.length < 6) {
    return {
      speed: false,
      accuracy: false,
      reason: "Need at least 6 saved sessions to detect plateaus reliably."
    };
  }

  const recent = entries.slice(-3);
  const previous = entries.slice(-6, -3);
  const recentWpm = average(recent.map(entry => entry.wpm));
  const previousWpm = average(previous.map(entry => entry.wpm));
  const recentAccuracy = average(recent.map(entry => entry.accuracy));
  const previousAccuracy = average(previous.map(entry => entry.accuracy));
  const speedDelta = round(recentWpm - previousWpm);
  const accuracyDelta = round(recentAccuracy - previousAccuracy);

  return {
    speed: Math.abs(speedDelta) < 1.5,
    accuracy: Math.abs(accuracyDelta) < 0.8,
    speedDelta,
    accuracyDelta,
    reason: `Recent 3-session delta: ${speedDelta} WPM, ${accuracyDelta}% accuracy.`
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function drillTextForFocus(focusId) {
  const bank = getExerciseBank();
  if (focusId === "punctuation") return "wait, check, continue; pause, type, finish.";
  if (focusId === "speed") return "fast calm hands build speed without forcing mistakes";
  if (focusId === "rhythm") return bank.rhythm.text;
  if (focusId?.startsWith("char:")) {
    const char = focusId.slice("char:".length);
    return `${char} ${char}${char} ${char}a ${char}e ${char}i ${char}o ${char}u`;
  }
  if (focusId?.startsWith("word:")) {
    const word = focusId.slice("word:".length);
    return `${word} ${word} ${word}, then ${word} again with steady timing.`;
  }
  return bank[focusId]?.text ?? bank.accuracy.text;
}

function chooseNextAction({ sustainedWeakAreas, plateau, entries }) {
  if (sustainedWeakAreas.length) {
    const focus = sustainedWeakAreas[0];
    return {
      focusId: focus.id,
      label: focus.label,
      reason: `${focus.label} appeared in ${focus.sessionsSeen} of ${entries.length} sessions; latest evidence: ${focus.evidence}.`,
      drillText: drillTextForFocus(focus.id)
    };
  }

  if (plateau.speed) {
    return {
      focusId: "speed",
      label: "Speed plateau",
      reason: `Your speed has flattened. ${plateau.reason}`,
      drillText: drillTextForFocus("speed")
    };
  }

  if (plateau.accuracy) {
    return {
      focusId: "accuracy",
      label: "Accuracy plateau",
      reason: `Your accuracy has flattened. ${plateau.reason}`,
      drillText: drillTextForFocus("accuracy")
    };
  }

  return DEFAULT_ACTION;
}

export function buildUserProfile({ latestAnalysis = null, history = [], limit = DEFAULT_PROFILE_LIMIT } = {}) {
  const entries = collectEntries({ latestAnalysis, history }).slice(-limit);
  const summary = summarizeHistory(entries);
  const sustainedWeakAreas = aggregateWeakAreas(entries);
  const plateau = detectPlateau(entries);
  const nextAction = chooseNextAction({ sustainedWeakAreas, plateau, entries });

  return {
    summary,
    sustainedWeakAreas,
    plateau,
    nextAction,
    evidence: {
      sessionsAnalyzed: entries.length,
      totalPracticeMinutes: round(entries.reduce((total, entry) => total + entry.durationMs, 0) / 60_000)
    }
  };
}
