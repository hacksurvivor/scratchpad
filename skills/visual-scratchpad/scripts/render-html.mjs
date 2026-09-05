#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const [chrome,input,output,width,height]=process.argv.slice(2);
if(!chrome||!input||!output||!/^\d+$/.test(width)||!/^\d+$/.test(height))throw new Error('Expected chrome, input, output, width, height');
const profile=fs.mkdtempSync(path.join(path.dirname(output),'.scratchpad-render-'));
const screenshot=path.join(profile,'capture.png');
const child=spawn(chrome,[`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--headless=new','--disable-gpu','--hide-scrollbars','--virtual-time-budget=1500',`--window-size=${width},${height}`,`--screenshot=${screenshot}`,pathToFileURL(input).href],{stdio:'ignore'});
let spawnError;child.on('error',error=>{spawnError=error});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let png;
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){
    if(spawnError)throw spawnError;
    if(fs.existsSync(screenshot)){
      const bytes=fs.readFileSync(screenshot);
      if(bytes.length>20&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.subarray(-8,-4).toString()==='IEND'){png=bytes;break;}
    }
    if(child.exitCode!=null)break;
    await delay(100);
  }
  if(!png)throw new Error('Renderer did not produce a complete PNG within 20 seconds');
  fs.writeFileSync(output,png);
  process.stdout.write(output+'\n');
}finally{
  if(child.exitCode==null&&!spawnError){
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(1500)]);
    if(child.exitCode==null)child.kill('SIGKILL');
  }
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
