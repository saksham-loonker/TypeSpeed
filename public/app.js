import { PASSAGES, getPassageById } from "/src/passages.js";
import { analyzeTypingSession, buildFeedback, generateExercises } from "/src/typingAnalysis.js";
import { buildTrainingPlan } from "/src/trainingPlan.js";
import { buildUserProfile } from "/src/profileCoach.js";
import { mergeHistory, parseHistoryArchive } from "/src/historyArchive.js";
import { buildCoachReport, buildCoachReportFilename } from "/src/coachReport.js";
import { buildAdaptivePractice } from "/src/adaptivePractice.js";
import {
  buildKeyboardRenderKey,
  buildKeyboardRows,
  recordKeyStat,
  summarizeHandWorkload
} from "/src/keyboardModel.js";
import {
  buildPaceGhost,
  buildTargetCharClass,
  getProgressBucket,
  normalizeDifficulty,
  normalizePaceTarget,
  shouldStopForHardcoreMistake
} from "/src/sessionRules.js";

const STORAGE_KEYS = {
  theme: "typespeed_theme",
  sound: "typespeed_sound",
  volume: "typespeed_volume",
  pitch: "typespeed_pitch",
  difficulty: "typespeed_difficulty",
  pace: "typespeed_pace",
  xp: "typespeed_xp",
  level: "typespeed_level",
  history: "typespeed_history",
  failures: "typespeed_failures_map",
  successes: "typespeed_success_map"
};
const ROOM_SESSION_STORAGE_KEY = "typespeed_room_session";

const WORD_POOL = [
  "adaptive", "analysis", "balance", "baseline", "cadence", "control", "debug",
  "deliberate", "efficient", "feedback", "finger", "focus", "latency", "metric",
  "network", "passage", "precision", "practice", "profile", "rhythm", "secure",
  "signal", "steady", "training", "typing", "useful", "verified", "workflow"
];

const elements = {
  themeSelect: byId("themeSelect"),
  soundSelect: byId("soundSelect"),
  volumeSlider: byId("volumeSlider"),
  pitchSlider: byId("pitchSlider"),
  zenModeToggle: byId("zenModeToggle"),
  playerLvlValue: byId("playerLvlValue"),
  xpTextValue: byId("xpTextValue"),
  xpLevelFill: byId("xpLevelFill"),
  difficultySelect: byId("difficultySelect"),
  paceSelect: byId("paceSelect"),
  metronomeToggle: byId("metronomeToggle"),
  metronomeBpm: byId("metronomeBpm"),
  sandboxTextPaste: byId("sandboxTextPaste"),
  sandboxApplyBtn: byId("sandboxApplyBtn"),
  passageSelect: byId("passageSelect"),
  streakFireBadge: byId("streakFireBadge"),
  timeValue: byId("timeValue"),
  netWpmValue: byId("netWpmValue"),
  accuracyValue: byId("accuracyValue"),
  consistencyValue: byId("consistencyValue"),
  liveSparkline: byId("liveSparkline"),
  focusBlurOverlay: byId("focusBlurOverlay"),
  targetText: byId("targetText"),
  typingInput: byId("typingInput"),
  resetButton: byId("resetButton"),
  finishButton: byId("finishButton"),
  metricGrid: byId("metricGrid"),
  weaknessList: byId("weaknessList"),
  feedbackList: byId("feedbackList"),
  resultsModal: byId("resultsModal"),
  closeResultsButton: byId("closeResultsButton"),
  resNetWpm: byId("resNetWpm"),
  resAccuracy: byId("resAccuracy"),
  resConsistency: byId("resConsistency"),
  resMistakes: byId("resMistakes"),
  aiPredictValue: byId("aiPredictValue"),
  leftHandVal: byId("leftHandVal"),
  leftHandFill: byId("leftHandFill"),
  rightHandVal: byId("rightHandVal"),
  rightHandFill: byId("rightHandFill"),
  wpmChart: byId("wpmChart"),
  badgeRow: byId("badgeRow"),
  modalExercises: byId("modalExercises"),
  modalResetBtn: byId("modalResetBtn"),
  exportCsvBtn: byId("exportCsvBtn"),
  exportJsonBtn: byId("exportJsonBtn"),
  kbLayoutSelect: byId("kbLayoutSelect"),
  kbFingerGuides: byId("kbFingerGuides"),
  kbHeatmapToggle: byId("kbHeatmapToggle"),
  kbClearHeatmapBtn: byId("kbClearHeatmapBtn"),
  visualKeyboardKeys: byId("visualKeyboardKeys"),
  playerNameInput: byId("playerNameInput"),
  roomCodeInput: byId("roomCodeInput"),
  hostButton: byId("hostButton"),
  joinButton: byId("joinButton"),
  startRoomButton: byId("startRoomButton"),
  roomCard: byId("roomCard"),
  activeRoomCode: byId("activeRoomCode"),
  copyShareButton: byId("copyShareButton"),
  leaderboard: byId("leaderboard"),
  racetrackContainer: byId("racetrackContainer"),
  raceLanes: byId("raceLanes"),
  avatarStrip: byId("avatarStrip"),
  networkInfo: byId("networkInfo"),
  roomMessageList: byId("roomMessageList"),
  sessionStatus: byId("sessionStatus"),
  exerciseList: byId("exerciseList"),
  trainingPlanList: byId("trainingPlanList"),
  coachProfileList: byId("coachProfileList"),
  adaptivePracticeBtn: byId("adaptivePracticeBtn"),
  exportReportBtn: byId("exportReportBtn"),
  importHistoryBtn: byId("importHistoryBtn"),
  historyImportInput: byId("historyImportInput"),
  clearHistoryBtn: byId("clearHistoryBtn"),
  historyList: byId("historyList")
};

const state = {
  mode: "time",
  duration: 30,
  wordsCount: 25,
  passageId: PASSAGES[0]?.id ?? "balanced-1",
  customText: "",
  activeText: "",
  typed: "",
  events: [],
  startedAt: null,
  endedAt: null,
  finished: false,
  timerId: null,
  metronomeId: null,
  difficulty: "normal",
  paceTargetWpm: null,
  lastInputLength: 0,
  comboStreak: 0,
  maxStreak: 0,
  timelineWpm: [],
  keyFailuresMap: safeReadJson(STORAGE_KEYS.failures, {}),
  keySuccessMap: safeReadJson(STORAGE_KEYS.successes, {}),
  keyboardStatsVersion: 0,
  keyboardRenderKey: "",
  audioContext: null,
  room: null,
  playerId: "",
  playerToken: "",
  shareUrl: "",
  isHost: false,
  roomEvents: null,
  pollId: null,
  progressId: null,
  modalReturnFocus: null,
  statusMessage: ""
};

