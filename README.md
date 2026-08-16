# Scratchpad

A session-scoped working and visual-prototyping directory for Codex, ported from
the equivalent workflow in Claude Code.

The agent gets its own working directory for every session — intermediate
results, throwaway scripts, downloaded data, analysis output. Anything that
would otherwise land in `/tmp` or clutter your working tree goes there instead.
Nothing written to it shows up in `git status`.

For plans, specifications, dashboards, design systems, and disposable
micro-apps, the bundled `html-artifact` skill turns the directory into an
interactive human interface. Codex opens one self-contained HTML artifact in a
sandboxed MCP App inside the conversation. The user can inspect and manipulate
it, then explicitly send a bounded selection back to Codex.

For visual work, the bundled `visual-scratchpad` skill adds a separate
verification channel: Codex renders that same HTML or the real product,
inspects the resulting pixels, and shows the image to the user before claiming
the design works.

## Install

```sh
./install.sh
```

That copies the plugin into your local marketplace (`~/plugins/`) and runs
`codex plugin add scratchpad@personal`. It also removes the unconditional
`~/.codex/AGENTS.md` rule installed by versions before 0.2. Restart the Codex
app afterward.

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

The session ID comes from `CODEX_THREAD_ID` or `CODEX_SESSION_ID` when Codex
exports one, and is otherwise a UUID generated when the server starts. Codex
spawns one server per conversation, so that is one directory per session either
way.

## Tools

| Tool | What it does |
| --- | --- |
| `scratchpad` | Absolute path to the scratchpad. It is called only when a temporary path is actually needed and not already known. |
| `open_html` | Opens one self-contained HTML file as a sandboxed interactive MCP App. Defaults to full screen. |
| `show_image` | Returns one exact PNG, JPEG, GIF, or WebP image inline. It emits no resource links and cannot open Web Preview. |
| `scratchpad_list` | Recursive listing with file sizes. |
| `scratchpad_clean` | `scope: "current"` empties this session. `scope: "old"` removes previous sessions. |

Paths that try to escape the scratchpad are rejected.

## Interactive HTML loop

The implicitly triggered `html-artifact` skill is for work that becomes easier
to understand or steer as an interface instead of long Markdown:

1. Create one self-contained HTML plan, specification, dashboard, design
   system, comparison, or disposable micro-app in the session scratchpad.
2. Call `open_html` once per material revision. Codex links the tool to a native
   MCP App resource using `text/html;profile=mcp-app` and
   `_meta.ui.resourceUri`.
3. The viewer displays the artifact in a nested `sandbox="allow-scripts"`
   iframe. It injects a restrictive content security policy that blocks network
   access, external resources, forms, frames, and objects.
4. Interactive artifacts can post bounded selection state to the viewer. That
   state remains local until the user presses **Send selection**.

The HTML itself is delivered to the widget through tool-result `_meta`, which
keeps it out of the model-visible transcript. The model receives only a small
title, path, size, and SHA-256 receipt.

## Visual design loop

The plugin includes an implicitly triggered `visual-scratchpad` skill for UI and
UX work. It provides native SwiftUI/AppKit and web contact-sheet templates plus
small render helpers. The required loop is:

1. Write 2-4 faithful variants in the session scratchpad.
2. For web work, call `open_html` so the user can inspect and interact with the
   actual artifact.
3. Render the same artifact or real product to a PNG.
4. Call `show_image` once with that exact PNG. Its returned pixels are both the
   agent's image input and the user's inline view, matching the role of Claude's
   native `Read(image)` result without returning file links.
5. Inspect that result before making any visual claim, then show the same PNG in
   the response.
6. Apply a treatment, then render the real product again when feasible.

A successful build is not visual verification. If rendering or image inspection
fails, the skill requires Codex to label the result `code-only` instead of
guessing how it looks.

## How activation works

Claude Code's native scratchpad is a host feature: it injects the path into the
system prompt, then ordinary `Write`, `Bash`, and `Read(image)` calls perform the
visual loop. An MCP plugin cannot make Codex classify file writes or render its
built-in image reader exactly the same way.

Scratchpad therefore maps the host-specific behavior onto two portable MCP
channels:

1. The MCP server advertises its session path in the standard `instructions`
   field. Current Codex builds expose it with the MCP tool context, so the agent
   can usually write directly without a resolver call. The same field contains
   conditional rules for interactive HTML and visual verification.
2. The narrowly described `scratchpad` skill resolves a path only when temporary
   files are genuinely needed. Ordinary questions cause no Scratchpad call.
3. The `html-artifact` skill activates when a rich interface is more useful than
   long Markdown and opens it through `open_html`.
4. The `visual-scratchpad` skill activates for appearance-sensitive work,
   opens web artifacts, renders and inspects a real image, then returns that
   image through `show_image`.

There is intentionally no global start-of-task rule and no artifact-directory
presenter. Interactive HTML is deliberate and tool-linked; ordinary questions
do not trigger Scratchpad.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `SCRATCHPAD_ROOT` | `/tmp/codex-<uid>` | Where scratchpads live. |
| `SCRATCHPAD_TTL_DAYS` | `7` | Age at which old sessions are swept. |
| `SCRATCHPAD_PROJECT_DIR` | — | Override project detection. |
| `CODEX_THREAD_ID` | — | Preferred session identity when supplied by Codex. |
| `SCRATCHPAD_SESSION_ID` | — | Override the session ID. |

Old session directories are swept on startup, since `/tmp` is not reliably
cleaned on macOS.

## Portability

The server uses the official MCP TypeScript server SDK 2.x over stdio — no
network at runtime, no API keys, and no model calls. It negotiates the SDK's
current `2025-11-25` protocol snapshot while retaining compatibility with older
2025 clients. Only `.codex-plugin/plugin.json`, `.mcp.json`, and `install.sh`
are Codex-specific; point another harness at `mcp/server.mjs` and it behaves
identically. The SwiftUI renderer requires macOS and Xcode command-line tools.
The HTML renderer requires Chrome, Chromium, or Edge, and the skill can use a
host browser screenshot tool instead.

## License

MIT
