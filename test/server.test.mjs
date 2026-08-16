import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SERVER = path.join(REPO, "mcp", "server.mjs");
const TEST_PROJECT = path.dirname(REPO);
const base = process.env.SCRATCHPAD_TEST_ROOT || os.tmpdir();
const testRoot = fs.mkdtempSync(path.join(base, "scratchpad-mcp-test-"));
const sessionId = "test-session";
const projectSlug = TEST_PROJECT.replace(/[^A-Za-z0-9.]/g, "-");
const scratchpad = path.join(testRoot, projectSlug, sessionId, "scratchpad");
const fixtureHtml = `<!doctype html><html><head><title>Interactive decision</title></head><body><button>Choose B</button><script>window.parent.postMessage({type:"scratchpad:update",state:{choice:"B",marker:"hidden-widget-payload"}},"*")</script></body></html>`;

fs.mkdirSync(scratchpad, { recursive: true });
fs.writeFileSync(path.join(scratchpad, "decision.html"), fixtureHtml);
fs.writeFileSync(path.join(scratchpad, "not-html.txt"), "plain text");
fs.writeFileSync(path.join(testRoot, "outside.html"), "<title>outside</title>");
fs.symlinkSync(path.join(testRoot, "outside.html"), path.join(scratchpad, "escape.html"));
fs.writeFileSync(path.join(testRoot, "outside.png"), Buffer.from("not-a-real-png"));
fs.symlinkSync(path.join(testRoot, "outside.png"), path.join(scratchpad, "escape.png"));

const child = spawn(process.execPath, [SERVER], {
  cwd: REPO,
  env: {
    ...process.env,
    PWD: REPO,
    CODEX_THREAD_ID: "",
    CODEX_SESSION_ID: "",
    SCRATCHPAD_ROOT: testRoot,
    SCRATCHPAD_PROJECT_DIR: TEST_PROJECT,
    SCRATCHPAD_SESSION_ID: sessionId,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let nextId = 1;
const pending = new Map();
const stdout = readline.createInterface({ input: child.stdout });
stdout.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id == null) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function request(method, params = {}) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

const initialized = (async () => {
  const result = await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "scratchpad-test", version: "1.0.0" },
  });
  notify("notifications/initialized");
  return result;
})();

test.after(async () => {
  child.stdin.end();
  await new Promise((resolve) => {
    if (child.exitCode != null) return resolve();
    child.once("exit", resolve);
    setTimeout(() => {
      child.kill("SIGTERM");
      resolve();
    }, 1000).unref();
  });
  fs.rmSync(testRoot, { recursive: true, force: true });
});

test("advertises the interactive HTML tool and MCP App resource", async () => {
  const init = await initialized;
  assert.equal(init.serverInfo.name, "scratchpad");
  assert.match(init.instructions, /scratchpad:update/);

  const listed = await request("tools/list");
  const tool = listed.tools.find((entry) => entry.name === "open_html");
  assert.ok(tool);
  assert.match(tool._meta.ui.resourceUri, /^ui:\/\/scratchpad\/html-artifact-/);
  assert.equal(tool._meta["openai/outputTemplate"], tool._meta.ui.resourceUri);
  assert.deepEqual(tool._meta.ui.visibility, ["model"]);

  const resources = await request("resources/list");
  const resource = resources.resources.find(
    (entry) => entry.uri === tool._meta.ui.resourceUri,
  );
  assert.ok(resource);
  assert.equal(resource.mimeType, "text/html;profile=mcp-app");

  const read = await request("resources/read", { uri: resource.uri });
  assert.equal(read.contents.length, 1);
  assert.equal(read.contents[0].mimeType, "text/html;profile=mcp-app");
  assert.match(read.contents[0].text, /Send selection/);
  assert.match(read.contents[0].text, /sandbox="allow-scripts"/);
  assert.match(read.contents[0].text, /ui\/request-display-mode/);
  assert.match(read.contents[0].text, /await rpcRequest\("ui\/message"/);
  assert.match(read.contents[0].text, /availableDisplayModes: \["inline", "fullscreen"\]/);
});

test("opens exact HTML privately without resource links", async () => {
  await initialized;
  const result = await request("tools/call", {
    name: "open_html",
    arguments: { subpath: "decision.html", display: "fullscreen" },
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.artifact.title, "Interactive decision");
  assert.equal(result.structuredContent.artifact.displayMode, "fullscreen");
  assert.equal(result._meta.artifact.html, fixtureHtml);
  assert.equal(result._meta.artifact.interactive, true);
  assert.ok(!JSON.stringify(result.content).includes("hidden-widget-payload"));
  assert.ok(!JSON.stringify(result.structuredContent).includes("hidden-widget-payload"));
  assert.ok(!result.content.some((item) => item.type === "resource_link"));
});

test("rejects non-HTML files and symlink escapes", async () => {
  await initialized;
  const nonHtml = await request("tools/call", {
    name: "open_html",
    arguments: { subpath: "not-html.txt" },
  });
  assert.equal(nonHtml.isError, true);
  assert.match(nonHtml.content[0].text, /unsupported HTML artifact type/);

  const escaped = await request("tools/call", {
    name: "open_html",
    arguments: { subpath: "escape.html" },
  });
  assert.equal(escaped.isError, true);
  assert.match(escaped.content[0].text, /resolves outside the scratchpad/);

  const escapedImage = await request("tools/call", {
    name: "show_image",
    arguments: { subpath: "escape.png" },
  });
  assert.equal(escapedImage.isError, true);
  assert.match(escapedImage.content[0].text, /resolves outside the scratchpad/);
});
