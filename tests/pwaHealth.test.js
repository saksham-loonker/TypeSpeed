import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAppServer } from "../server.js";

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function readProjectJson(path) {
  return JSON.parse(await readProjectFile(path));
}

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test("server exposes a health endpoint with app version", async t => {
  const server = createAppServer();
  t.after(() => server.close());
  const baseUrl = await listen(server);
  const packageJson = await readProjectJson("package.json");

  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const payload = await response.json();
  assert.equal(payload.data.status, "ok");
  assert.equal(payload.data.version, packageJson.version);
  assert.equal(typeof payload.data.uptimeSeconds, "number");
  assert.ok(payload.data.uptimeSeconds >= 0);
});

test("static shell exposes installable PWA assets safely", async t => {
  const server = createAppServer();
  t.after(() => server.close());
  const baseUrl = await listen(server);

  const manifestResponse = await fetch(`${baseUrl}/manifest.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get("content-type") ?? "", /application\/manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.match(manifest.name, /TypeSpeed/);
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some(icon => icon.src === "/icon.svg"));

  const workerResponse = await fetch(`${baseUrl}/service-worker.js`);
  assert.equal(workerResponse.status, 200);
  assert.match(workerResponse.headers.get("content-type") ?? "", /text\/javascript/);
  const worker = await workerResponse.text();
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /\/src\/sessionRules\.js/);
  assert.match(worker, /event\.respondWith/);
  assert.match(worker, /caches\.open/);
});

test("frontend registers the PWA shell without inline allowances", async () => {
  const html = await readProjectFile("public/index.html");
  const app = await readProjectFile("public/app.js");

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(app, /serviceWorker\.register\("\/service-worker\.js"\)/);
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(app, /\.style\./);
});

test("project includes contributor verification and LAN multiplayer docs", async () => {
  const packageJson = await readProjectJson("package.json");
  const readme = await readProjectFile("README.md");

  assert.match(packageJson.scripts.check, /node --check server\.js/);
  assert.match(packageJson.scripts.check, /src\/profileCoach\.js|src\\profileCoach\.js/);
  assert.match(packageJson.scripts.check, /src\/historyArchive\.js|src\\historyArchive\.js/);
  assert.match(packageJson.scripts.check, /src\/coachReport\.js|src\\coachReport\.js/);
  assert.match(packageJson.scripts.check, /src\/adaptivePractice\.js|src\\adaptivePractice\.js/);
  assert.match(packageJson.scripts.check, /src\/keyboardModel\.js|src\\keyboardModel\.js/);
  assert.match(packageJson.scripts.check, /src\/sessionRules\.js|src\\sessionRules\.js/);
  assert.match(packageJson.scripts.verify, /npm\.cmd run check/);
  assert.match(readme, /npm\.cmd start/);
  assert.match(readme, /npm\.cmd test/);
  assert.match(readme, /room code/i);
  assert.match(readme, /LAN/i);
});