function byId(id) {
  return document.getElementById(id);
}

function safeReadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    setStatus("Local storage is unavailable; this run will not be persisted.");
  }
}

function safeReadNumber(key, fallback) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
}

function readRoomSession() {
  try {
    const raw = sessionStorage.getItem(ROOM_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    const code = String(session.code ?? "").toUpperCase();
    const playerId = String(session.playerId ?? "");
    const playerToken = String(session.playerToken ?? "");
    if (!/^[A-Z0-9]{4,8}$/.test(code) || !playerId || !playerToken) return null;

    return {
      code,
      playerId,
      playerToken,
      isHost: Boolean(session.isHost),
      shareUrl: String(session.shareUrl ?? "")
    };
  } catch {
    return null;
  }
}

function persistRoomSession({ room, playerId, playerToken, isHost, shareUrl = "" }) {
  if (!room?.code || !playerId || !playerToken) return;
  try {
    sessionStorage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify({
      code: room.code,
      playerId,
      playerToken,
      isHost: Boolean(isHost),
      shareUrl
    }));
  } catch {
    setStatus("Room session restore is unavailable in this browser.");
  }
}

function clearRoomSession() {
  try {
    sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage-denied browsers; the in-memory session will still work.
  }
}

function createNode(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value !== false && value !== null && value !== undefined) {
        node.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

function setText(node, value) {
  if (node) node.textContent = String(value);
}

function setStatus(message) {
  state.statusMessage = message;
  setText(elements.sessionStatus, message || getSessionStatus());
}

function showResultsModal() {
  if (!elements.resultsModal) return;
  const activeElement = document.activeElement;
  state.modalReturnFocus = activeElement && typeof activeElement.focus === "function" ? activeElement : null;
  elements.resultsModal.hidden = false;
  elements.closeResultsButton?.focus();
}

function hideResultsModal(options = {}) {
  if (!elements.resultsModal) return;
  const restoreFocus = options.restoreFocus !== false;
  elements.resultsModal.hidden = true;

  if (restoreFocus) {
    const focusTarget = state.modalReturnFocus ?? elements.typingInput;
    focusTarget?.focus?.();
  }

  state.modalReturnFocus = null;
}

function getSessionStatus() {
  if (state.room) return `Room ${state.room.code} ${state.room.status}`;
  if (state.finished) return "Solo lab complete";
  if (state.startedAt) return "Solo lab running";
  return "Solo lab ready";
}

function getNow() {
  return Date.now();
}

function getElapsedMs() {
  if (!state.startedAt) return 0;
  return Math.max(0, (state.endedAt ?? getNow()) - state.startedAt);
}

function getRemainingSeconds() {
  if (state.mode !== "time") return getElapsedMs() / 1000;
  return Math.max(0, state.duration - getElapsedMs() / 1000);
}

function buildRandomText(wordCount) {
  return Array.from({ length: wordCount }, (_, index) => {
    const word = WORD_POOL[(Math.floor(Math.random() * WORD_POOL.length) + index) % WORD_POOL.length];
    return index % 13 === 0 ? `${word}.` : word;
  }).join(" ");
}

function buildTextForCurrentMode() {
  if (state.customText) return state.customText;
  if (state.mode === "quote") return getPassageById(state.passageId).text;
  if (state.mode === "words") return buildRandomText(state.wordsCount);
  return buildRandomText(70);
}

function getEffectiveTarget() {
  if (state.finished) return state.activeText;
  const length = Math.max(1, Math.min(state.activeText.length, state.typed.length));
  return state.activeText.slice(0, length);
}

function getAnalysis(useFullTarget = state.finished) {
  return analyzeTypingSession({
    target: useFullTarget ? state.activeText : getEffectiveTarget(),
    typed: state.typed,
    events: state.events,
    durationMs: getElapsedMs()
  });
}

function initialize() {
  registerServiceWorker();
  loadPreferences();
  populatePassageSelect();
  bindEvents();
  hydrateRoomCodeFromUrl();
  refreshNetworkInfo();
  resetTest();
  renderKeyboard();
  renderHistory();
  restoreRoomSession();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      setStatus("Offline cache is unavailable in this browser.");
    });
  });
}

function loadPreferences() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || "carbon";
  document.documentElement.setAttribute("data-theme", theme);
  if (elements.themeSelect) elements.themeSelect.value = theme;
  if (elements.soundSelect) elements.soundSelect.value = localStorage.getItem(STORAGE_KEYS.sound) || "mute";
  if (elements.volumeSlider) elements.volumeSlider.value = localStorage.getItem(STORAGE_KEYS.volume) || "0.5";
  if (elements.pitchSlider) elements.pitchSlider.value = localStorage.getItem(STORAGE_KEYS.pitch) || "1.0";
  state.difficulty = normalizeDifficulty(localStorage.getItem(STORAGE_KEYS.difficulty));
  state.paceTargetWpm = normalizePaceTarget(localStorage.getItem(STORAGE_KEYS.pace));
  if (elements.difficultySelect) elements.difficultySelect.value = state.difficulty;
  if (elements.paceSelect) elements.paceSelect.value = state.paceTargetWpm ? String(state.paceTargetWpm) : "off";
  renderProgression();
}

function renderProgression() {
  const level = Math.max(1, safeReadNumber(STORAGE_KEYS.level, 1));
  const xp = Math.max(0, safeReadNumber(STORAGE_KEYS.xp, 0));
  const required = level * 250;
  setText(elements.playerLvlValue, level);
  setText(elements.xpTextValue, `${xp} / ${required} XP`);
  if (elements.xpLevelFill) {
    elements.xpLevelFill.value = Math.min(100, (xp / required) * 100);
  }
}

function addXp(amount) {
  let level = Math.max(1, safeReadNumber(STORAGE_KEYS.level, 1));
  let xp = Math.max(0, safeReadNumber(STORAGE_KEYS.xp, 0)) + amount;
  let required = level * 250;
  let leveled = false;
  while (xp >= required) {
    xp -= required;
    level += 1;
    required = level * 250;
    leveled = true;
  }
  localStorage.setItem(STORAGE_KEYS.level, String(level));
  localStorage.setItem(STORAGE_KEYS.xp, String(xp));
  renderProgression();
  if (leveled) setStatus(`Level ${level} reached.`);
}

