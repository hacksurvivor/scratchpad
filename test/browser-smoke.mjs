#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
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
const profile = fs.mkdtempSync(path.join(path.dirname(input), "scratchpad-chrome-"));
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

  const evaluate = async (expression) => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
    throw new Error(`Timed out: ${expression}`);
  };
  await until('document.getElementById("status")?.textContent === "Ready"');
  assert.equal(await evaluate('document.getElementById("title").textContent'), 'Decision workbench');
  // Click the first card in the rendered, sandboxed fixture.
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: 200, y: 500, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: 200, y: 500, button: "left", clickCount: 1 });
  await until(`document.getElementById("selection-preview").textContent.includes('"A"')`);
  await evaluate(`document.getElementById('notes').value='Browser fixture review';document.getElementById('notes').dispatchEvent(new Event('input'));`);
  assert.equal(await evaluate('document.getElementById("send").disabled'), false);
  const before = await evaluate('document.getElementById("artifact").srcdoc');
  await evaluate(`window.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{_meta:{artifact:window.__fixtureArtifact}}},'*')`);
  await delay(100);
  assert.equal(await evaluate('document.getElementById("notes").value'), 'Browser fixture review');
  assert.equal(await evaluate('document.getElementById("artifact").srcdoc'), before);
  await evaluate('document.querySelector("button[data-device=mobile]").click()');
  assert.equal(await evaluate('document.getElementById("artifact").getBoundingClientRect().width'),375);
  await evaluate('document.getElementById("compare-mode").click()');
  assert.equal(await evaluate('document.getElementById("previous-wrap").hidden'),false);
  assert.equal(await evaluate('document.getElementById("previous").getAttribute("sandbox")'),'allow-scripts');
  await evaluate('document.getElementById("send").click()');
  await until('document.getElementById("send").textContent === "Sent"');
  const receipt = await evaluate('window.__fixtureMessages.filter(x=>x.method==="ui/message")');
  assert.equal(receipt.length,1);
  assert.match(receipt[0].params.content[0].text,/Browser fixture review/);
  assert.match(receipt[0].params.content[0].text, /"sha256":"[a-f0-9]{64}"/);
  await evaluate(`window.__fixtureSendFailure=true;document.getElementById('notes').value='Retry fixture';document.getElementById('notes').dispatchEvent(new Event('input'));document.getElementById('send').click()`);
  await until('document.getElementById("send-status").textContent.includes("Delivery not confirmed")');
  assert.equal(await evaluate('document.getElementById("notes").value'),'Retry fixture');
  assert.equal(await evaluate('document.getElementById("send").disabled'),false);
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await evaluate('document.getElementById("preview-mode").click()');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= 390'),true);
  await evaluate('document.getElementById("theme").click()');
  assert.equal(await evaluate('document.body.classList.contains("dark")'),true);
  await evaluate('document.getElementById("focus").click()');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("aside")).display'),'none');
  await evaluate('document.getElementById("focus").click()');
  await evaluate('document.getElementById("theme").click()');
  if (process.argv[3]) {
    const metrics=await cdp('Page.getLayoutMetrics');
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:Math.ceil(metrics.cssContentSize.height),scale:1}});
    fs.writeFileSync(path.resolve(process.argv[3]),Buffer.from(shot.data,'base64'));
  }
  process.stdout.write(JSON.stringify({result:'passed',checks:['artifact render','sandboxed artifact selection','draft preservation','375px viewport','two-revision comparison','acknowledged send','failed send preserves draft','mobile no page overflow','dark appearance','focus mode'],host:'disposable fixture, no live messages'})+'\n');

} finally {
  socket?.close();
  child.kill("SIGTERM");
  if (child.exitCode == null) await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2000).unref();
  });
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
