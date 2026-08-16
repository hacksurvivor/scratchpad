#!/usr/bin/env node
// scratchpad — a session-scoped temp directory for coding agents.
//
// Speaks MCP over stdio. No network, no model calls, no dependencies.
// stdout carries JSON-RPC only; anything diagnostic goes to stderr.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const SERVER_NAME = "scratchpad";
const SERVER_VERSION = "0.2.0+codex.20260816020137";
const DEFAULT_TTL_DAYS = 7;

// ---------------------------------------------------------------- resolution

// Codex launches the server with cwd set to the plugin directory, so the
// project directory comes from the environment. PWD survives the spawn because
// changing a child's working directory does not rewrite its environment.
const PLUGIN_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function isInsidePlugin(dir) {
  const resolved = path.resolve(dir);
  return resolved === PLUGIN_DIR || resolved.startsWith(PLUGIN_DIR + path.sep);
}

function resolveProjectDir() {
  const candidates = [
    process.env.SCRATCHPAD_PROJECT_DIR,
    process.env.CODEX_WORKSPACE_ROOT,
    process.env.CODEX_PROJECT_DIR,
    process.env.PWD,
  ];
  for (const dir of candidates) {
    if (!dir || !path.isAbsolute(dir)) continue;
    if (isInsidePlugin(dir)) continue; // never scope a scratchpad to the plugin
    if (path.parse(dir).root === path.resolve(dir)) continue; // `/` is not a project
    if (fs.existsSync(dir)) return dir;
  }
  const cwd = process.cwd();
  if (isInsidePlugin(cwd)) {
    log("warning: could not determine the project directory; using a shared scratchpad");
    return os.homedir();
  }
  return cwd;
}

// Mirrors Claude Code's slug: every character outside [A-Za-z0-9.] becomes a
// dash, so /Users/example/Code/my-app -> -Users-example-Code-my-app
function slugify(absPath) {
  return absPath.replace(/[^A-Za-z0-9.]/g, "-");
}

function resolveRoot() {
  if (process.env.SCRATCHPAD_ROOT) return process.env.SCRATCHPAD_ROOT;
  const uid = typeof os.userInfo === "function" ? os.userInfo().uid : -1;
  const suffix = uid >= 0 ? `codex-${uid}` : "codex";
  // /tmp is stable and easy to reach by hand; os.tmpdir() covers the rest.
  const base = process.platform === "win32" ? os.tmpdir() : "/tmp";
  return path.join(base, suffix);
}

function resolveSessionId() {
  return (
    process.env.CODEX_THREAD_ID ||
    process.env.CODEX_SESSION_ID ||
    process.env.SCRATCHPAD_SESSION_ID ||
    randomUUID()
  );
}

const PROJECT_DIR = resolveProjectDir();
const ROOT = resolveRoot();
const PROJECT_ROOT = path.join(ROOT, slugify(PROJECT_DIR));
const SESSION_ID = resolveSessionId();
const SCRATCHPAD = path.join(PROJECT_ROOT, SESSION_ID, "scratchpad");

const ttlDays = Number(process.env.SCRATCHPAD_TTL_DAYS ?? DEFAULT_TTL_DAYS);
const TTL_DAYS = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : DEFAULT_TTL_DAYS;

// ------------------------------------------------------------------ plumbing

function log(...args) {
  process.stderr.write(`[scratchpad] ${args.join(" ")}\n`);
}

fs.mkdirSync(SCRATCHPAD, { recursive: true });

