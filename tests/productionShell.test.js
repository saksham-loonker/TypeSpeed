import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAppServer } from "../server.js";

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test("frontend shell uses real local room APIs instead of mock multiplayer", async () => {
  const app = await readProjectFile("public/app.js");

  assert.match(app, /\/api\/rooms/);
  assert.match(app, /\/api\/network-info/);
  assert.match(app, /analyzeTypingSession/);
  assert.doesNotMatch(app, /mockMultiplayerIntegration/);
  assert.doesNotMatch(app, /WebSocket/);
  assert.doesNotMatch(app, /state\.socket/);
  assert.doesNotMatch(app, /alert\(/);
  assert.doesNotMatch(app, /onclick=/);
  assert.doesNotMatch(app, /\.style\./);
});

test("html shell is self-contained and compatible with a strict CSP", async () => {
  const html = await readProjectFile("public/index.html");

  assert.match(html, /id="coachProfileList"/);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(html, /onclick=/);
});

test("frontend renders persistent coaching evidence from saved history", async () => {
  const app = await readProjectFile("public/app.js");

  assert.match(app, /buildUserProfile/);
  assert.match(app, /renderCoachProfile/);
  assert.match(app, /weakestAreas:\s*analysis\.weakestAreas\.slice/);
});

test("frontend supports safe local history import without inline handlers", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");

  assert.match(html, /id="historyImportInput"/);
  assert.match(html, /accept="application\/json"/);
  assert.match(app, /parseHistoryArchive/);
  assert.match(app, /mergeHistory/);
  assert.match(app, /importHistoryFromFile/);
  assert.doesNotMatch(html, /onchange=|onclick=/);
});

test("frontend exposes a readable coach report export", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");

  assert.match(html, /id="exportReportBtn"/);
  assert.match(app, /buildCoachReport/);
  assert.match(app, /exportCoachReport/);
  assert.match(app, /text\/markdown/);
});

test("frontend exposes adaptive practice from the coach profile", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");

  assert.match(html, /id="adaptivePracticeBtn"/);
  assert.match(app, /buildAdaptivePractice/);
  assert.match(app, /startAdaptivePractice/);
});

test("frontend uses room event streams with polling fallback", async () => {
  const app = await readProjectFile("public/app.js");

  assert.match(app, /EventSource/);
  assert.match(app, /\/api\/rooms\/.+\/events/);
  assert.match(app, /startRoomFallbackPolling/);
});

test("frontend exposes real room chat and reaction messages instead of local-only buttons", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");

  assert.match(html, /id="roomMessageList"/);
  assert.match(app, /sendRoomMessage/);
  assert.match(app, /renderRoomMessages/);
  assert.match(app, /\/message/);
  assert.match(app, /data-lobby-chat/);
  assert.doesNotMatch(app, /button\.dataset\.lobbyChat\s*\?\?\s*"Ready\."/);
});

test("frontend sends private player tokens for room actions without storing them in room state", async () => {
  const app = await readProjectFile("public/app.js");

  assert.match(app, /playerToken:\s*""/);
  assert.match(app, /state\.playerToken\s*=\s*data\.playerToken/);
  assert.match(app, /playerToken:\s*state\.playerToken/);
  assert.doesNotMatch(app, /room\.players\[[^\]]+\]\.token/);
});

