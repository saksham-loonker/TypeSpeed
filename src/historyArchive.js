import { normalizeHistoryEntry } from "./profileCoach.js";

const MAX_ARCHIVE_ENTRIES = 500;

function isValidTimestamp(timestamp) {
  return timestamp && Number.isFinite(Date.parse(timestamp));
}

function historyKey(entry) {
  return [
    entry.timestamp,
    entry.mode,
    entry.wpm,
    entry.accuracy,
    entry.consistency,
    entry.mistakes
  ].join("|");
}

function normalizeImportEntry(entry) {
  const normalized = normalizeHistoryEntry(entry);
  if (!isValidTimestamp(normalized.timestamp)) return null;
  if (!normalized.wpm && !normalized.accuracy) return null;
  return normalized;
}

function readArchiveArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.history)) return parsed.history;
  throw new Error("History archive must be a JSON history array.");
}

export function parseHistoryArchive(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch {
    throw new Error("History archive must be valid JSON.");
  }

  const rows = readArchiveArray(parsed).slice(0, MAX_ARCHIVE_ENTRIES);
  const entries = rows.map(normalizeImportEntry).filter(Boolean);

  return {
    entries,
    rejected: rows.length - entries.length
  };
}

export function mergeHistory({ existingHistory = [], importedHistory = [], limit = 100 } = {}) {
  const mergedByKey = new Map();
  const entries = [
    ...existingHistory.map(normalizeImportEntry).filter(Boolean),
    ...importedHistory.map(normalizeImportEntry).filter(Boolean)
  ];

  for (const entry of entries) {
    mergedByKey.set(historyKey(entry), entry);
  }

  return [...mergedByKey.values()]
    .toSorted((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, limit);
}
