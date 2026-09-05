#!/usr/bin/env node
// Disposable fixture host for the real viewer; no messages leave this page.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const [viewerPath, artifactPath, outputPath, previousPath] = process.argv.slice(2);
if (!viewerPath || !artifactPath || !outputPath) throw new Error('usage: node test/render-widget-harness.mjs VIEWER.html ARTIFACT.html OUTPUT.html [PREVIOUS.html]');
const viewer=fs.readFileSync(path.resolve(viewerPath),'utf8');
const read=(file,revision)=>{const html=fs.readFileSync(path.resolve(file),'utf8');return {title:'Decision workbench',subpath:path.basename(file),html,revision,sha256:createHash('sha256').update(html).digest('hex'),displayMode:'inline'}};
const artifact={...read(artifactPath,'R2'),...(previousPath?{previous:read(previousPath,'R1')}:{})};
const serialized=JSON.stringify(artifact).replaceAll('<','\\u003c');
const bootstrap=`<script>
window.__fixtureArtifact=${serialized};
window.__fixtureMessages=[];
window.__fixtureSendFailure=false;
window.openai={toolResponseMetadata:{artifact:window.__fixtureArtifact},requestDisplayMode:async({mode})=>({mode})};
addEventListener('message',event=>{
  if(event.source!==window || event.data?.jsonrpc!=='2.0' || !event.data.method || event.data.id==null)return;
  const request=event.data;
  window.__fixtureMessages.push(request);
  const result=request.method==='ui/initialize'?{hostContext:{availableDisplayModes:['inline','fullscreen']}}:request.method==='ui/message'&&window.__fixtureSendFailure?{isError:true}:{};
  window.postMessage({jsonrpc:'2.0',id:request.id,result},'*');
});
</script>`;
const marker='<script>\n    (() => {';
if(!viewer.includes(marker))throw new Error('viewer bootstrap marker not found');
fs.mkdirSync(path.dirname(path.resolve(outputPath)),{recursive:true});
fs.writeFileSync(path.resolve(outputPath),viewer.replace(marker,bootstrap+'\n'+marker));
process.stdout.write(path.resolve(outputPath)+'\n');
