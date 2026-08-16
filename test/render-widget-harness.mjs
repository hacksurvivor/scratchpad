#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const [viewerPath, artifactPath, outputPath] = process.argv.slice(2);
if (!viewerPath || !artifactPath || !outputPath) {
  process.stderr.write(
    "usage: node test/render-widget-harness.mjs VIEWER.html ARTIFACT.html OUTPUT.html\n",
  );
  process.exit(2);
}

const viewer = fs.readFileSync(path.resolve(viewerPath), "utf8");
const artifact = fs.readFileSync(path.resolve(artifactPath), "utf8");
const serializedArtifact = JSON.stringify(artifact).replaceAll("<", "\\u003c");
const bootstrap = `<script>
window.openai = {
  toolResponseMetadata: {
    artifact: {
      title: "Decision workbench",
      html: ${serializedArtifact},
      displayMode: "inline"
    }
  },
  requestDisplayMode: async ({ mode }) => ({ mode })
};
</script>`;

const marker = "<script>\n    (() => {";
if (!viewer.includes(marker)) {
  throw new Error("artifact viewer bootstrap marker was not found");
}

const harness = viewer.replace(marker, `${bootstrap}\n${marker}`);
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), harness);
process.stdout.write(`${path.resolve(outputPath)}\n`);
