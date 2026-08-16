---
name: html-artifact
description: "Create and open a self-contained interactive HTML artifact when a person would understand or steer the work better through an interface than through long Markdown. Use for interactive plans and specifications, decision workbenches, editable comparison tables, dashboards, status reports, living design systems, visual explainers, and disposable micro-apps. Do not use when a short answer, ordinary code change, or static image is clearer."
---

# HTML Artifact

Use HTML as a temporary human interface over the work, not merely as a document
format. The artifact belongs in the session scratchpad and should help the user
inspect, compare, edit, or choose.

## Workflow

1. Use the session scratchpad path already present in context. If it is absent,
   resolve it once with `scratchpad`. Put artifacts under `artifacts/`.
2. Create one self-contained HTML file with inline CSS and JavaScript. Do not
   depend on CDNs, remote fonts, APIs, analytics, or external assets.
3. Design for engagement rather than decoration: expose the important
   decisions, tradeoffs, excerpts, mockups, tables, or controls needed for the
   user to understand and steer the work.
4. Call `open_html` once per material revision. Use `display: "fullscreen"` for
   plans, specifications, dashboards, and design systems; use `inline` only for
   compact comparisons.
5. If appearance is part of correctness, render that same HTML to a PNG and
   call `show_image` exactly once. `open_html` is the human interaction channel;
   `show_image` is the agent's pixel-inspection channel.
6. Keep the artifact disposable. Product code changes happen only after the
   user selects a direction or the task already authorizes direct implementation.

## Selection bridge

When the artifact contains meaningful choices or editable state, send a bounded
summary to its parent whenever that state changes:

```js
window.parent.postMessage({
  type: "scratchpad:update",
  state: { choice: "B", notes: "Prefer the quieter header" },
}, "*");
```

The Scratchpad viewer keeps this state local until the user explicitly presses
**Send selection**. Never place secrets, credentials, personal data, hidden
reasoning, or entire source files in the selection payload. Keep it below 20 KB.

## Quality bar

- Prefer one coherent interface over a collection of disconnected files.
- Use readable typography, clear hierarchy, keyboard-accessible controls, and
  responsive layouts.
- Include enough source context to make decisions, but summarize large inputs.
- Treat HTML source as implementation, not visual proof. When visual claims
  matter, inspect the rendered PNG through `show_image` before making them.
- If `open_html` succeeds but image rendering does not, say the artifact is
  interactive but not visually verified.

