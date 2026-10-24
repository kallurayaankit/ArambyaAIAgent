import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,checkHours,planDay,distance} from '../src/planner.js';
import {normalisePlaces,parseEvents,parseCityHours,request,getPlaces} from '../src/tools.js';
import {runAgent} from '../src/agent.js';
import {providerConfig,rankWithProvider} from '../src/provider.js';
import {demoCity,demoPlaces} from '../src/demo.js';
const input={city:'Melbourne',date:'2026-10-24',budget:80,interests:['art','history','nature'],mode:'live'};
test('input validates dates, budgets, interests and explicit demo scope',()=>{
  assert.equal(validateInput(input).city,'Melbourne');
  for(const change of [{date:'2026-02-30'},{date:'invalid'},{budget:-1},{budget:''},{budget:'Infinity'},{interests:[]},{interests:['unknown']},{mode:'auto'},{city:'Sydney',mode:'demo'}])assert.throws(()=>validateInput({...input,...change}));
});
test('hours: weekday ranges, closed days, whole visit and conservative complex rules',()=>{
  assert.equal(checkHours('Mo-Fr 09:00-17:00; Sa 10:00-15:00','2026-10-24',600,690),'listed-open');
  assert.equal(checkHours('Mo-Fr 09:00-17:00','2026-10-24',600,690),'listed-closed');
  assert.equal(checkHours('10:00-11:00','2026-10-24',600,690),'listed-closed');
  assert.equal(checkHours('24/7',input.date,600,690),'listed-open');
  for(const hours of [null,'Mo-Fr 09:00-17:00; PH off','sunrise-sunset','22:00-02:00','10:99-17:00'])assert.equal(checkHours(hours,input.date,600,690),'unknown');
});
test('plan respects allowance, reserve, distance and known closed hours',()=>{
  const places=[...demoPlaces,{...demoPlaces[0],id:'closed',name:'Closed',hours:'00:00-01:00'},{...demoPlaces[0],id:'far',lat:0}];
  const plan=planDay({...input,budget:20},demoCity,places,null);
  assert.ok(plan.stops.length);assert.ok(plan.estimatedActivities+plan.reserve<=20);
  assert.ok(!plan.stops.some(s=>s.id==='closed'||s.id==='far'));assert.ok(plan.stops.every(s=>s.end<='17:00'));
  assert.ok(plan.stops.every(s=>s.walkMinutes>=10));assert.equal(distance({lat:0,lon:0},{lat:0,lon:0}),0);
});
test('zero budget retains eligible outdoor stops without negative balance',()=>{const p=planDay({...input,budget:0},demoCity,demoPlaces,null);assert.ok(p.stops.length);assert.equal(p.estimatedActivities,0);assert.equal(p.remaining,0);});
test('OSM normalization removes duplicates and preserves sourced hours',()=>{
  const data={elements:[{id:1,type:'node',lat:1,lon:2,tags:{name:'Museum',tourism:'museum',opening_hours:'10:00-17:00',fee:'no'}},{id:2,type:'way',center:{lat:1,lon:2},tags:{name:'Museum'}},{id:3,tags:{name:'No coordinates'}}]};
  const rows=normalisePlaces(data);assert.equal(rows.length,1);assert.equal(rows[0].hours,'10:00-17:00');assert.equal(rows[0].cost,0);assert.equal(rows[0].source,'https://www.openstreetmap.org/node/1');
});
test('official city hours parser requires a complete unambiguous week',()=>{
  const table='<table id="date-times-table">'+['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=>`<tr><th>${d}</th><td><span aria-hidden="true">10am - 6pm</span><span class="sr-only">10am - 6pm</span></td></tr>`).join('')+'</table>';
  assert.equal(checkHours(parseCityHours(table),input.date,600,700),'listed-open');
  assert.equal(parseCityHours(table.replace('Sunday','Holiday')),null);
  assert.equal(parseCityHours(table.replace('10am - 6pm','check website')),null);
});
test('event extraction filters dates/cancellations and handles bad publisher markup',()=>{
  const html='<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'Event',name:'Current',startDate:'2026-10-23',endDate:'2026-10-25'},{'@type':'Event',name:'Past',startDate:'2020-01-01'},{'@type':'Event',name:'Cancelled',startDate:input.date,eventStatus:'EventCancelled'}]})+'</script><script type="application/ld+json">broken</script>';
  const rows=parseEvents(html,'https://example.com/event',input.date);assert.deepEqual(rows.map(x=>x.name),['Current']);assert.match(rows[0].note,/confirm/);
});
test('demo is labelled, uses no network tools and returns sources plus activity',async()=>{
  const bomb=()=>{throw new Error('Should not call a tool');};const result=await runAgent({...input,mode:'demo'},{tools:{geocode:bomb,getPlaces:bomb,getWeather:bomb,getEvents:bomb}});
  assert.match(result.dataMode,/OFFLINE DEMO/);assert.match(result.planner,/no LLM/);assert.ok(result.plan.stops.length);assert.equal(result.activity[0].tool,'demo');
});
test('partial live failure preserves live mode and never injects fixtures',async()=>{
  const result=await runAgent(input,{tools:{geocode:async()=>demoCity,getPlaces:async()=>{throw new Error('HTTP 429');},getWeather:async()=>{throw new Error('forecast unavailable');},getEvents:async()=>({items:[],note:'none'})}});
  assert.match(result.dataMode,/LIVE/);assert.equal(result.plan.stops.length,0);assert.ok(result.warnings.some(x=>x.includes('429')));assert.ok(!JSON.stringify(result.plan).includes('demo-'));
});
test('cancellation aborts work and never emits a result',async()=>{
  const c=new AbortController(),events=[];const p=runAgent(input,{signal:c.signal,emit:e=>events.push(e),tools:{geocode:async(_i,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}});c.abort(new Error('cancelled'));await assert.rejects(p,/cancelled/);assert.ok(!events.some(e=>e.type==='result'));
});
test('HTTP service error and parent cancellation propagate',async()=>{
  await assert.rejects(request('https://example.com',{fetcher:async(_u,o)=>{assert.equal(o.redirect,'manual');return new Response('',{status:302,headers:{Location:'https://other.example'}});}}),/302/);
  await assert.rejects(request('https://example.com',{fetcher:async()=>new Response('',{status:429})}),/429/);
  const c=new AbortController();c.abort();await assert.rejects(request('https://example.com',{signal:c.signal,fetcher:async(_u,o)=>{o.signal.throwIfAborted();}}),/abort/i);
});
test('provider is opt-in, loopback only, validates model candidate IDs',async()=>{
  assert.equal(providerConfig({}).enabled,false);
  assert.throws(()=>providerConfig({PLANNER_PROVIDER:'local',LOCAL_LLM_URL:'https://paid.example/v1',LOCAL_LLM_MODEL:'a'}),/local/);
  const cfg=providerConfig({PLANNER_PROVIDER:'local',LOCAL_LLM_MODEL:'installed-model'});
  await assert.rejects(rankWithProvider(cfg,input,demoPlaces,new AbortController().signal,async()=>Response.json({choices:[{message:{content:'["invented"]'}}]})),/invalid/);
  const ids=await rankWithProvider(cfg,input,demoPlaces,new AbortController().signal,async()=>Response.json({choices:[{message:{content:'["demo-library"]'}}]}));assert.deepEqual(ids,['demo-library']);
});
test('public Melbourne fallback is live, source-labelled and has unknown hours',async()=>{
  const fetcher=async url=>{if(!String(url).includes('data.melbourne'))return new Response('',{status:503});return Response.json({results:[{feature_name:'A public garden',sub_theme:'Informal Outdoor Facility (Park/Garden/Reserve)',co_ordinates:{lat:-37.814,lon:144.964}}]});};
  const rows=await getPlaces(input,demoCity,{signal:new AbortController().signal,fetcher});assert.equal(rows[0].hours,null);assert.match(rows[0].source,/data.melbourne/);assert.match(rows[0].dataNote,/dated/);
});