function populatePassageSelect() {
  if (!elements.passageSelect) return;
  elements.passageSelect.replaceChildren(
    ...PASSAGES.map(passage => createNode("option", {
      text: `${passage.title} (${passage.level ?? "Mixed"})`,
      attrs: { value: passage.id }
    }))
  );
  elements.passageSelect.value = state.passageId;
}

function bindEvents() {
  elements.themeSelect?.addEventListener("change", event => {
    const theme = event.target.value;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  });

  elements.soundSelect?.addEventListener("change", event => localStorage.setItem(STORAGE_KEYS.sound, event.target.value));
  elements.volumeSlider?.addEventListener("change", event => localStorage.setItem(STORAGE_KEYS.volume, event.target.value));
  elements.pitchSlider?.addEventListener("change", event => localStorage.setItem(STORAGE_KEYS.pitch, event.target.value));
  elements.difficultySelect?.addEventListener("change", event => {
    state.difficulty = normalizeDifficulty(event.target.value);
    localStorage.setItem(STORAGE_KEYS.difficulty, state.difficulty);
    resetTest();
    setStatus(`${state.difficulty} difficulty active.`);
  });
  elements.paceSelect?.addEventListener("change", event => {
    state.paceTargetWpm = normalizePaceTarget(event.target.value);
    localStorage.setItem(STORAGE_KEYS.pace, state.paceTargetWpm ? String(state.paceTargetWpm) : "off");
    renderRace();
    setStatus(state.paceTargetWpm ? `${state.paceTargetWpm} WPM ghost enabled.` : "Ghost benchmark disabled.");
  });
  elements.zenModeToggle?.addEventListener("click", () => {
    document.body.classList.toggle("zen-focus-mode");
    elements.typingInput?.focus();
  });

  elements.focusBlurOverlay?.addEventListener("click", () => {
    elements.focusBlurOverlay.classList.add("hidden");
    elements.typingInput?.focus();
  });
  elements.typingInput?.addEventListener("focus", () => elements.focusBlurOverlay?.classList.add("hidden"));
  elements.typingInput?.addEventListener("blur", () => {
    if (!state.finished) elements.focusBlurOverlay?.classList.remove("hidden");
  });

  document.querySelectorAll("[data-mode]").forEach(button => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      state.customText = "";
      resetTest();
    });
  });

  document.querySelectorAll("#configGroup-time .tab-pill").forEach(button => {
    button.addEventListener("click", () => {
      state.duration = Number(button.dataset.value);
      resetTest();
    });
  });

  document.querySelectorAll("#configGroup-words .tab-pill").forEach(button => {
    button.addEventListener("click", () => {
      state.wordsCount = Number(button.dataset.value);
      resetTest();
    });
  });

  elements.passageSelect?.addEventListener("change", event => {
    state.passageId = event.target.value;
    state.customText = "";
    state.mode = "quote";
    resetTest();
  });

  elements.sandboxApplyBtn?.addEventListener("click", () => {
    const value = elements.sandboxTextPaste?.value.trim() ?? "";
    if (value.length < 6 || value.length > 1200) {
      setStatus("Custom text must be between 6 and 1200 characters.");
      return;
    }
    state.customText = value;
    resetTest({ text: value });
    elements.typingInput?.focus();
  });

  elements.metronomeToggle?.addEventListener("change", syncMetronome);
  elements.metronomeBpm?.addEventListener("change", syncMetronome);
  elements.kbLayoutSelect?.addEventListener("change", renderKeyboard);
  elements.kbFingerGuides?.addEventListener("change", renderKeyboard);
  elements.kbHeatmapToggle?.addEventListener("change", renderKeyboard);
  elements.kbClearHeatmapBtn?.addEventListener("click", () => {
    state.keyFailuresMap = {};
    state.keySuccessMap = {};
    state.keyboardStatsVersion += 1;
    state.keyboardRenderKey = "";
    safeWriteJson(STORAGE_KEYS.failures, {});
    safeWriteJson(STORAGE_KEYS.successes, {});
    renderKeyboard(true);
  });

  elements.resetButton?.addEventListener("click", () => resetTest());
  elements.finishButton?.addEventListener("click", () => finishTest());
  elements.closeResultsButton?.addEventListener("click", () => hideResultsModal());
  elements.modalResetBtn?.addEventListener("click", () => {
    hideResultsModal({ restoreFocus: false });
    resetTest();
    elements.typingInput?.focus();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && elements.resultsModal && !elements.resultsModal.hidden) {
      hideResultsModal();
    }
  });

  elements.typingInput?.addEventListener("keydown", handleKeyDown);
  elements.typingInput?.addEventListener("input", handleInput);
  elements.exportCsvBtn?.addEventListener("click", exportCsv);
  elements.exportJsonBtn?.addEventListener("click", exportJson);
  elements.adaptivePracticeBtn?.addEventListener("click", startAdaptivePractice);
  elements.exportReportBtn?.addEventListener("click", exportCoachReport);
  elements.clearHistoryBtn?.addEventListener("click", () => {
    safeWriteJson(STORAGE_KEYS.history, []);
    renderHistory();
    setStatus("History cleared.");
  });
  elements.importHistoryBtn?.addEventListener("click", () => {
    elements.historyImportInput?.click();
  });
  elements.historyImportInput?.addEventListener("change", importHistoryFromFile);

  elements.hostButton?.addEventListener("click", hostRoom);
  elements.joinButton?.addEventListener("click", joinRoom);
  elements.startRoomButton?.addEventListener("click", startRoom);
  elements.copyShareButton?.addEventListener("click", copyShareUrl);

  document.querySelectorAll("[data-send-reaction]").forEach(button => {
    button.addEventListener("click", () => sendRoomMessage("reaction", button.dataset.sendReaction ?? ""));
  });
  document.querySelectorAll("[data-lobby-chat]").forEach(button => {
    button.addEventListener("click", () => sendRoomMessage("chat", button.dataset.lobbyChat ?? ""));
  });
}

function renderConfigState() {
  document.querySelectorAll("[data-mode]").forEach(button => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".sub-config").forEach(group => group.classList.add("hidden"));
  byId(`configGroup-${state.mode}`)?.classList.remove("hidden");
  document.querySelectorAll("#configGroup-time .tab-pill").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.value) === state.duration);
  });
  document.querySelectorAll("#configGroup-words .tab-pill").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.value) === state.wordsCount);
  });
}

