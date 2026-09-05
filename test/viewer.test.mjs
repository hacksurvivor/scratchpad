import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html = fs.readFileSync(new URL('../assets/artifact-viewer.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>\n    (() => {') + 8, html.lastIndexOf('</script>'));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness() {
  const elements = new Map(), listeners = new Map(), messages = [], timers = new Map();
  let nextTimer = 1;
  class Element {
    constructor(id, dataset = {}) { this.id=id; this.dataset=dataset; this.tagName='BUTTON'; this.disabled=false; this.hidden=false; this.value=''; this.textContent=''; this.attrs={}; this.events={}; this.contentWindow={}; this.loads=0; this.classList={toggle: (key,value) => { this.classes ||= new Set(); const yes=value ?? !this.classes.has(key); if(yes)this.classes.add(key);else this.classes.delete(key);return yes; }}; }
    set srcdoc(value) { this.source=value; this.loads++; }
    get srcdoc() { return this.source; }
    setAttribute(k,v) { this.attrs[k]=v; }
    removeAttribute(k) { delete this.attrs[k]; if(k==='srcdoc') this.source=undefined; }
    addEventListener(k,fn) { (this.events[k] ||= []).push(fn); }
    trigger(k) { return Promise.all((this.events[k] || []).map(fn => fn({target:this}))); }
  }
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], new Element(match[1]));
  const devices = ['desktop','tablet','mobile'].map(x=>new Element(x,{device:x}));
  const decisions = ['feedback','changes','approve'].map(x=>new Element(x,{decision:x}));
  const parent={postMessage:message=>messages.push(message)};
  const window={parent,addEventListener:(name,fn)=>{(listeners.get(name)||listeners.set(name,[]).get(name)).push(fn)}};
  const document={getElementById:id=>elements.get(id),querySelectorAll:s=>s==='[data-decision]'?decisions:devices,body:new Element('body')};
  // Parser is a test double; rendering/CSP behavior is validated separately.
  class Parser { parseFromString(source) { const parts=[];return {querySelectorAll:()=>[],createElement:()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v}}),head:{prepend:n=>parts.unshift(n)},documentElement:{get outerHTML(){return '<html><head>'+parts.map(x=>x.textContent?'<script>'+x.textContent+'</script>':'<meta content="'+x.attrs.content+'">').join('')+'</head><body>'+source+'</body></html>'}}}; } }
  vm.runInNewContext(script,{window,document,DOMParser:Parser,TextEncoder,Map,JSON,Date,Math,Error,setTimeout:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)});
  const host=(message)=>{for(const fn of listeners.get('message')||[])fn({source:parent,data:message});};
  const artifact=(overrides={})=>({title:'Example',subpath:'current.html',revision:'R2',sha256:'b'.repeat(64),html:'<h1>Current</h1>',displayMode:'inline',...overrides});
  return {elements,devices,decisions,messages,timers,document,
    open: value=>host({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{_meta:{artifact:value||artifact()}}}),
    respond:(request,result={})=>host({jsonrpc:'2.0',id:request.id,result}),
    selection: state=>{for(const fn of listeners.get('message')||[])fn({source:elements.get('artifact').contentWindow,data:{type:'scratchpad:update',state}});},
    foreign: state=>{for(const fn of listeners.get('message')||[])fn({source:{},data:{type:'scratchpad:update',state}});},
    host, artifact,
    async ready(){ this.respond(messages.find(x=>x.method==='ui/initialize'),{hostContext:{availableDisplayModes:['inline','fullscreen']}});await flush();this.open();await elements.get('artifact').trigger('load'); },
    async note(text){elements.get('notes').value=text;await elements.get('notes').trigger('input');},
    async click(id){void elements.get(id).trigger('click');await flush();},
  };
}
test('identical host notifications preserve review and iframe state',async()=>{const h=harness();await h.ready();await h.note('Keep this note');h.selection({choice:'B'});const before=h.elements.get('artifact').loads;h.open();assert.equal(h.elements.get('artifact').loads,before);assert.equal(h.elements.get('notes').value,'Keep this note');assert.match(h.elements.get('selection-preview').textContent,/B/);assert.equal(h.elements.get('send').disabled,false);});
test('send carries full revision and JSON, waits for acknowledgement, and prevents duplicates',async()=>{const h=harness();await h.ready();h.selection({choice:'B'});await h.note('Use B');await h.click('send');await h.click('send');const requests=h.messages.filter(x=>x.method==='ui/message');assert.equal(requests.length,1);assert.equal(h.elements.get('send').textContent,'Sending…');const body=JSON.parse(requests[0].params.content[0].text.split('\n').slice(1).join('\n'));assert.equal(body.artifact.sha256,'b'.repeat(64));assert.equal(body.notes,'Use B');assert.deepEqual(body.selection,{choice:'B'});h.respond(requests[0],{});await flush();assert.equal(h.elements.get('send').textContent,'Sent');assert.equal(h.elements.get('send').disabled,true);});
test('failed and timed-out sends preserve draft and never retry automatically',async()=>{for(const failure of ['error','timeout']){const h=harness();await h.ready();await h.note('Keep');await h.click('send');const req=h.messages.find(x=>x.method==='ui/message');if(failure==='error')h.respond(req,{isError:true});else for(const [id,t] of h.timers)if(t.ms===10000){h.timers.delete(id);t.fn();}await flush();assert.match(h.elements.get('send-status').textContent,/Delivery not confirmed/);assert.equal(h.elements.get('notes').value,'Keep');assert.equal(h.elements.get('send').disabled,false);assert.equal(h.messages.filter(x=>x.method==='ui/message').length,1);}});
test('edits during sending remain unsent after the older payload is acknowledged',async()=>{const h=harness();await h.ready();await h.note('First');await h.click('send');await h.note('Second');assert.equal(h.elements.get('send').disabled,true);h.respond(h.messages.find(x=>x.method==='ui/message'),{});await flush();assert.equal(h.elements.get('notes').value,'Second');assert.equal(h.elements.get('send').disabled,false);assert.match(h.elements.get('send-status').textContent,/newer edits/);});
test('different revisions have separate drafts and restore on return',async()=>{const h=harness();await h.ready();await h.note('R2 note');h.open(h.artifact({sha256:'c'.repeat(64),revision:'R3',html:'<h1>Next</h1>'}));assert.equal(h.elements.get('notes').value,'');await h.note('R3 note');h.open();assert.equal(h.elements.get('notes').value,'R2 note');});
test('large multibyte and cyclic selections are rejected without truncation',async()=>{const h=harness();await h.ready();for(const value of [{text:'界'.repeat(7000)},(()=>{const x={};x.x=x;return x})()]){h.selection(value);assert.equal(h.elements.get('send').disabled,true);assert.match(h.elements.get('send-status').textContent,/invalid/);}h.selection({choice:'valid'});assert.equal(h.elements.get('send').disabled,false);});
test('only the current artifact frame can supply selection',async()=>{const h=harness();await h.ready();h.foreign({choice:'forged'});assert.equal(h.elements.get('send').disabled,true);});
test('comparison requires a previous artifact and device changes do not reload it',async()=>{const h=harness();await h.ready();assert.equal(h.elements.get('compare-mode').disabled,true);h.open(h.artifact({previous:h.artifact({revision:'R1',sha256:'a'.repeat(64),html:'<p>Previous</p>'})}));assert.equal(h.elements.get('compare-mode').disabled,false);await h.click('compare-mode');assert.equal(h.elements.get('previous-wrap').hidden,false);const before=h.elements.get('artifact').loads;await h.devices[2].trigger('click');assert.equal(h.elements.get('boards').dataset.device,'mobile');assert.equal(h.elements.get('artifact').loads,before);});
test('approval remains disabled until the current iframe loads',async()=>{const h=harness();await h.ready();h.open(h.artifact({revision:'R3',sha256:'c'.repeat(64)}));await h.decisions[2].trigger('click');assert.equal(h.elements.get('send').disabled,true);await h.elements.get('artifact').trigger('load');assert.equal(h.elements.get('send').disabled,false);});
test('reload preserves feedback while resetting preview loading state',async()=>{const h=harness();await h.ready();await h.note('Preserve me');await h.click('reload');assert.equal(h.elements.get('notes').value,'Preserve me');assert.equal(h.elements.get('status').textContent,'Loading preview…');await h.elements.get('artifact').trigger('load');assert.equal(h.elements.get('status').textContent,'Ready');});
test('an acknowledgement for an older revision does not mark the current draft sent',async()=>{const h=harness();await h.ready();await h.note('First revision');await h.click('send');h.open(h.artifact({revision:'R3',sha256:'c'.repeat(64)}));await h.note('Current revision');h.respond(h.messages.find(x=>x.method==='ui/message'),{});await flush();assert.equal(h.elements.get('notes').value,'Current revision');assert.equal(h.elements.get('send').disabled,false);assert.notEqual(h.elements.get('draft-badge').textContent,'Sent');});
test('host initialization failure leaves local preview usable and no unhandled rejection',async()=>{const h=harness();h.open();for(const [id,t]of h.timers)if(t.ms===10000){h.timers.delete(id);t.fn();}await flush();assert.equal(h.elements.get('boards').hidden,false);assert.equal(h.elements.get('notes').disabled,false);});
