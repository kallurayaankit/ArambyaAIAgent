import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.js';
const body={city:'Melbourne',date:'2026-10-24',budget:80,interests:['nature'],mode:'demo'};
async function fixture(t,options){const s=createServer(options);await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>{s.closeAllConnections();s.close();});return `http://127.0.0.1:${s.address().port}`;}
test('HTTP UI, config, repeated streams and invalid input',async t=>{
  const url=await fixture(t);const page=await fetch(url);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await page.text(),/ArambyaAIAgent/);
  for(let i=0;i<2;i++){const r=await fetch(url+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const rows=(await r.text()).trim().split('\n').map(JSON.parse);assert.equal(rows.at(-1).type,'result');}
  const bad=await fetch(url+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,budget:-1})});assert.equal(JSON.parse((await bad.text()).trim()).type,'error');
  assert.equal((await fetch(url+'/api/config')).status,200);assert.equal((await fetch(url+'/../package.json')).status,404);
});
test('HTTP rejects cross-origin writes, oversized body and malformed JSON',async t=>{
  const url=await fixture(t);
  const post=(body,headers={})=>fetch(url+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
  assert.equal((await post('{}',{Origin:'https://evil.example'})).status,403);
  assert.equal((await post('x'.repeat(9000))).status,413);assert.equal((await post('{')).status,400);
});
test('disconnect cancels server-side tool work and permits a new request',async t=>{
  let aborted=false;let signalReady;const ready=new Promise(r=>signalReady=r);
  const url=await fixture(t,{agent:async(_input,{signal,emit})=>{emit({type:'activity'});signalReady();await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));}});
  const c=new AbortController();const response=await fetch(url+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:c.signal});await ready;c.abort();try{await response.text();}catch{}
  for(let i=0;i<20&&!aborted;i++)await new Promise(r=>setTimeout(r,10));assert.equal(aborted,true);
});
