import { buildUserProfile } from "./profileCoach.js";
import { buildTrainingPlan } from "./trainingPlan.js";

function line(value, fallback = "Not enough data yet") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function metricLine(label, value, suffix = "") {
  return `- ${label}: ${line(value)}${suffix}`;
}

function formatWeakAreas(areas) {
  if (!areas.length) return "- No recurring weak area has enough evidence yet.";
  return areas
    .slice(0, 5)
    .map(area => `- ${area.label}: seen in ${area.sessionsSeen} sessions, priority ${area.priority}. Evidence: ${area.evidence}`)
    .join("\n");
}

function formatSessions(sessions) {
  return sessions
    .map(session => `- Day ${session.day}: ${session.focus} (${session.minutes} min). ${session.target}. Drill: ${session.drill}`)
    .join("\n");
}

function formatRecentHistory(history) {
  if (!history.length) return "- No saved runs yet.";
  return history
    .slice(0, 5)
    .map(entry => `- ${entry.timestamp}: ${entry.mode} - ${entry.wpm} WPM, ${entry.accuracy}% accuracy, ${entry.consistency} stability`)
    .join("\n");
}

export function buildCoachReport({ latestAnalysis = null, history = [], generatedAt = new Date().toISOString() } = {}) {
  const profile = buildUserProfile({ latestAnalysis, history });
  const plan = buildTrainingPlan({ latestAnalysis: latestAnalysis ?? {}, history });

  return [
    "# TypeSpeed Coach Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Summary",
    metricLine("Sessions analyzed", profile.summary.sessions),
    metricLine("Average WPM", profile.summary.averageWpm),
    metricLine("Best WPM", profile.summary.bestWpm),
    metricLine("Average accuracy", profile.summary.averageAccuracy, "%"),
    metricLine("Average stability", profile.summary.averageConsistency),
    metricLine("Practice minutes analyzed", profile.evidence.totalPracticeMinutes),
    "",
    "## Next Action",
    `Focus: ${line(profile.nextAction.label)}`,
    `Reason: ${line(profile.nextAction.reason)}`,
    `Drill: ${line(profile.nextAction.drillText)}`,
    "",
    "## Recurring Weak Areas",
    formatWeakAreas(profile.sustainedWeakAreas),
    "",
    "## Primary Goal",
    `Metric: ${line(plan.primaryGoal.metric)}`,
    `Current: ${line(plan.primaryGoal.current)}`,
    `Target: ${line(plan.primaryGoal.target)}`,
    `Reason: ${line(plan.primaryGoal.reason)}`,
    "",
    "## 7-Day Training Plan",
    formatSessions(plan.sessions),
    "",
    "## Recent History",
    formatRecentHistory(history),
    ""
  ].join("\n");
}

export function buildCoachReportFilename(timestamp = new Date().toISOString()) {
  return `typespeed-coach-report-${String(timestamp).replaceAll(":", "-").replaceAll(".", "-")}.md`;
}
