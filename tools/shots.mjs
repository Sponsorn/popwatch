// Screenshots through the DevTools protocol: exact viewports, emulated
// prefers-color-scheme, native WebP. No dependencies (Node 22+ has WebSocket).
//
//   python -m http.server 8731          (in the repo root)
//   node tools/shots.mjs states         every state, phone + desktop, light + dark -> shots/
//   node tools/shots.mjs assets         og-image.png and the portfolio WebPs
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:8731/index.html";
const STATES = ["idle", "first", "test", "rest", "popping", "slowing", "pull", "deaf", "outcome"];

const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", "--hide-scrollbars",
  "--user-data-dir=" + mkdtempSync(join(tmpdir(), "popwatch-")), "about:blank"], { stdio: "ignore" });

let ws, id = 0;
const waiting = new Map();
const send = (method, params = {}) => new Promise((ok, fail) => {
  const n = ++id;
  waiting.set(n, { ok, fail });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const tabs = await (await fetch("http://127.0.0.1:9333/json")).json();
      const page = tabs.find((t) => t.type === "page");
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener("open", r));
      ws.addEventListener("message", (e) => {
        const m = JSON.parse(e.data);
        if (waiting.has(m.id)) {
          const w = waiting.get(m.id); waiting.delete(m.id);
          m.error ? w.fail(new Error(m.error.message)) : w.ok(m.result);
        }
      });
      return;
    } catch { await sleep(200); }
  }
  throw new Error("Chrome did not start");
}

async function shot(url, w, h, scheme, file, format = "png", dpr = 1) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 768 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  if (url === BASE) await send("Storage.clearDataForOrigin", { origin: new URL(BASE).origin, storageTypes: "local_storage" });
  await send("Page.navigate", { url });
  await sleep(2200);                       // fonts, then the 900ms field transition
  const { data } = await send("Page.captureScreenshot", { format, quality: format === "webp" ? 88 : undefined });
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(file);
}

try {
  await connect();
  await send("Page.enable");
  const what = process.argv[2] || "states";
  if (what === "states") {
    mkdirSync("shots", { recursive: true });
    for (const scheme of ["light", "dark"])
      for (const [w, h] of [[390, 844], [1440, 900]])
        for (const s of STATES)
          await shot(s === "first" ? BASE : `${BASE}?demo=${s}`, w, h, scheme, `shots/${s}-${w}x${h}-${scheme}.png`);
  } else {
    await shot(`${BASE}?demo=popping`, 1200, 630, "dark", "og-image.png");
    mkdirSync("portfolio", { recursive: true });
    await shot(`${BASE}?demo=popping`, 1440, 900, "dark", "portfolio/popwatch-1440.webp", "webp");
    // same view as the 1440, half scale, like the other cards in antonbeckman.se/public/work
    await shot(`${BASE}?demo=popping`, 1440, 900, "dark", "portfolio/popwatch-720.webp", "webp", .5);
  }
} finally {
  ws?.close();
  chrome.kill();
}
