import {distance} from './planner.js';
const UA='ArambyaAIAgent/0.1 (local noncommercial itinerary prototype; Node.js)';
export const EVENTS_URL='https://whatson.melbourne.vic.gov.au/things-to-do';
export async function request(url,{signal,fetcher=fetch,method='GET',body,asText=false,timeout=12000}={}) {
  const response=await fetcher(url,{method,body,headers:{'User-Agent':UA,Accept:asText?'text/html':'application/json'},redirect:'manual',signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(timeout)])});
  if(!response.ok) throw new Error(`Public service returned HTTP ${response.status}. Try again later.`);
  const text=await response.text();
  if(text.length>6_000_000) throw new Error('Public service response was too large.');
  return asText?text:JSON.parse(text);
}
export async function geocode(input,ctx) {
  const url='https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:input.city,count:'1',language:'en',format:'json'});
  const json=await request(url,ctx), city=json.results?.[0];
  if(!city || !Number.isFinite(city.latitude)||!Number.isFinite(city.longitude)) throw new Error('City not found. Try a nearby major city or a more specific name.');
  return {...city,source:url};
}
export async function getWeather(input,city,ctx) {
  const url='https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:city.latitude,longitude:city.longitude,daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',timezone:city.timezone||'auto',start_date:input.date,end_date:input.date});
  const json=await request(url,ctx), d=json.daily;
  if(!d?.time?.includes(input.date)||d.temperature_2m_max?.[0]==null) throw new Error('Forecast unavailable for this date. Choose a date within the next two weeks.');
  return {high:d.temperature_2m_max[0],low:d.temperature_2m_min[0],rainProbability:d.precipitation_probability_max?.[0]??null,rainMm:d.precipitation_sum?.[0]??null,source:url};
}
export function normalisePlaces(json) {
  const seen=new Set();
  return (json.elements||[]).flatMap(e=>{
    const t=e.tags||{}, lat=e.lat??e.center?.lat, lon=e.lon??e.center?.lon;
    if(!t.name || !Number.isFinite(lat)||!Number.isFinite(lon)) return [];
    const key=t.name.toLowerCase();if(seen.has(key))return [];seen.add(key);
    const category=t.leisure==='park'?'nature':t.amenity==='cafe'?'food':t.tourism==='gallery'?'art':'history';
    const cost=t.fee==='no'||category==='nature'?0:category==='food'?20:25;
    return [{id:`${e.type}/${e.id}`,name:t.name,lat,lon,category,indoor:category!=='nature',cost,hours:t.opening_hours||null,source:`https://www.openstreetmap.org/${e.type}/${e.id}`,costNote:cost===0?(t.fee==='no'?'OSM lists no admission fee; extras may cost more.':'Assumed free outdoor access; verify.'):'Unverified AUD allowance; check actual prices and currency conversion.'}];
  });
}
export async function getPlaces(input,city,ctx) {
  const around=`(around:2200,${city.latitude},${city.longitude})`;
  const selectors={art:'[tourism=gallery]',history:'[tourism=museum]',nature:'[leisure=park]',food:'[amenity=cafe]'};
  const query=`[out:json][timeout:18];(${input.interests.map(i=>`nwr${around}${selectors[i]}[name];`).join('')});out center 100;`;
  const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  let last;
  for (const endpoint of endpoints) {
    ctx.signal?.throwIfAborted();
    ctx.progress?.(`Requesting places + opening_hours from ${new URL(endpoint).hostname}`);
    try { const json=await request(endpoint,{...ctx,timeout:10000,method:'POST',body:new URLSearchParams({data:query})}); if(json.remark)throw new Error('Place service returned an incomplete query.');return normalisePlaces(json); }
    catch(e) {ctx.signal?.throwIfAborted();last=e;}
  }
  if(city.country_code==='AU'&&city.name.toLowerCase()==='melbourne') {
    ctx.progress?.('Overpass unavailable. Reading City of Melbourne live landmark records; hours are not included in this dataset.');
    return getMelbourneLandmarks(input,city,ctx);
  }
  throw last;
}
export const LANDMARK_DATASET='landmarks-and-places-of-interest-including-schools-theatres-health-services-spor';
export async function getMelbourneLandmarks(input,city,ctx) {
  const base=`https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/${LANDMARK_DATASET}/records`;
  const where='sub_theme="Art Gallery/Museum" OR sub_theme="Library" OR sub_theme="Informal Outdoor Facility (Park/Garden/Reserve)" OR feature_name="State Library Victoria"';
  const url=base+'?'+new URLSearchParams({limit:'100',where});
  const data=await request(url,ctx);
  const center={lat:city.latitude,lon:city.longitude};
  const places=(data.results||[]).flatMap((row,i)=>{
    const point=row.co_ordinates;
    if(!Number.isFinite(point?.lat)||!Number.isFinite(point?.lon)||distance(center,point)>2.2)return [];
    const category=row.sub_theme?.includes('Park')?'nature':/art|gallery|moving image|design/i.test(row.feature_name)?'art':'history';
    if(!input.interests.includes(category))return [];
    const cost=category==='nature'?0:25;
    return [{id:`melbourne-landmark-${i}`,name:row.feature_name,...point,category,indoor:category!=='nature',cost,hours:null,source:url,costNote:cost?'Unverified AUD 25 allowance; this dataset contains no prices.':'Assumed free outdoor access; verify access.',dataNote:'City landmark directory; may be dated. No current opening hours supplied.'}];
  });
  const library=places.find(p=>p.name==='State Library Victoria');
  if(library) {
    const source='https://whatson.melbourne.vic.gov.au/things-to-do/state-library-victoria';
    ctx.progress?.('Checking published State Library Victoria hours on the official city listing.');
    try {library.hours=parseCityHours(await request(source,{...ctx,asText:true,timeout:6000}));if(library.hours){library.hoursSource=source;library.dataNote='City landmark directory; regular hours retrieved separately from the official city listing. Holidays unverified.';}else ctx.progress?.('Official hours format was not understood; leaving hours unknown.');}
    catch(e){ctx.signal?.throwIfAborted();ctx.progress?.('Official hours unavailable; leaving hours unknown.');}
  }
  return places;
}
export function parseCityHours(html) {
  const table=html.match(/<table\b[^>]*id="date-times-table"[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if(!table)return null;
  const days={Monday:'Mo',Tuesday:'Tu',Wednesday:'We',Thursday:'Th',Friday:'Fr',Saturday:'Sa',Sunday:'Su'},rules=[];
  const clock=(h,m,ap)=>{h=Number(h);m=Number(m||0);if(h<1||h>12||m>59)return null;return `${String(h%12+(ap==='pm'?12:0)).padStart(2,'0')}:${String(m).padStart(2,'0')}`;};
  for(const row of table.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const day=row[1].match(/<th>\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*<\/th>/)?.[1];if(!day)continue;
    const spans=[...row[1].matchAll(/<span aria-hidden="true">\s*([^<]+)\s*<\/span>/g)];
    if(spans.length!==1)return null;
    const text=spans[0][1].trim();if(/^closed$/i.test(text)){rules.push(days[day]+' off');continue;}
    const m=text.match(/^(\d{1,2})(?::(\d{2}))?(am|pm) - (\d{1,2})(?::(\d{2}))?(am|pm)$/);if(!m)return null;
    const start=clock(m[1],m[2],m[3]),end=clock(m[4],m[5],m[6]);if(!start||!end)return null;
    rules.push(`${days[day]} ${start}-${end}`);
  }
  return rules.length===7&&new Set(rules.map(r=>r.slice(0,2))).size===7?rules.join('; '):null;
}
export function parseEvents(html,source,date) {
  const nodes=[];
  function visit(x) {if(!x||typeof x!=='object')return; if(Array.isArray(x)){x.forEach(visit);return;} const type=[x['@type']].flat();if(type.some(t=>typeof t==='string'&&t.endsWith('Event')))nodes.push(x);if(x['@graph'])visit(x['@graph']);}
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {try {visit(JSON.parse(m[1]));}catch{/* Malformed publisher markup is not a usable event. */}}
  return nodes.flatMap(e=>{
    const start=typeof e.startDate==='string'?e.startDate.slice(0,10):'',end=typeof e.endDate==='string'?e.endDate.slice(0,10):start;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||date<start||date>end||!e.name)return [];
    if(String(e.eventStatus||'').includes('Cancelled'))return [];
    return [{name:String(e.name).slice(0,200),start:e.startDate,end:e.endDate||e.startDate,venue:e.location?.name||'Check listing',source,note:'Date range matches; confirm individual sessions, availability and admission on the listing. Not added automatically.'}];
  });
}
export async function getEvents(input,city,ctx) {
  if(city.country_code!=='AU'||city.name.toLowerCase()!=='melbourne')return {items:[],note:'Live event discovery currently covers Melbourne, Australia only.',source:null};
  const html=await request(EVENTS_URL,{...ctx,asText:true});
  const links=[...new Set([...html.matchAll(/<a\b[^>]*data-gtm-trigger="listing-tile-link"[^>]*href="(\/things-to-do\/[^"?#]+)"/g)].map(m=>m[1]))].slice(0,8);
  if(!links.length) throw new Error('The city listing format changed; use the source link to browse events.');
  const items=[];let failures=0;
  // Small sequential sample respects the public site and cancellation.
  for(const path of links) {
    ctx.signal?.throwIfAborted();
    const source=new URL(path,EVENTS_URL).href;
    if(new URL(source).origin!==new URL(EVENTS_URL).origin)continue;
    try{const page=await request(source,{...ctx,asText:true,timeout:6000});items.push(...parseEvents(page,source,input.date));}catch(e){ctx.signal?.throwIfAborted();failures++;}
  }
  return {items:items.slice(0,8),source:EVENTS_URL,note:`Checked ${links.length} featured listings${failures?`; ${failures} could not be read`:''}. ${items.length?'Date ranges match, but daily sessions need confirmation.':'No matching structured events in this limited sample; this does not mean no events exist.'}`};
}

