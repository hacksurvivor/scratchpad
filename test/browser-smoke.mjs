#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const input = process.argv[2];
if (!input || !path.isAbsolute(input) || !fs.existsSync(input)) {
  process.stderr.write("usage: node test/browser-smoke.mjs /absolute/widget-harness.html\n");
  process.exit(2);
}

const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);
const chrome = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chrome) throw new Error("Chrome, Chromium, or Edge is required");

const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "scratchpad-chrome-"));
const child = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=1440,1000",
  `file://${input}`,
], { stdio: "ignore" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  let page;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      page = targets.find((target) => target.type === "page");
      if (page) break;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  if (!page) throw new Error("Chrome DevTools target did not become ready");

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id == null) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await delay(500);
  await cdp("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: 720,
    y: 350,
    button: "left",
    clickCount: 1,
  });
  await cdp("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 720,
    y: 350,
    button: "left",
    clickCount: 1,
  });
  await delay(250);

  const evaluated = await cdp("Runtime.evaluate", {
    expression: `({
      title: document.querySelector("#title")?.textContent,
      status: document.querySelector("#status")?.textContent,
      sendDisabled: document.querySelector("#send")?.disabled
    })`,
    returnByValue: true,
  });
  const state = evaluated.result.value;
  assert.equal(state.title, "Decision workbench");
  assert.equal(state.status, "Selection ready to send");
  assert.equal(state.sendDisabled, false);
  process.stdout.write(`${JSON.stringify(state)}\n`);
} finally {
  socket?.close();
  child.kill("SIGTERM");
  fs.rmSync(profile, { recursive: true, force: true });
}