function handleKeyDown(event) {
  if (state.finished) return;
  playKeySound(event.key);
  if (event.key === "Backspace") state.events.push({ type: "keydown", key: "Backspace", timestamp: getNow(), valueLength: elements.typingInput.value.length });
  if (event.key.length === 1) state.events.push({ type: "keydown", key: event.key, timestamp: getNow(), valueLength: elements.typingInput.value.length + 1 });
}

function handleInput() {
  if (state.finished) {
    elements.typingInput.value = state.typed;
    return;
  }
  if (!state.startedAt) startTest();
  const typed = elements.typingInput.value;
  updateKeyHeatmap(typed);
  state.typed = typed;
  state.lastInputLength = typed.length;
  state.comboStreak = calculateTrailingCorrectStreak(typed, state.activeText);
  state.maxStreak = Math.max(state.maxStreak, state.comboStreak);
  renderLive();
  if (shouldStopForHardcoreMistake({ difficulty: state.difficulty, target: state.activeText, typed })) {
    setStatus("Hardcore stopped on the first mistake.");
    finishTest();
    return;
  }
  if (typed.length >= state.activeText.length) finishTest();
}

function updateKeyHeatmap(typed) {
  if (typed.length <= state.lastInputLength) return;
  const index = typed.length - 1;
  const expected = state.activeText[index];
  const actual = typed[index];
  const result = recordKeyStat({
    successes: state.keySuccessMap,
    failures: state.keyFailuresMap,
    expected,
    actual,
    statsVersion: state.keyboardStatsVersion
  });
  if (result.statsVersion === state.keyboardStatsVersion) return;
  state.keySuccessMap = result.successes;
  state.keyFailuresMap = result.failures;
  state.keyboardStatsVersion = result.statsVersion;
  safeWriteJson(STORAGE_KEYS.successes, state.keySuccessMap);
  safeWriteJson(STORAGE_KEYS.failures, state.keyFailuresMap);
}

function calculateTrailingCorrectStreak(typed, target) {
  let streak = 0;
  for (let index = typed.length - 1; index >= 0; index -= 1) {
    if (typed[index] !== target[index]) break;
    streak += 1;
  }
  return streak;
}

function startTest() {
  state.startedAt = getNow();
  state.endedAt = null;
  state.finished = false;
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = window.setInterval(tick, 250);
  syncMetronome();
  setStatus(getSessionStatus());
}

function tick() {
  if (state.finished) return;
  const analysis = getAnalysis(false);
  state.timelineWpm.push(analysis.netWpm);
  if (state.timelineWpm.length > 120) state.timelineWpm.shift();
  if (state.mode === "time" && getRemainingSeconds() <= 0) {
    finishTest();
    return;
  }
  renderLive();
}

function finishTest() {
  if (state.finished) return;
  state.finished = true;
  state.endedAt = getNow();
  if (state.timerId) window.clearInterval(state.timerId);
  if (state.metronomeId) window.clearInterval(state.metronomeId);
  state.timerId = null;
  state.metronomeId = null;
  elements.typingInput?.blur();
  const analysis = getAnalysis(true);
  addXp(Math.max(1, Math.round(analysis.netWpm * (analysis.accuracy / 100))));
  saveHistory(analysis);
  renderLive();
  renderResults(analysis);
  sendProgress(true);
  setStatus(getSessionStatus());
}

function resetTest(options = {}) {
  if (state.timerId) window.clearInterval(state.timerId);
  if (state.metronomeId) window.clearInterval(state.metronomeId);
  state.timerId = null;
  state.metronomeId = null;
  state.activeText = options.text ?? buildTextForCurrentMode();
  state.typed = "";
  state.events = [];
  state.startedAt = null;
  state.endedAt = null;
  state.finished = false;
  state.lastInputLength = 0;
  state.comboStreak = 0;
  state.maxStreak = 0;
  state.timelineWpm = [];
  if (elements.typingInput) elements.typingInput.value = "";
  hideResultsModal({ restoreFocus: false });
  renderConfigState();
  renderLive();
  setStatus(getSessionStatus());
}

function renderLive() {
  const analysis = getAnalysis(false);
  renderTargetText();
  renderHud(analysis);
  renderProfiler(analysis);
  renderExercises(analysis);
  renderKeyboard();
  renderRace();
  drawSparkline(elements.liveSparkline, state.timelineWpm);
}

function renderTargetText() {
  if (!elements.targetText) return;
  const caret = createNode("div", { className: "caret", attrs: { id: "caret", "aria-hidden": "true" } });
  const typed = state.typed;
  const chars = [...state.activeText].map((char, index) => {
    const className = buildTargetCharClass({
      difficulty: state.difficulty,
      index,
      targetChar: char,
      typed
    });
    return createNode("span", { className, text: char });
  });
  elements.targetText.replaceChildren(caret, ...chars);
}

function renderHud(analysis) {
  setText(elements.sessionStatus, state.statusMessage || getSessionStatus());
  setText(elements.timeValue, state.mode === "time" ? `${getRemainingSeconds().toFixed(1)}s` : `${getRemainingSeconds().toFixed(1)}s`);
  setText(elements.netWpmValue, analysis.netWpm);
  setText(elements.accuracyValue, `${analysis.accuracy}%`);
  setText(elements.consistencyValue, analysis.consistencyScore);
  if (elements.streakFireBadge) {
    elements.streakFireBadge.textContent = `${state.comboStreak}`;
    elements.streakFireBadge.classList.toggle("hidden", state.comboStreak < 10);
  }
}

function renderProfiler(analysis) {
  const metrics = [
    ["Raw WPM", analysis.rawWpm],
    ["CPM", analysis.cpm],
    ["Burst", analysis.burstWpm],
    ["Word Acc", `${analysis.wordAccuracy}%`],
    ["Backspaces", analysis.backspaces],
    ["Correction Rate", `${analysis.backspaceRate}%`],
    ["Pauses", analysis.pauses],
    ["Latency", `${analysis.meanLatencyMs}ms`]
  ];
  elements.metricGrid?.replaceChildren(...metrics.map(([label, value]) => createNode("div", { className: "metric-card" }, [
    createNode("span", { className: "metric-label", text: label }),
    createNode("strong", { text: value })
  ])));

  const weaknesses = analysis.weakestAreas.length ? analysis.weakestAreas : [{ label: "Balanced", evidence: "No obvious weakness yet", severity: 0 }];
  elements.weaknessList?.replaceChildren(...weaknesses.slice(0, 6).map(item => createNode("li", { className: "weakness-item" }, [
    createNode("div", {}, [
      createNode("strong", { text: item.label }),
      createNode("p", { text: item.evidence })
    ]),
    createNode("span", { className: "weakness-score", text: item.severity })
  ])));

  elements.feedbackList?.replaceChildren(...buildFeedback(analysis).map(item => createNode("article", { className: "feedback-item" }, [
    createNode("strong", { text: item.title }),
    createNode("p", { text: item.message })
  ])));
}

