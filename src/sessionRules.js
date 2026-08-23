const DIFFICULTIES = new Set(["normal", "hardcore", "master"]);
const MIN_PACE_WPM = 20;
const MAX_PACE_WPM = 240;
const MASTER_FADE_DISTANCE = 4;

export function normalizeDifficulty(value) {
  const normalized = String(value ?? "").toLowerCase();
  return DIFFICULTIES.has(normalized) ? normalized : "normal";
}

export function normalizePaceTarget(value) {
  if (value === null || value === undefined || value === "off") return null;
  const target = Number(value);
  if (!Number.isFinite(target) || target < MIN_PACE_WPM || target > MAX_PACE_WPM) {
    return null;
  }
  return Math.round(target);
}

export function shouldStopForHardcoreMistake({ difficulty, target, typed }) {
  if (normalizeDifficulty(difficulty) !== "hardcore") return false;
  const targetText = String(target ?? "");
  const typedText = String(typed ?? "");

  return [...typedText].some((char, index) => char !== targetText[index]);
}

export function buildTargetCharClass({ difficulty, index, targetChar, typed }) {
  const typedText = String(typed ?? "");
  if (index >= typedText.length) return "char pending";

  const classes = ["char", typedText[index] === targetChar ? "match" : "error"];
  const shouldFade = normalizeDifficulty(difficulty) === "master" && index < typedText.length - MASTER_FADE_DISTANCE;
  if (shouldFade) classes.push("faded");
  return classes.join(" ");
}

export function getProgressBucket(progress) {
  const value = Number(progress);
  if (!Number.isFinite(value)) return 0;

  const clamped = Math.min(100, Math.max(0, value));
  return Math.round(clamped / 5) * 5;
}

export function buildPaceGhost({ paceTargetWpm, elapsedMs, targetLength }) {
  const target = normalizePaceTarget(paceTargetWpm);
  const length = Math.max(1, Number(targetLength) || 1);
  if (!target) return null;

  const elapsedMinutes = Math.max(0, Number(elapsedMs) || 0) / 60_000;
  const expectedChars = target * 5 * elapsedMinutes;
  const progress = Math.min(100, Math.round((expectedChars / length) * 1000) / 10);

  return {
    id: "pace-ghost",
    name: `${target} WPM Ghost`,
    progress,
    wpm: target,
    accuracy: 100,
    finished: progress >= 100,
    isGhost: true
  };
}