// Sweep sibling sessions that have gone cold. $TMPDIR is not reliably swept on
// macOS, and an unbounded scratchpad root is its own kind of mess.
function sweep(olderThanDays = TTL_DAYS) {
  const cutoff = Date.now() - olderThanDays * 86_400_000;
  const removed = [];
  let sessionRoots;
  try {
    sessionRoots = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
  } catch {
    return removed;
  }
  for (const entry of sessionRoots) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(PROJECT_ROOT, entry.name);
    if (dir === path.dirname(SCRATCHPAD)) continue; // never the live session
    try {
      if (fs.statSync(dir).mtimeMs < cutoff) {
        fs.rmSync(dir, { recursive: true, force: true });
        removed.push(dir);
      }
    } catch {
      /* a session we cannot stat is a session we leave alone */
    }
  }
  return removed;
}

// Keep every path operation inside the scratchpad, whatever the model asks for.
function safeJoin(subpath) {
  if (!subpath) return SCRATCHPAD;
  const resolved = path.resolve(SCRATCHPAD, subpath);
  if (resolved !== SCRATCHPAD && !resolved.startsWith(SCRATCHPAD + path.sep)) {
    throw new Error(`path escapes the scratchpad: ${subpath}`);
  }
  return resolved;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

function walk(dir, prefix = "") {
  const rows = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return rows;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rows.push(`${rel}/`);
      rows.push(...walk(abs, rel));
    } else {
      try {
        rows.push(`${rel}  (${formatBytes(fs.statSync(abs).size)})`);
      } catch {
        rows.push(rel);
      }
    }
  }
  return rows;
}

const MIME_TYPES = new Map([
  [".gif", "image/gif"],
  [".html", "text/html"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".json", "application/json"],
  [".md", "text/markdown"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain"],
  [".webp", "image/webp"],
]);
const INLINE_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_INLINE_IMAGE_BYTES = 12 * 1024 * 1024;

function mimeTypeFor(file) {
  return MIME_TYPES.get(path.extname(file).toLowerCase()) ??
    "application/octet-stream";
}

function showImage(args = {}) {
  if (!args.subpath) {
    throw new Error("subpath is required and must name one rendered image");
  }
  const target = safeJoin(args.subpath);
  if (!fs.existsSync(target)) {
    throw new Error(`image does not exist: ${args.subpath}`);
  }
  const stat = fs.statSync(target);
  if (!stat.isFile()) {
    throw new Error("subpath must name one image file, not a directory");
  }
  const mimeType = mimeTypeFor(target);
  if (!INLINE_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`unsupported image type: ${mimeType}`);
  }
  if (stat.size > MAX_INLINE_IMAGE_BYTES) {
    throw new Error(
      `image is ${formatBytes(stat.size)}; resize it below ${formatBytes(MAX_INLINE_IMAGE_BYTES)} before showing it`,
    );
  }
  return [{
    type: "image",
    data: fs.readFileSync(target).toString("base64"),
    mimeType,
    annotations: {
      audience: ["user", "assistant"],
      priority: 1,
      lastModified: new Date(stat.mtimeMs).toISOString(),
    },
  }];
}

// --------------------------------------------------------------- instructions

// Clients that honor MCP server instructions can inject this directly. Codex
// currently relies on the scoped scratchpad skills when it omits this field.
const INSTRUCTIONS = `A session-scoped scratchpad directory is available at:

${SCRATCHPAD}

IMPORTANT: Use this directory for ALL temporary file needs instead of /tmp or
other system temp directories:
- Storing intermediate results or data during multi-step tasks
- Writing temporary scripts or configuration files
- Saving outputs that do not belong in the user's project
- Creating working files during analysis or processing
- Any file that would otherwise go to /tmp

The directory already exists — write to it directly, no mkdir needed. It is
specific to this session, isolated from the user's project (nothing written
there shows up in git status), and generally usable without permission prompts.

VISUAL WORK ONLY: When visible appearance is part of correctness, render the
real interface or a faithful probe to one image, then call show_image exactly
once. Treat its returned pixels as both the agent's visual input and the user's
inline view; draw visual conclusions only after that result. Do not call a
Scratchpad tool on unrelated tasks merely because these instructions exist.`;