function renderExercises(analysis) {
  const drills = generateExercises(analysis.weakestAreas, analysis);
  const rows = drills.map(drill => {
    const button = createNode("button", { className: "secondary-button small", text: "Use drill", attrs: { type: "button" } });
    button.addEventListener("click", () => {
      state.customText = drill.text;
      resetTest({ text: drill.text });
      elements.typingInput?.focus();
    });
    return createNode("article", { className: "exercise-item" }, [
      createNode("div", {}, [
        createNode("strong", { text: drill.title }),
        createNode("p", { text: drill.focus })
      ]),
      createNode("code", { text: drill.text }),
      button
    ]);
  });
  elements.exerciseList?.replaceChildren(...rows);
  renderTrainingPlan(analysis);
}

function renderTrainingPlan(analysis) {
  if (!elements.trainingPlanList) return;
  const plan = buildTrainingPlan({
    latestAnalysis: analysis,
    history: safeReadJson(STORAGE_KEYS.history, [])
  });

  const goal = createNode("article", { className: "training-plan-item" }, [
    createNode("strong", { text: `Goal: ${plan.primaryGoal.metric} ${plan.primaryGoal.current} -> ${plan.primaryGoal.target}` }),
    createNode("p", { text: plan.primaryGoal.reason })
  ]);

  const sessions = plan.sessions.slice(0, 4).map(session => createNode("article", { className: "training-plan-item" }, [
    createNode("strong", { text: `Day ${session.day}: ${session.focus}` }),
    createNode("p", { text: `${session.minutes} min - ${session.target}` }),
    createNode("code", { text: session.drill })
  ]));

  elements.trainingPlanList.replaceChildren(goal, ...sessions);
}

function renderResults(analysis) {
  setText(elements.resNetWpm, analysis.netWpm);
  setText(elements.resAccuracy, `${analysis.accuracy}%`);
  setText(elements.resConsistency, analysis.consistencyScore);
  setText(elements.resMistakes, analysis.incorrectChars);
  setText(elements.aiPredictValue, `Next target: ${Math.max(20, Math.round(analysis.netWpm * 1.08))} WPM`);
  renderHandWorkload();
  renderBadges(analysis);
  renderModalDrills(analysis);
  drawSparkline(elements.wpmChart, state.timelineWpm);
  showResultsModal();
}

function renderHandWorkload() {
  const { left, right } = summarizeHandWorkload(state.typed);
  setText(elements.leftHandVal, `${left}%`);
  setText(elements.rightHandVal, `${right}%`);
  if (elements.leftHandFill) elements.leftHandFill.value = left;
  if (elements.rightHandFill) elements.rightHandFill.value = right;
}

function renderBadges(analysis) {
  const badges = [
    ["Accuracy", analysis.accuracy >= 98],
    ["Speed", analysis.netWpm >= 70],
    ["Rhythm", analysis.consistencyScore >= 85],
    ["Streak", state.maxStreak >= 40]
  ];
  elements.badgeRow?.replaceChildren(...badges.map(([label, unlocked]) => createNode("div", {
    className: `badge-svg ${unlocked ? "unlocked" : ""}`,
    text: label,
    attrs: { title: unlocked ? `${label} unlocked` : `${label} locked` }
  })));
}

function renderModalDrills(analysis) {
  const drills = generateExercises(analysis.weakestAreas, analysis).slice(0, 3);
  elements.modalExercises?.replaceChildren(...drills.map(drill => {
    const button = createNode("button", { className: "primary-button small", text: "Train", attrs: { type: "button" } });
    button.addEventListener("click", () => {
      hideResultsModal({ restoreFocus: false });
      state.customText = drill.text;
      resetTest({ text: drill.text });
      elements.typingInput?.focus();
    });
    return createNode("div", { className: "modal-drill-item" }, [
      createNode("span", { text: drill.title }),
      button
    ]);
  }));
}

function renderKeyboard(options = {}) {
  if (!elements.visualKeyboardKeys) return;
  const force = options === true || options?.force === true;
  const layoutName = elements.kbLayoutSelect?.value ?? "qwerty";
  const showGuides = Boolean(elements.kbFingerGuides?.checked);
  const showHeatmap = Boolean(elements.kbHeatmapToggle?.checked);
  const renderKey = buildKeyboardRenderKey({
    layoutName,
    showGuides,
    showHeatmap,
    statsVersion: state.keyboardStatsVersion
  });

  if (!force && state.keyboardRenderKey === renderKey) return;
  state.keyboardRenderKey = renderKey;

  const keyboardRows = buildKeyboardRows({
    layoutName,
    showGuides,
    showHeatmap,
    successes: state.keySuccessMap,
    failures: state.keyFailuresMap
  });
  const rows = keyboardRows.map(row => createNode("div", { className: "keyboard-row" }, row.map(key => (
    createNode("div", { className: key.classes.join(" "), text: key.label, attrs: { "data-key": key.key } })
  ))));
  elements.visualKeyboardKeys.replaceChildren(...rows);
}

function saveHistory(analysis) {
  const history = safeReadJson(STORAGE_KEYS.history, []);
  safeWriteJson(STORAGE_KEYS.history, [
    {
      timestamp: new Date().toISOString(),
      mode: state.mode,
      wpm: analysis.netWpm,
      rawWpm: analysis.rawWpm,
      accuracy: analysis.accuracy,
      consistency: analysis.consistencyScore,
      mistakes: analysis.incorrectChars,
      durationMs: analysis.durationMs,
      weakestAreas: analysis.weakestAreas.slice(0, 6).map(area => ({
        id: area.id,
        label: area.label,
        severity: area.severity,
        evidence: area.evidence
      }))
    },
    ...history
  ].slice(0, 100));
  renderHistory();
}

