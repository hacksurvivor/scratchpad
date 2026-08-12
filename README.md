# Scratchpad

A session-scoped working and visual-prototyping directory for Codex, ported from
the equivalent workflow in Claude Code.

The agent gets its own working directory for every session — intermediate
results, throwaway scripts, downloaded data, analysis output. Anything that
would otherwise land in `/tmp` or clutter your working tree goes there instead.
Nothing written to it shows up in `git status`.

For visual work, the bundled `visual-scratchpad` skill turns the directory into
a rendering studio: Codex creates faithful UI variants, renders them, inspects
the resulting pixels, and shows the same image to the user before claiming the
design works.

## Install

```sh
./install.sh
```

That copies the plugin into your local marketplace (`~/plugins/`) and runs
`codex plugin add scratchpad@personal`. It also adds an idempotent marked block
to `~/.codex/AGENTS.md` so Codex resolves the scratchpad automatically at the
start of every task. Restart the Codex app afterward.

To do it by hand:

```sh
cp -R . ~/plugins/scratchpad
codex plugin add scratchpad@personal
```

If you keep your marketplace somewhere else:

```sh
SCRATCHPAD_MARKETPLACE_ROOT=/path/to/root \
SCRATCHPAD_MARKETPLACE_NAME=mine \
./install.sh
```

## The path

```
/tmp/codex-<uid>/<project-slug>/<session-id>/scratchpad
```

The project slug is the absolute project path with every character outside
`[A-Za-z0-9.]` replaced by a dash — the same transform Claude Code uses, so
`/Users/example/Code/my-app` becomes `-Users-example-Code-my-app`.

The session ID comes from `CODEX_SESSION_ID` when Codex exports it, and is
otherwise a UUID generated when the server starts. Codex spawns one server per
conversation, so that is one directory per session either way.

## Tools

| Tool | What it does |
| --- | --- |
| `scratchpad` | Absolute path to the scratchpad. Pass `subpath` for a path inside it; parent directories are created. |
| `scratchpad_present` | Returns generated images inline to the user and links the selected artifacts. This is the required final step for visual work. |
| `scratchpad_list` | Recursive listing with file sizes. |
| `scratchpad_clean` | `scope: "current"` empties this session. `scope: "old"` removes previous sessions. |

Paths that try to escape the scratchpad are rejected.

## Visual design loop

The plugin includes an implicitly triggered `visual-scratchpad` skill for UI and
UX work. It provides native SwiftUI/AppKit and web contact-sheet templates plus
small render helpers. The required loop is:

1. Write 2-4 faithful variants in the session scratchpad.
2. Render them to a PNG.
3. Open and inspect that PNG as image input.
4. Call `scratchpad_present` so the Scratchpad result itself contains the real
   generated image, then show the same PNG in the response.
5. Apply a treatment, then render the real product again when feasible.

A successful build is not visual verification. If rendering or image inspection
fails, the skill requires Codex to label the result `code-only` instead of
guessing how it looks.

## How the agent finds out

Two rails, because only one of them is guaranteed:

1. **MCP `instructions`** — returned by the negotiated MCP connection with the
   resolved path already substituted in. Harnesses that honor the field inject
   it into the system prompt, so the agent uses the scratchpad without being
   told and knows to publish visual artifacts with `scratchpad_present`.
2. **Global `AGENTS.md` bridge** — the installer adds a small marked block that
   tells Codex to call `scratchpad` once at task start and requires rendered
   evidence for visual work. This covers Codex
   builds that initialize the MCP server but do not add its `instructions` text
   to the model context.
3. **Bundled skills** — `scratchpad` triggers for temporary files and
   `visual-scratchpad` triggers for UI appearance, variants, and regressions.

Rail 1 gives Claude-style direct path injection. Rail 2 provides the same
always-on behavior through one automatic, auto-approved tool lookup. Rail 3 is
the final on-demand fallback.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `SCRATCHPAD_ROOT` | `/tmp/codex-<uid>` | Where scratchpads live. |
| `SCRATCHPAD_TTL_DAYS` | `7` | Age at which old sessions are swept. |
| `SCRATCHPAD_PROJECT_DIR` | — | Override project detection. |
| `SCRATCHPAD_SESSION_ID` | — | Override the session ID. |

Old session directories are swept on startup, since `/tmp` is not reliably
cleaned on macOS.

## Portability

The server uses the official MCP TypeScript SDK 2.x over stdio — no network at
runtime, no API keys, and no model calls. It supports the modern `2026-07-28`
protocol snapshot while retaining the SDK's legacy 2025 compatibility for
current hosts. Only `.codex-plugin/plugin.json`, `.mcp.json`, and `install.sh`
are Codex-specific; point another harness at `mcp/server.mjs` and it behaves
identically. The SwiftUI renderer requires macOS and Xcode command-line tools.
The HTML renderer requires Chrome, Chromium, or Edge, and the skill can use a
host browser screenshot tool instead.

## License

MIT