const TOOLS = [
  {
    name: "scratchpad",
    description:
      "Return the absolute path of this session's scratchpad directory. Use only when a temporary path is actually needed and the path is not already in context. Pass `subpath` to get a path inside it.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "show_image",
    description:
      "Read one rendered scratchpad PNG, JPEG, GIF, or WebP as image input for the agent and show the same pixels inline to the user. The result contains only image pixels: no file links and no Web Preview. Draw visual conclusions after the result. One successful call is final; never repeat it for an unchanged image.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "scratchpad_list",
    description:
      "List the contents of this session's scratchpad directory, recursively, with file sizes.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "scratchpad_clean",
    description:
      "Delete scratchpad contents. scope 'current' empties this session's directory; scope 'old' removes directories from previous sessions of this project.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

function callTool(name, args = {}) {
  switch (name) {
    case "scratchpad": {
      const target = safeJoin(args.subpath);
      fs.mkdirSync(args.subpath ? path.dirname(target) : target, {
        recursive: true,
      });
      return [{ type: "text", text: target }];
    }
    case "show_image": {
      return showImage(args);
    }
    case "scratchpad_list": {
      const target = safeJoin(args.subpath);
      const rows = walk(target);
      return [{
        type: "text",
        text: rows.length
          ? `${target}\n\n${rows.join("\n")}`
          : `${target}\n\n(empty)`,
      }];
    }
    case "scratchpad_clean": {
      const scope = args.scope ?? "old";
      if (scope === "current") {
        fs.rmSync(SCRATCHPAD, { recursive: true, force: true });
        fs.mkdirSync(SCRATCHPAD, { recursive: true });
        return [{ type: "text", text: `Emptied ${SCRATCHPAD}` }];
      }
      const days = Number(args.older_than_days ?? TTL_DAYS);
      const removed = sweep(Number.isFinite(days) && days > 0 ? days : TTL_DAYS);
      return [{
        type: "text",
        text: removed.length
          ? `Removed ${removed.length} stale session director${
              removed.length === 1 ? "y" : "ies"
            }:\n${removed.join("\n")}`
          : "No stale session directories to remove.",
      }];
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

// --------------------------------------------------------- current MCP server

function toolSchema(tool) {
  switch (tool.name) {
    case "scratchpad":
      return z.object({
        subpath: z.string().optional().describe(
          "Optional path relative to the scratchpad, e.g. data/out.json. Parent directories are created.",
        ),
      });
    case "show_image":
      return z.object({
        subpath: z.string().describe(
          "Exact image file relative to the scratchpad, for example visual/buttons.png. Directories and non-image files are rejected.",
        ),
      });
    case "scratchpad_list":
      return z.object({
        subpath: z.string().optional().describe(
          "Optional subdirectory to list instead of the root.",
        ),
      });
    case "scratchpad_clean":
      return z.object({
        scope: z.enum(["current", "old"]).optional().describe(
          "What to remove. Defaults to old.",
        ),
        older_than_days: z.number().optional().describe(
          `For scope old, the age cutoff in days. Defaults to ${TTL_DAYS}.`,
        ),
      });
    default:
      throw new Error(`unknown tool schema: ${tool.name}`);
  }
}

function createServer({ era } = {}) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.name === "show_image"
          ? "Scratchpad"
          : tool.name === "scratchpad"
            ? "Scratchpad Path"
            : undefined,
        description: tool.description,
        inputSchema: toolSchema(tool),
        annotations: tool.annotations,
      },
      async (args) => ({ content: callTool(tool.name, args), isError: false }),
    );
  }

  log(`protocol ${era ?? "negotiating"}`);
  return server;
}

serveStdio(createServer, {
  legacy: "serve",
  onerror: (error) => log("server error:", error.message),
});

const swept = sweep();
log(`session ${SESSION_ID}`);
log(`path    ${SCRATCHPAD}`);
if (swept.length) log(`swept   ${swept.length} stale session(s)`);