function renderCoachProfile(latestAnalysis = null) {
  if (!elements.coachProfileList) return;
  const profile = buildUserProfile({
    latestAnalysis,
    history: safeReadJson(STORAGE_KEYS.history, [])
  });
  const actionButton = createNode("button", {
    className: "secondary-button small",
    text: "Use next drill",
    attrs: { type: "button" }
  });
  actionButton.addEventListener("click", () => {
    state.customText = profile.nextAction.drillText;
    resetTest({ text: profile.nextAction.drillText });
    elements.typingInput?.focus();
  });

  const weaknessRows = profile.sustainedWeakAreas.length
    ? profile.sustainedWeakAreas.slice(0, 3).map(area => createNode("li", {}, [
      createNode("strong", { text: area.label }),
      createNode("span", { text: `${area.sessionsSeen} runs / priority ${area.priority}` })
    ]))
    : [createNode("li", {}, [
      createNode("strong", { text: "No recurring weakness yet" }),
      createNode("span", { text: "Complete more runs for a stable profile" })
    ])];

  elements.coachProfileList.replaceChildren(
    createNode("article", { className: "coach-profile-item primary" }, [
      createNode("strong", { text: profile.nextAction.label }),
      createNode("p", { text: profile.nextAction.reason }),
      createNode("code", { text: profile.nextAction.drillText }),
      actionButton
    ]),
    createNode("article", { className: "coach-profile-item" }, [
      createNode("strong", { text: `${profile.summary.sessions} sessions analyzed` }),
      createNode("p", {
        text: `Avg ${profile.summary.averageWpm} WPM, ${profile.summary.averageAccuracy}% accuracy, ${profile.summary.averageConsistency} stability`
      }),
      createNode("p", { text: `Plateau: ${profile.plateau.speed ? "speed" : "not speed"} / ${profile.plateau.accuracy ? "accuracy" : "not accuracy"}` })
    ]),
    createNode("article", { className: "coach-profile-item" }, [
      createNode("strong", { text: "Recurring weak areas" }),
      createNode("ol", { className: "coach-weakness-list" }, weaknessRows)
    ])
  );
}

function renderHistory() {
  const history = safeReadJson(STORAGE_KEYS.history, []);
  renderCoachProfile();
  if (!elements.historyList) return;
  if (!history.length) {
    elements.historyList.replaceChildren(createNode("tr", {}, [
      createNode("td", { text: "No runs recorded yet.", attrs: { colspan: "6" } })
    ]));
    return;
  }
  elements.historyList.replaceChildren(...history.map(row => createNode("tr", {}, [
    createNode("td", { text: new Date(row.timestamp).toLocaleString() }),
    createNode("td", { text: row.mode }),
    createNode("td", { className: "speed", text: `${row.wpm} WPM` }),
    createNode("td", { text: `${row.accuracy}%` }),
    createNode("td", { text: row.consistency }),
    createNode("td", { text: row.mistakes })
  ])));
}

function startAdaptivePractice() {
  const latestAnalysis = state.typed ? getAnalysis(state.finished) : null;
  const profile = buildUserProfile({
    latestAnalysis,
    history: safeReadJson(STORAGE_KEYS.history, [])
  });
  const practice = buildAdaptivePractice({
    profile,
    latestAnalysis,
    wordCount: state.wordsCount || 40
  });
  state.customText = practice.text;
  resetTest({ text: practice.text });
  elements.typingInput?.focus();
  setStatus(`${practice.title}: ${practice.instruction}`);
}

function exportCsv() {
  const history = safeReadJson(STORAGE_KEYS.history, []);
  if (!history.length) {
    setStatus("No history to export yet.");
    return;
  }
  const rows = [
    "Timestamp,Mode,Net WPM,Raw WPM,Accuracy,Consistency,Mistakes,Top Weakness",
    ...history.map(row => [
      row.timestamp,
      row.mode,
      row.wpm,
      row.rawWpm ?? "",
      row.accuracy,
      row.consistency,
      row.mistakes,
      row.weakestAreas?.[0]?.label ?? ""
    ].map(value => `"${String(value).replaceAll("\"", "\"\"")}"`).join(","))
  ];
  downloadFile(`typespeed-history-${Date.now()}.csv`, rows.join("\n"), "text/csv");
}

function exportJson() {
  const history = safeReadJson(STORAGE_KEYS.history, []);
  if (!history.length) {
    setStatus("No history to export yet.");
    return;
  }
  downloadFile(`typespeed-history-${Date.now()}.json`, JSON.stringify(history, null, 2), "application/json");
}

function exportCoachReport() {
  const history = safeReadJson(STORAGE_KEYS.history, []);
  const latestAnalysis = state.typed ? getAnalysis(state.finished) : null;
  const generatedAt = new Date().toISOString();
  const report = buildCoachReport({
    latestAnalysis,
    history,
    generatedAt
  });
  downloadFile(buildCoachReportFilename(generatedAt), report, "text/markdown");
}

async function importHistoryFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    if (file.size > 1024 * 1024) {
      throw new Error("History archive must be 1 MB or smaller.");
    }

    const archive = parseHistoryArchive(await file.text());
    const merged = mergeHistory({
      existingHistory: safeReadJson(STORAGE_KEYS.history, []),
      importedHistory: archive.entries
    });
    safeWriteJson(STORAGE_KEYS.history, merged);
    renderHistory();
    setStatus(`Imported ${archive.entries.length} runs${archive.rejected ? `; skipped ${archive.rejected}` : ""}.`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    event.target.value = "";
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = createNode("a", { attrs: { href: url, download: filename } });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`${filename} exported.`);
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Request failed.");
  return payload.data;
}

async function refreshNetworkInfo() {
  try {
    const data = await apiFetch("/api/network-info");
    const firstLan = data.lanUrls[0] ?? data.localUrl;
    setText(elements.networkInfo, `Share ${firstLan} on this network`);
  } catch {
    setText(elements.networkInfo, "Start the local TypeSpeed server to enable rooms.");
  }
}

function getPlayerName() {
  return elements.playerNameInput?.value.trim().slice(0, 24) || "Typist";
}

