import {runAgent} from '../src/agent.js';
import {mkdir,writeFile} from 'node:fs/promises';
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const result=await runAgent({city:'Melbourne',date,budget:80,interests:['art','history','nature'],mode:'live'},{emit:e=>{if(e.type==='activity')console.log(`${e.tool} / ${e.status}: ${e.message}`);}});
await mkdir('test-results',{recursive:true});await writeFile('test-results/live-result.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({date,stops:result.plan.stops.map(x=>x.name),weather:result.weather,events:result.events.items.map(x=>x.name),warnings:result.warnings},null,2));
if(!result.plan.stops.length)process.exitCode=1;
