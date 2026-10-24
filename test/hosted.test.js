import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedPlan,hostedConfig} from '../src/hosted.js';
const input={city:'Melbourne',date:'2026-10-24',budget:80,interests:['nature'],mode:'demo'};
const req=(body=input,origin='https://example.com')=>new Request('https://example.com/api/plan',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
test('hosted demo streams and caches with original timestamps',async()=>{
  const first=(await(await hostedPlan(req())).text()).trim().split('\n').map(JSON.parse);assert.equal(first.at(-1).type,'result');
  const second=(await(await hostedPlan(req())).text()).trim().split('\n').map(JSON.parse);assert.equal(second[0].tool,'cache');assert.equal(second.at(-1).result.generatedAt,first.at(-1).result.generatedAt);
  assert.match((await hostedConfig().json()).provider,/no model/);
});
test('hosted adapter rejects other origins, bad inputs and oversized payloads',async()=>{
  assert.equal((await hostedPlan(req(input,'https://evil.example'))).status,403);
  assert.equal(JSON.parse((await(await hostedPlan(req({...input,budget:-1}))).text()).trim()).type,'error');
  assert.equal((await hostedPlan(req({...input,city:'x'.repeat(9000)}))).status,413);
});