async function hostRoom() {
  try {
    const data = await apiFetch("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        hostName: getPlayerName(),
        durationSeconds: state.duration,
        passageId: state.passageId,
        targetText: state.activeText
      })
    });
    state.room = data.room;
    state.playerId = data.playerId;
    state.playerToken = data.playerToken;
    state.shareUrl = data.shareUrl;
    state.isHost = true;
    persistRoomSession({
      room: data.room,
      playerId: data.playerId,
      playerToken: data.playerToken,
      isHost: true,
      shareUrl: data.shareUrl
    });
    if (elements.roomCodeInput) elements.roomCodeInput.value = data.room.code;
    startRoomEvents(data.room.code);
    startProgressSync();
    renderRace();
    setStatus(`Hosting room ${data.room.code}.`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function joinRoom() {
  const code = elements.roomCodeInput?.value.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    setStatus("Enter a valid room code.");
    return;
  }
  try {
    const data = await apiFetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ name: getPlayerName() })
    });
    state.room = data.room;
    state.playerId = data.playerId;
    state.playerToken = data.playerToken;
    state.shareUrl = "";
    state.isHost = false;
    persistRoomSession({
      room: data.room,
      playerId: data.playerId,
      playerToken: data.playerToken,
      isHost: false
    });
    state.activeText = data.room.targetText || state.activeText;
    resetTest({ text: state.activeText });
    startRoomEvents(data.room.code);
    startProgressSync();
    renderRace();
    setStatus(`Joined room ${data.room.code}.`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function restoreRoomSession() {
  const session = readRoomSession();
  if (!session) return;

  const urlRoomCode = new URLSearchParams(window.location.search).get("room")?.toUpperCase();
  if (urlRoomCode && urlRoomCode !== session.code) return;

  try {
    const data = await apiFetch(`/api/rooms/${encodeURIComponent(session.code)}/resume`, {
      method: "POST",
      body: JSON.stringify({
        playerId: session.playerId,
        playerToken: session.playerToken
      })
    });
    state.room = null;
    state.playerId = data.playerId;
    state.playerToken = data.playerToken;
    state.shareUrl = data.shareUrl || session.shareUrl;
    state.isHost = Boolean(data.isHost);
    state.activeText = data.room.targetText || state.activeText;
    if (elements.roomCodeInput) elements.roomCodeInput.value = data.room.code;
    persistRoomSession({
      room: data.room,
      playerId: data.playerId,
      playerToken: data.playerToken,
      isHost: data.isHost,
      shareUrl: state.shareUrl
    });
    resetTest({ text: state.activeText });
    startRoomEvents(data.room.code);
    startProgressSync();
    applyRoom(data.room);
    setStatus(`Rejoined room ${data.room.code}.`);
  } catch (error) {
    clearRoomSession();
    setStatus(`Stored room session expired. ${error.message}`);
  }
}

async function startRoom() {
  if (!state.room || !state.playerId || !state.playerToken || !state.isHost) return;
  try {
    const data = await apiFetch(`/api/rooms/${state.room.code}/start`, {
      method: "POST",
      body: JSON.stringify({
        playerId: state.playerId,
        playerToken: state.playerToken
      })
    });
    applyRoom(data.room);
    setStatus(`Room ${data.room.code} started.`);
  } catch (error) {
    setStatus(error.message);
  }
}

function startRoomEvents(code) {
  if (state.roomEvents) {
    state.roomEvents.close();
    state.roomEvents = null;
  }
  if (state.pollId) {
    window.clearInterval(state.pollId);
    state.pollId = null;
  }

  if (!("EventSource" in window)) {
    startRoomFallbackPolling(code);
    return;
  }

  const roomEvents = new EventSource(`/api/rooms/${encodeURIComponent(code)}/events`);
  state.roomEvents = roomEvents;
  roomEvents.addEventListener("room", event => {
    try {
      const payload = JSON.parse(event.data);
      applyRoom(payload.room);
    } catch {
      setStatus("Room stream sent invalid data.");
    }
  });
  roomEvents.addEventListener("error", () => {
    roomEvents.close();
    if (state.roomEvents === roomEvents) state.roomEvents = null;
    startRoomFallbackPolling(code);
    setStatus("Room stream unavailable; using polling fallback.");
  });
}

function startRoomFallbackPolling(code) {
  if (state.pollId) window.clearInterval(state.pollId);
  state.pollId = window.setInterval(async () => {
    try {
      const data = await apiFetch(`/api/rooms/${encodeURIComponent(code)}`);
      applyRoom(data.room);
    } catch (error) {
      setStatus(error.message);
    }
  }, 1000);
}

function startProgressSync() {
  if (state.progressId) window.clearInterval(state.progressId);
  state.progressId = window.setInterval(() => sendProgress(false), 1000);
}

function applyRoom(room) {
  const wasRunning = state.room?.status === "running";
  showNewRoomReactions(room);
  state.room = room;
  if (room.targetText && room.targetText !== state.activeText) {
    state.activeText = room.targetText;
    resetTest({ text: room.targetText });
  }
  if (!wasRunning && room.status === "running" && !state.startedAt) {
    resetTest({ text: room.targetText || state.activeText });
    startTest();
    elements.typingInput?.focus();
  }
  renderRace();
  setText(elements.sessionStatus, getSessionStatus());
}

async function sendProgress(forceFinished) {
  if (!state.room || !state.playerId || !state.playerToken || !state.startedAt || state.room.status !== "running") return;
  const analysis = getAnalysis(false);
  try {
    const data = await apiFetch(`/api/rooms/${state.room.code}/progress`, {
      method: "POST",
      body: JSON.stringify({
        playerId: state.playerId,
        playerToken: state.playerToken,
        typedChars: state.typed.length,
        progress: analysis.progress,
        wpm: analysis.netWpm,
        accuracy: analysis.accuracy,
        finished: forceFinished || state.finished || analysis.progress >= 100
      })
    });
    state.room = data.room;
    renderRace();
  } catch (error) {
    setStatus(error.message);
  }
}

function renderRace() {
  if (!elements.roomCard || !elements.leaderboard) return;
  renderRoomMessages();
  const paceGhost = buildPaceGhost({
    paceTargetWpm: state.paceTargetWpm,
    elapsedMs: getElapsedMs(),
    targetLength: state.activeText.length
  });
  const localAnalysis = !state.room && state.startedAt ? getAnalysis(false) : null;
  const localPlayer = !state.room
    ? {
        id: "solo-player",
        name: "You",
        progress: localAnalysis?.progress ?? 0,
        wpm: localAnalysis?.netWpm ?? 0,
        accuracy: localAnalysis?.accuracy ?? 100,
        finished: state.finished
      }
    : null;
  const hasRace = Boolean(state.room || paceGhost);

  elements.roomCard.hidden = !state.room;
  elements.racetrackContainer && (elements.racetrackContainer.hidden = !hasRace);
  if (elements.startRoomButton) {
    elements.startRoomButton.disabled = !state.room || !state.isHost || state.room?.status !== "lobby";
  }
  if (!hasRace) {
    elements.leaderboard.replaceChildren();
    elements.raceLanes?.replaceChildren();
    return;
  }
  setText(elements.activeRoomCode, state.room?.code ?? "SOLO");
  const players = [
    ...(state.room ? state.room.players : [localPlayer]),
    ...(paceGhost ? [paceGhost] : [])
  ].filter(Boolean).sort((left, right) => right.progress - left.progress || right.wpm - left.wpm);
  elements.leaderboard.replaceChildren(...players.map((player, index) => createNode("li", { className: "leaderboard-item" }, [
    createNode("div", {}, [
      createNode("strong", { text: `${index + 1}. ${player.name}` }),
      createNode("p", { text: player.isGhost ? "Benchmark" : player.finished ? "Finished" : state.room?.status ?? "solo" })
    ]),
    createNode("div", { className: "leaderboard-stats" }, [
      createNode("strong", { text: `${player.wpm} WPM` }),
      createNode("p", { text: `${player.accuracy}%` })
    ]),
    createNode("progress", { className: "race-progress", attrs: { max: "100", value: Math.round(player.progress) } })
  ])));
  elements.raceLanes?.replaceChildren(...players.map(player => createNode("div", { className: `race-lane progress-${getProgressBucket(player.progress)} ${player.isGhost ? "ghost-lane" : ""}` }, [
    createNode("div", { className: "race-track-grid" }),
    createNode("div", { className: "racer-car", text: player.isGhost ? "GH" : player.name.slice(0, 2).toUpperCase() }),
    createNode("div", { className: "lane-info" }, [
      createNode("span", { text: player.id === state.playerId ? `${player.name} (You)` : player.name }),
      createNode("span", { className: "lane-stats", text: `${player.wpm} WPM` })
    ]),
    createNode("progress", { className: "race-progress", attrs: { max: "100", value: Math.round(player.progress) } })
  ])));
}

function renderRoomMessages() {
  if (!elements.roomMessageList) return;
  const messages = state.room?.messages ?? [];
  if (!messages.length) {
    elements.roomMessageList.replaceChildren(createNode("li", { className: "room-message empty", text: "No room messages yet." }));
    return;
  }

  elements.roomMessageList.replaceChildren(...messages.slice(-8).map(message => createNode("li", {
    className: `room-message ${message.kind}`
  }, [
    createNode("strong", { text: message.kind === "reaction" ? "Reaction" : message.playerName }),
    createNode("span", { text: message.kind === "reaction" ? `${message.playerName}: ${message.text}` : message.text })
  ])));
}

function showNewRoomReactions(nextRoom) {
  const previousMessageIds = new Set((state.room?.messages ?? []).map(message => message.id));
  for (const message of nextRoom.messages ?? []) {
    if (message.kind === "reaction" && !previousMessageIds.has(message.id)) {
      showFloatingReaction(message.text);
    }
  }
}

async function sendRoomMessage(kind, text) {
  const messageText = String(text ?? "").trim();
  if (!messageText) return;
  if (!state.room || !state.playerId || !state.playerToken) {
    if (kind === "reaction") showFloatingReaction(messageText);
    setStatus("Create or join a room to send lobby messages.");
    return;
  }

  try {
    const data = await apiFetch(`/api/rooms/${state.room.code}/message`, {
      method: "POST",
      body: JSON.stringify({
        playerId: state.playerId,
        playerToken: state.playerToken,
        kind,
        text: messageText
      })
    });
    applyRoom(data.room);
  } catch (error) {
    setStatus(error.message);
  }
}

async function copyShareUrl() {
  if (!state.shareUrl && state.room) state.shareUrl = `${window.location.origin}/?room=${state.room.code}`;
  if (!state.shareUrl) {
    setStatus("Create or join a room first.");
    return;
  }
  try {
    await navigator.clipboard.writeText(state.shareUrl);
    setStatus("Room invitation copied.");
  } catch {
    setText(elements.networkInfo, state.shareUrl);
    setStatus("Copy the invitation URL shown below.");
  }
}

function hydrateRoomCodeFromUrl() {
  const code = new URLSearchParams(window.location.search).get("room");
  if (code && elements.roomCodeInput) {
    elements.roomCodeInput.value = code.toUpperCase();
    setStatus("Room code loaded. Enter a name and join.");
  }
}

function showFloatingReaction(text) {
  if (!elements.racetrackContainer || !text) return;
  const bubble = createNode("div", { className: "floating-reaction", text });
  elements.racetrackContainer.append(bubble);
  window.setTimeout(() => bubble.remove(), 1200);
}

function playKeySound(key) {
  const sound = elements.soundSelect?.value ?? "mute";
  if (sound === "mute") return;
  const volume = Math.max(0, Math.min(1, Number(elements.volumeSlider?.value ?? 0.4)));
  if (!volume) return;
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const pitch = Math.max(0.5, Math.min(1.5, Number(elements.pitchSlider?.value ?? 1)));
  oscillator.type = sound === "typewriter" ? "square" : "sine";
  oscillator.frequency.value = (key === " " ? 180 : 520) * pitch;
  gain.gain.setValueAtTime(volume * 0.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.035);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.04);
}

function getAudioContext() {
  if (!state.audioContext) state.audioContext = new AudioContext();
  return state.audioContext;
}

function syncMetronome() {
  if (state.metronomeId) window.clearInterval(state.metronomeId);
  state.metronomeId = null;
  if (!elements.metronomeToggle?.checked || !state.startedAt || state.finished) return;
  const bpm = Math.max(30, Math.min(300, Number(elements.metronomeBpm?.value ?? 120)));
  state.metronomeId = window.setInterval(() => playKeySound(" "), (60 / bpm) * 1000);
}

function drawSparkline(canvas, points) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (points.length < 2) return;
  const max = Math.max(40, ...points);
  const widthStep = canvas.width / (points.length - 1);
  context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#10b981";
  context.lineWidth = 2;
  context.beginPath();
  points.forEach((point, index) => {
    const x = index * widthStep;
    const y = canvas.height - (point / max) * (canvas.height - 8) - 4;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

initialize();
