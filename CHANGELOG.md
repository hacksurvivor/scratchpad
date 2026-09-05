# Changelog

## 0.4.0 — 2026-09-05

- Add desktop/tablet/mobile preview widths, two-revision comparison, focus mode, and viewer dark appearance.
- Add revision-specific review notes and feedback/change-request/approval decisions, with exact path and SHA-256 receipts.
- Preserve review drafts across repeated artifact notifications, reloads, and revision switches while the viewer remains open.
- Bound host requests, reject malformed or oversized selections without truncating them, and report unconfirmed delivery without automatic retries.
- Enforce scratchpad directory symlink containment and report missing paths accurately.
- Isolate browser renderer profiles and terminate captures after a bounded wait.
- Publish the MCP server on npm as `codex-scratchpad-plugin`, with the `scratchpad-mcp` command.

Validation: 20 server/viewer tests and a disposable browser-host smoke flow passed; desktop/mobile renders inspected. Live feedback delivery through the Codex host requires a fresh task using the updated plugin.
