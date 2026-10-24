import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {runAgent} from './src/agent.js';
import {providerConfig} from './src/provider.js';
const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
export function createServer({agent=runAgent,config=providerConfig()}={}) {
  let active=0;
  return http.createServer(async(req,res)=>{
    const host=req.headers.host||'';
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)){res.writeHead(403);res.end('Local requests only');return;}
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(req.method==='GET'&&req.url==='/api/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({provider:config.label}));return;}
    if(req.method==='POST'&&req.url==='/api/plan') {
      const origin=req.headers.origin;
      if(origin&&origin!==`http://${host}`){res.writeHead(403);res.end('Origin rejected');return;}
      if(!req.headers['content-type']?.startsWith('application/json')){res.writeHead(415);res.end('JSON required');return;}
      if(active>=3){res.writeHead(429);res.end('Too many active requests. Cancel another plan first.');return;}
      let body='';
      try{for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192){res.writeHead(413);res.end('Request too large');return;}}}catch{return;}
      let input;try{input=JSON.parse(body);}catch{res.writeHead(400);res.end('Invalid JSON');return;}
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(new Error('Planning exceeded 90 seconds. Try again or select demo.')),90000);
      res.on('close',()=>controller.abort(new Error('Client disconnected')));
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});
      const emit=x=>{if(!res.destroyed)res.write(JSON.stringify(x)+'\n');};active++;
      try{await agent(input,{signal:controller.signal,emit,config});}
      catch(e){emit({type:'error',message:e.message||'Planning failed. Please try again.'});}
      finally{clearTimeout(timeout);active--;res.end();}return;
    }
    if(req.method==='GET'&&assets[req.url]) {
      const [name,type]=assets[req.url];try{const data=await readFile(new URL('./public/'+name,import.meta.url));res.writeHead(200,{'Content-Type':type});res.end(data);}catch{res.writeHead(500);res.end('UI asset missing; run npm run build to check files.');}return;
    }
    res.writeHead(404);res.end('Not found');
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||4317);
  const server=createServer();
  server.on('error',e=>{console.error(`Cannot start ArambyaAIAgent: ${e.message}`);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`ArambyaAIAgent is running locally at http://127.0.0.1:${port}\nNo credentials required. Live public tools; rule-based fallback by default.`));
}
