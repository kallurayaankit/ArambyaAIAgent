import {runAgent} from './agent.js';
import {validateInput} from './planner.js';
const config={enabled:false,label:'Rule-based fallback (no LLM)'};
const cache=new Map();let active=0;
const headers={'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function hostedPlan(request,{agent=runAgent}={}) {
  const url=new URL(request.url);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return new Response('Origin rejected',{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return new Response('JSON required',{status:415});
  let input;
  try {
    let size=0;const chunks=[],reader=request.body?.getReader();
    if(!reader)throw new Error('Enter trip details.');
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return new Response('Request too large',{status:413});}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    input=validateInput(JSON.parse(new TextDecoder().decode(bytes)));
  }catch(e){return new Response(JSON.stringify({type:'error',message:e.message})+'\n',{headers});}
  const key=JSON.stringify(input),now=Date.now();
  for(const [k,v] of cache)if(v.expires<now)cache.delete(k);
  const saved=cache.get(key);
  if(saved)return new Response(JSON.stringify({type:'activity',tool:'cache',status:'success',message:'Using public-data result cached for up to 5 minutes. Original retrieval timestamp is preserved.'})+'\n'+JSON.stringify({type:'result',result:saved.result})+'\n',{headers});
  if(active>=3)return new Response('The public demo is busy. Try again in a minute.',{status:429});
  const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(new Error('Planning timed out. Please retry or choose offline demo.')),75000);active++;
  const signal=AbortSignal.any([request.signal,abort.signal]);
  const stream=new ReadableStream({start(controller){
    const encoder=new TextEncoder();let closed=false;
    const emit=event=>{if(closed)return;try{controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));}catch{closed=true;abort.abort();}};
    agent(input,{signal,emit,config}).then(result=>{if(!signal.aborted){if(cache.size>=40)cache.delete(cache.keys().next().value);cache.set(key,{result,expires:Date.now()+300000});}})
      .catch(e=>emit({type:'error',message:e.message||'Planning failed.'}))
      .finally(()=>{clearTimeout(timeout);active--;if(!closed){closed=true;try{controller.close();}catch{}}});
  },cancel(){abort.abort(new Error('Client cancelled'));}});
  return new Response(stream,{headers});
}
export const hostedConfig=()=>Response.json({provider:config.label+' · public demo; no model adapter enabled'});
