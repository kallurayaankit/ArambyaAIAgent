const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const link=(url,label)=>safeUrl(url)?`<a href="${esc(safeUrl(url))}" target="_blank" rel="noreferrer">${esc(label)} ↗</a>`:esc(label);
let controller=null,runId=0,lastResult=null;
$('date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
fetch('/api/config').then(r=>r.json()).then(c=>$('provider').textContent=c.provider+'. No cloud model calls.').catch(()=>{});
function busy(value){$('plan-button').disabled=value;$('cancel').hidden=!value;$('trip-form').setAttribute('aria-busy',String(value));}
function activity(event){const list=$('activity-log');if(!list.dataset.started){list.textContent='';list.dataset.started='1';}const li=document.createElement('li');li.className=event.status;li.textContent=`${event.tool} · ${event.status}: ${event.message}`;list.append(li);$('activity-count').textContent=list.children.length;list.scrollTop=list.scrollHeight;}
$('cancel').addEventListener('click',()=>{runId++;controller?.abort();controller=null;busy(false);$('status').textContent='Cancelled. You can change the details and try again.';activity({tool:'request',status:'cancelled',message:'Cancelled by you. No partial plan saved.'});});
$('trip-form').addEventListener('submit',async event=>{
  event.preventDefault();controller?.abort();controller=new AbortController();const active=controller,id=++runId;
  lastResult=null;$('error').hidden=true;$('result').hidden=true;$('empty').hidden=false;$('activity-log').textContent='';delete $('activity-log').dataset.started;$('activity-count').textContent='0';
  const input={city:$('city').value,date:$('date').value,budget:$('budget').value,interests:[...document.querySelectorAll('input[name=interest]:checked')].map(x=>x.value),mode:$('mode').value};
  busy(true);$('status').textContent=input.mode==='demo'?'Building an illustrative offline demo…':'Checking public sources…';
  try {
    const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:active.signal});
    if(!response.ok)throw new Error(await response.text());
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',received=false;
    while(true){const {done,value}=await reader.read();if(id!==runId)return;buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});let line;
      while((line=buffer.indexOf('\n'))>=0){const text=buffer.slice(0,line);buffer=buffer.slice(line+1);if(!text)continue;const data=JSON.parse(text);if(data.type==='activity')activity(data);if(data.type==='error')throw new Error(data.message);if(data.type==='result'){lastResult=data.result;received=true;render(data.result);}}
      if(done)break;
    }
    if(!received)throw new Error('Connection ended before the plan completed. Please try again.');
    $('status').textContent='Plan ready. Review the provisional details before heading out.';
  }catch(error){if(id!==runId)return;$('error').textContent=error.name==='AbortError'?'Request cancelled.':error.message;$('error').hidden=false;$('status').textContent='Unable to complete this plan. Try again or explicitly choose offline demo.';}
  finally{if(id===runId){busy(false);controller=null;}}
});
function render(r){
  $('empty').hidden=true;$('result').hidden=false;const p=r.plan;
  $('result').innerHTML=`<div class="result-head"><span class="badge ${r.input.mode==='demo'?'demo':''}">${esc(r.dataMode)}</span><h2>A day in ${esc(r.city.name)}</h2><div class="subline">${esc(r.input.date)} · ${esc(r.city.country)} · ${esc(r.city.timezone)}<br>${esc(r.planner)}</div></div>
  <div class="metrics"><div class="metric"><strong>${p.stops.length} stops</strong>10:00 start · city centre</div><div class="metric"><strong>~$${p.estimatedActivities}</strong>activities · AUD estimate</div><div class="metric"><strong>$${p.remaining}</strong>unallocated · reserve $${p.reserve}</div></div>
  <div class="weather">${r.weather?`${esc(r.weather.low)}–${esc(r.weather.high)}°C · rain chance ${r.weather.rainProbability==null?'unknown':esc(r.weather.rainProbability)+'%'}${p.weatherAdapted?' · indoor options favoured':''} · ${r.input.mode==='demo'?'Illustrative weather':link(r.weather.source,'Forecast source')}`:'Weather unavailable. Plan for changing conditions.'}</div>
  ${r.warnings.length?`<aside class="warnings"><strong>Before you go</strong><ul>${r.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></aside>`:''}
  ${p.stops.length?p.stops.map(s=>`<article class="stop"><div class="stop-time">${esc(s.start)}<small>to ${esc(s.end)}</small></div><div><h3>${esc(s.name)}</h3><p>${esc(s.reason)}</p><p>Walk ~${s.walkMinutes} min / ${s.walkKm} km from ${s===p.stops[0]?'city centre':'previous stop'} · allowance $${s.cost} AUD</p><p class="hours">${s.hoursStatus==='listed-open'?'Within listed regular hours; holidays unverified':'Hours unverified — confirm before visiting'}<br>Published hours: ${esc(s.hours||'Not supplied')}</p><p>${esc(s.costNote)}</p>${link(s.source,'Place source')}${s.hoursSource?' · '+link(s.hoursSource,'Hours source'):''} · ${link(`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=17/${s.lat}/${s.lon}`,'Map')}</div></article>`).join(''):'<div class="no-stops"><h3>No feasible stops yet</h3><p>Try a larger budget or different interests. If live sources are unavailable, select offline demo to explore the interface.</p></div>'}
  <section class="panel events"><h3>Events to consider</h3><p>${esc(r.events.note)}</p>${r.events.items.map(e=>`<article><strong>${esc(e.name)}</strong><p>${esc(e.start)} → ${esc(e.end)} · ${esc(e.venue)}</p><p>${esc(e.note)}</p>${link(e.source,'Official event listing')}</article>`).join('')}${r.events.source?link(r.events.source,'Browse city listings'):''}</section>
  <div class="actions"><button id="export-md" type="button">Export itinerary .md</button><button id="export-json" class="secondary" type="button">Export data .json</button><button id="print" class="secondary" type="button">Print / PDF</button></div>
  <p class="fineprint">${esc(p.note)}<br>Retrieved ${esc(r.generatedAt)}. 15-minute breaks between stops. Food, transport and special exhibitions may need extra budget.</p>
  <details class="fineprint"><summary>Why other places were skipped (${p.excluded.length})</summary><ul>${p.excluded.map(x=>`<li>${esc(x.name)}: ${esc(x.reason)}</li>`).join('')}</ul></details>`;
  $('export-md').onclick=()=>download(markdown(r),'md','text/markdown');$('export-json').onclick=()=>download(JSON.stringify(r,null,2),'json','application/json');$('print').onclick=()=>window.print();
}
function markdown(r){const clean=s=>String(s??'').replace(/[\r\n]+/g,' ').replace(/[\[\]<>]/g,'');const source=u=>safeUrl(u)||'No source (offline sample)';return `# ArambyaAIAgent — ${clean(r.city.name)}\n\n${r.dataMode}\n\nDate: ${r.input.date} (${r.city.timezone})\nPlanner: ${r.planner}\nGenerated: ${r.generatedAt}\nBudget: AUD ${r.input.budget}; activity allowance: ${r.plan.estimatedActivities}; remaining: ${r.plan.remaining}\n\n## Weather\n${r.weather?`${r.weather.low}–${r.weather.high}°C; rain probability ${r.weather.rainProbability??'unknown'}%. ${source(r.weather.source)}`:'Unavailable'}\n\n## Itinerary\n${r.plan.stops.map(s=>`\n### ${s.start}–${s.end} ${clean(s.name)}\nWalk ~${s.walkMinutes} min / ${s.walkKm} km. Allowance AUD ${s.cost}.\n${clean(s.reason)}\nHours: ${clean(s.hours||'Unknown')} (${s.hoursStatus}; holidays unverified).\n${clean(s.costNote)}\nSource: ${source(s.source)}\n${s.hoursSource ? 'Hours source: ' + source(s.hoursSource) + '\n' : ''}`).join('')||'No feasible stops found.\n'}\n## Events\n${clean(r.events.note)}\n${r.events.items.map(e=>`- ${clean(e.name)} (${e.start}–${e.end}); ${source(e.source)}; ${clean(e.note)}`).join('\n')}\n\n## Checks & limitations\n${r.warnings.map(w=>'- '+clean(w)).join('\n')}\n${r.plan.note}\n\n## Tool activity\n${r.activity.map(a=>`- ${a.time} ${a.tool} / ${a.status}: ${clean(a.message)}`).join('\n')}\n\nData attribution: © OpenStreetMap contributors (ODbL); Open-Meteo (CC BY 4.0); GeoNames; What's On Melbourne.\n`;}
function download(content,extension,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=`ArambyaAIAgent-${lastResult.input.date}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}