test("frontend resumes refresh-safe room credentials from session storage", async () => {
  const app = await readProjectFile("public/app.js");

  assert.match(app, /ROOM_SESSION_STORAGE_KEY/);
  assert.match(app, /sessionStorage\.setItem\(ROOM_SESSION_STORAGE_KEY/);
  assert.match(app, /function restoreRoomSession\(\)/);
  assert.match(app, /\/resume/);
  assert.doesNotMatch(app, /localStorage\.setItem\(ROOM_SESSION_STORAGE_KEY/);
});

test("frontend only enables the start race button while a hosted room is in lobby", async () => {
  const app = await readProjectFile("public/app.js");

  assert.match(app, /state\.room\?\.status\s*!==\s*"lobby"/);
  assert.doesNotMatch(app, /startRoomButton\) elements\.startRoomButton\.disabled = !state\.room \|\| !state\.isHost/);
});

test("frontend caches keyboard rendering and updates heatmap state immutably", async () => {
  const app = await readProjectFile("public/app.js");

  assert.match(app, /recordKeyStat/);
  assert.match(app, /buildKeyboardRows/);
  assert.match(app, /keyboardRenderKey/);
  assert.match(app, /keyboardStatsVersion/);
  assert.match(app, /state\.keySuccessMap\s*=\s*result\.successes/);
  assert.match(app, /state\.keyFailuresMap\s*=\s*result\.failures/);
  assert.doesNotMatch(app, /state\.keySuccessMap\[[^\]]+\]\s*=/);
  assert.doesNotMatch(app, /state\.keyFailuresMap\[[^\]]+\]\s*=/);
});

test("frontend result modal uses native hidden state and dialog semantics", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");

  assert.match(html, /id="resultsModal"[^>]*role="dialog"/);
  assert.match(html, /id="resultsModal"[^>]*aria-modal="true"/);
  assert.match(html, /id="resultsModal"[^>]*aria-labelledby="resultsTitle"/);
  assert.match(html, /id="resultsTitle"/);
  assert.match(app, /function showResultsModal\(\)/);
  assert.match(app, /function hideResultsModal\(/);
  assert.match(app, /elements\.resultsModal\.hidden\s*=\s*false/);
  assert.match(app, /elements\.resultsModal\.hidden\s*=\s*true/);
  assert.doesNotMatch(app, /resultsModal\?\.classList\.(add|remove)\("hidden"\)/);
});

test("frontend hand workload is calculated through the shared keyboard model", async () => {
  const app = await readProjectFile("public/app.js");

  assert.match(app, /summarizeHandWorkload/);
  assert.doesNotMatch(app, /KEYBOARD_FINGERS/);
});

test("frontend wires difficulty and pace benchmark controls to real session rules", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");

  assert.match(html, /id="difficultySelect"/);
  assert.match(html, /id="paceSelect"/);
  assert.match(app, /normalizeDifficulty/);
  assert.match(app, /normalizePaceTarget/);
  assert.match(app, /shouldStopForHardcoreMistake/);
  assert.match(app, /buildTargetCharClass/);
  assert.match(app, /buildPaceGhost/);
  assert.match(app, /getProgressBucket/);
  assert.match(app, /difficultySelect\?\.addEventListener\("change"/);
  assert.match(app, /paceSelect\?\.addEventListener\("change"/);
  assert.match(app, /progress-\$\{getProgressBucket\(player\.progress\)\}/);
  assert.match(app, /className:\s*`race-lane progress-\$\{getProgressBucket\(player\.progress\)\} \$\{player\.isGhost \? "ghost-lane" : ""\}`/);
});

test("stylesheets do not contain invalid ARIA declarations", async () => {
  const styles = await readProjectFile("public/styles.css");

  assert.doesNotMatch(styles, /aria-hidden\s*:/);
});

test("race lanes expose CSP-safe progress buckets for moving racer markers", async () => {
  const styles = await readProjectFile("public/styles.css");

  assert.match(styles, /\.race-lane\.progress-0 \.racer-car/);
  assert.match(styles, /\.race-lane\.progress-50 \.racer-car/);
  assert.match(styles, /\.race-lane\.progress-100 \.racer-car/);
  assert.doesNotMatch(styles, /left:\s*\$\{|style="/);
});

test("server sends strict security headers and blocks traversal", async t => {
  const server = createAppServer();
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  const csp = home.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline/);

  const traversal = await fetch(`${baseUrl}/src/..%2Fserver.js`);
  assert.equal(traversal.status, 404);
});
