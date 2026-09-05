# Approved Scratchpad R1

Approved on 2026-09-05.
The complete interactive reference is `approved-r1.html`.

Scope: desktop/tablet/mobile artifact viewports; current and previous revision comparison; revision-specific notes, feedback/request changes/approval choices; explicit host submission; loading, empty, preview error, send failure states; light/dark appearance and focus mode.

Reference screens inspected on Mobbin:
- https://mobbin.com/screens/b269c185-d9be-4d05-b035-7e8a88209eaf — Figma canvas and separate comments panel.
- https://mobbin.com/screens/8ca37f64-80c8-43c8-a805-eb00ddf2e272 — Figma prototype controls.

Use the same neutral canvas, restrained green accents, compact toolbar, 300px review panel, and stacked layout below 620px. The Forma project content and R1/R2 sample revisions in the prototype are illustrative; real artifacts occupy sandboxed iframes. Demo state controls and the proposal approval button are not product controls.

Comparison accepts an explicit previous HTML artifact; do not fabricate revision history. Feedback targets the current artifact's revision, path, and SHA-256. Host acknowledgement is required before claiming delivery. Keep review drafts local until the user sends them. Device modes set the actual iframe CSS viewport and permit scrolling when the canvas is narrower. Notes and selections survive repeated notifications for identical content; different revisions start a separate draft. Preview reload is explicit.

Validation: server fixture tests, isolated viewer bridge tests, browser smoke tests with disposable fixtures, and rendered desktop/mobile checks.
