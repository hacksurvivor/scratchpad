---
name: visual-scratchpad
description: "Render, inspect, and share real interface variants before making or approving visual design changes. Use automatically when appearance is part of correctness: UI/UX work, buttons, colors, typography, spacing, layout, hierarchy, glass/material effects, hover/pressed/disabled states, responsive behavior, SwiftUI, AppKit, iOS, web interfaces, screenshot comparisons, visual regressions, or any request asking how a design looks. Do not use for backend-only or behavior-only changes with no visible surface."
---

# Visual Scratchpad

Use the session scratchpad as a disposable rendering studio. Treat source code as
an input to visual verification, never as proof of appearance.

## Workflow

1. Use the session directory already present in context. If its exact path is
   absent, resolve it once with `mcp__scratchpad__scratchpad`. Put probes,
   binaries, HTML, screenshots, and contact sheets under `visual/` there.
2. Read the real component and its design context before mocking it. Preserve
   actual labels, dimensions, fonts, colors, states, and surrounding surface
   whenever they affect the question.
3. Render 2-4 labeled variants in one contact sheet when comparing directions.
   Include relevant states such as normal, hover, pressed, disabled, light, or
   dark. Change one design variable at a time when diagnosing a regression.
4. Prefer the real running product. Otherwise use the smallest faithful probe:
   - Web: copy `assets/web-contact-sheet.html`, adapt it, and capture it with the
     browser or `scripts/render-html.sh`.
   - macOS SwiftUI/AppKit: copy `assets/swiftui-contact-sheet.swift`, adapt it,
     and run `scripts/render-swiftui.sh SOURCE.swift OUTPUT.png`.
   - iOS: render the real screen or a small host app in Simulator and capture it
     with the available simulator screenshot tooling.
5. Call `mcp__scratchpad__show_image` with the exact final image, never a
   directory or HTML file. Its returned pixels are both the agent's visual input
   and the user's inline result. Inspect those pixels before drawing any visual
   conclusion; successful compilation, metadata, and screenshot existence do
   not count. Call it exactly once for each unchanged final image. The result
   contains no resource links and cannot open Web Preview.
6. Also show the inspected image in the final response with an absolute-path
   Markdown image. Briefly name what changed and what to compare.
7. Apply the selected treatment to product code only after visual evidence. Then
   render the real product again and inspect the after-state when feasible.

## Evidence rule

Use these labels precisely:

- `visually verified`: `show_image` returned a rendered image and its pixels were
  inspected this turn.
- `rendered, not inspected`: an image exists but could not be opened.
- `code-only`: rendering was unavailable or failed.

Never claim that a design looks correct from code or green tests alone. If the
rendering path fails, report the exact failure and keep the design unverified.
Never finish visual work with artifacts hidden inside the scratchpad. The user
must receive the single `show_image` result containing the actual pixels.

## User loop

When the user asks to compare variants, show the contact sheet before choosing
for them. When the user asks for a direct implementation, use visual inspection
to make the choice, show the evidence, and state the chosen treatment. Keep all
throwaway rendering files in the scratchpad; only requested deliverables belong
in the project or output directory.
