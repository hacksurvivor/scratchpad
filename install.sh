#!/usr/bin/env bash
# Install the scratchpad plugin into Codex.
#
# Copies this directory into your local plugin marketplace, then asks Codex to
# install it. Nothing is written to config.toml by hand — `codex plugin add`
# owns that file.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKETPLACE_ROOT="${SCRATCHPAD_MARKETPLACE_ROOT:-$HOME}"
MARKETPLACE_NAME="${SCRATCHPAD_MARKETPLACE_NAME:-personal}"
DEST="$MARKETPLACE_ROOT/plugins/scratchpad"
MARKETPLACE_MANIFEST="$MARKETPLACE_ROOT/.agents/plugins/marketplace.json"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
GLOBAL_AGENTS="$CODEX_HOME_DIR/AGENTS.md"

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v codex >/dev/null 2>&1 || die "the codex CLI is not on your PATH"
command -v node  >/dev/null 2>&1 || die "node is not on your PATH (the server needs it)"
command -v npm   >/dev/null 2>&1 || die "npm is not on your PATH (needed to install the official MCP SDK)"

say "source      $SRC"
say "marketplace $MARKETPLACE_NAME ($MARKETPLACE_ROOT)"
say "destination $DEST"
say

if [ -e "$DEST" ]; then
  printf 'A plugin already exists at %s. Overwrite? [y/N] ' "$DEST"
  read -r reply
  case "$reply" in
    [yY]*) rm -rf "$DEST" ;;
    *) die "aborted" ;;
  esac
fi

mkdir -p "$MARKETPLACE_ROOT/plugins"
cp -R "$SRC" "$DEST"
rm -f "$DEST/install.sh"
say "copied plugin into the marketplace"

say "installing official MCP SDK dependencies"
(
  cd "$DEST"
  npm ci --omit=dev --ignore-scripts
)

# Local marketplaces are manifest-indexed; copying a plugin directory alone is
# not enough for `codex plugin add` to discover it. Create or update the entry
# without disturbing any other plugins already present in the marketplace.
mkdir -p "$(dirname "$MARKETPLACE_MANIFEST")"
node - "$MARKETPLACE_MANIFEST" "$MARKETPLACE_NAME" <<'NODE'
const fs = require("node:fs");

const [manifestPath, marketplaceName] = process.argv.slice(2);
let manifest = {
  name: marketplaceName,
  interface: { displayName: marketplaceName },
  plugins: [],
};

if (fs.existsSync(manifestPath)) {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.name !== marketplaceName) {
    throw new Error(
      `marketplace name mismatch: expected ${marketplaceName}, found ${manifest.name}`,
    );
  }
  if (!Array.isArray(manifest.plugins)) manifest.plugins = [];
}

const plugin = {
  name: "scratchpad",
  source: { source: "local", path: "./plugins/scratchpad" },
  policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
  category: "Productivity",
};
const existing = manifest.plugins.findIndex((item) => item.name === plugin.name);
if (existing === -1) manifest.plugins.push(plugin);
else manifest.plugins[existing] = plugin;

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
say "indexed scratchpad in the marketplace manifest"

# Codex discovers the standard personal marketplace implicitly. A custom local
# marketplace still needs explicit registration before the plugin can be added.
if [ "$MARKETPLACE_ROOT" != "$HOME" ]; then
  if ! codex plugin marketplace list 2>/dev/null | grep -q "$MARKETPLACE_NAME"; then
    say "registering marketplace $MARKETPLACE_ROOT"
    codex plugin marketplace add "$MARKETPLACE_ROOT"
  fi
fi

say "installing scratchpad@$MARKETPLACE_NAME"
if codex plugin add "scratchpad@$MARKETPLACE_NAME"; then
  mkdir -p "$CODEX_HOME_DIR"
  node - "$GLOBAL_AGENTS" <<'NODE'
const fs = require("node:fs");

const agentsPath = process.argv[2];
const start = "<!-- scratchpad-plugin:start -->";
const end = "<!-- scratchpad-plugin:end -->";
const block = `${start}
## Automatic scratchpad and visual verification

At the start of every task, resolve the session scratchpad by calling
\`mcp__scratchpad__scratchpad\` once unless its exact path is already in
the current context. Use the returned directory for all temporary,
intermediate, and throwaway files instead of /tmp or the project workspace.
Do the lookup without announcing it unless it fails.

When appearance is part of correctness, use the scratchpad as a visual design
studio. Render faithful UI variants or the real product to an image, inspect the
pixels with the available image-viewing tool, then call
mcp__scratchpad__scratchpad_present on the final image or its directory so
the real generation is visible inside the Scratchpad tool result. Also show the
same image to the user in the response. A path or file listing is not visual
evidence. Do not claim a visual result from source code or green tests alone.
${end}`;

let contents = fs.existsSync(agentsPath)
  ? fs.readFileSync(agentsPath, "utf8")
  : "";
const from = contents.indexOf(start);
const to = contents.indexOf(end);
if (from !== -1 && to !== -1 && to >= from) {
  contents = `${contents.slice(0, from)}${block}${contents.slice(to + end.length)}`;
} else {
  contents = `${contents.trimEnd()}${contents.trim() ? "\n\n" : ""}${block}\n`;
}
fs.writeFileSync(agentsPath, contents);
NODE
  say "enabled automatic scratchpad resolution in $GLOBAL_AGENTS"
  say
  say "Done. Restart the Codex app so it picks up the new plugin."
  say "Then ask it: \"where is my scratchpad?\""
else
  die "codex plugin add failed — try 'codex plugin list' to see what Codex can see"
fi
