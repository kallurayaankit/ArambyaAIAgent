export const INTERESTS = ['art', 'history', 'nature', 'food'];
export function validateInput(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Enter trip details.');
  const city = typeof raw.city === 'string' ? raw.city.trim() : 'Melbourne';
  if (city.length < 2 || city.length > 80) throw new Error('City must be 2–80 characters.');
  if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || !Number.isFinite(Date.parse(raw.date)) || new Date(raw.date).toISOString().slice(0,10) !== raw.date) throw new Error('Choose a valid calendar date.');
  const budget = Number(raw.budget);
  if (raw.budget === '' || raw.budget == null || !Number.isFinite(budget) || budget < 0 || budget > 10000) throw new Error('Budget must be between 0 and 10,000.');
  if (!Array.isArray(raw.interests) || !raw.interests.length || raw.interests.some(x => !INTERESTS.includes(x))) throw new Error('Choose at least one listed interest.');
  if (!['live', 'demo'].includes(raw.mode)) throw new Error('Choose live or demo mode.');
  if (raw.mode === 'demo' && city.toLowerCase() !== 'melbourne') throw new Error('Offline demo contains Melbourne samples only. Choose live mode for another city.');
  return {city, date:raw.date, budget, interests:[...new Set(raw.interests)], mode:raw.mode};
}
const days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const minute = s => Number(s.slice(0,2))*60 + Number(s.slice(3));
// Deliberately conservative: complex OSM expressions are not silently interpreted.
export function checkHours(expression, date, start, end) {
  if (expression === '24/7') return 'listed-open';
  if (!expression) return 'unknown';
  const segments = expression.split(';').map(s => s.trim());
  const rules = [];
  for (const segment of segments) {
    const m = segment.match(/^(?:(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))? )?(off|closed|\d{2}:\d{2}-\d{2}:\d{2})$/);
    if (!m) return 'unknown';
    let applies = true;
    if (m[1]) { const a=days.indexOf(m[1]), b=days.indexOf(m[2]||m[1]), d=new Date(date+'T12:00:00Z').getUTCDay(); applies = a<=b ? d>=a&&d<=b : d>=a||d<=b; }
    if (/off|closed/.test(m[3])) {rules.push({applies,closed:true});continue;}
    const [a,b]=m[3].split('-').map(minute);
    if (a>=b || a<0 || b>1440 || m[3].split('-').some(t=>Number(t.slice(3))>59)) return 'unknown';
    rules.push({applies,a,b});
  }
  if (rules.some(r=>r.applies&&r.closed)) return 'listed-closed';
  return rules.some(r=>r.applies&&start>=r.a&&end<=r.b) ? 'listed-open' : 'listed-closed';
}
export function distance(a,b) {
  const rad=x=>x*Math.PI/180, dlat=rad(b.lat-a.lat), dlon=rad(b.lon-a.lon);
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2)));
}
export const timeLabel = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export function planDay(input, city, places, weather, ranking=[]) {
  let current={lat:city.latitude,lon:city.longitude}, clock=600, spent=0;
  const remaining=[...places], stops=[], excluded=[];
  const wet=weather && (weather.rainProbability>=55 || weather.rainMm>=3);
  const reserve=Math.min(input.budget, Math.round(input.budget*0.25));
  while (remaining.length && stops.length<4) {
    remaining.sort((a,b)=>score(b)-score(a));
    function score(p) {return (input.interests.includes(p.category)?12:0)+(wet&&p.indoor?5:0)+(p.cost===0?2:0)+(p.hours?3:0)-distance(current,p)*2-stops.filter(s=>s.category===p.category).length*7+(ranking.includes(p.id)?(ranking.length-ranking.indexOf(p.id))*0.15:0);}
    const p=remaining.shift();
    if(stops.some(s=>s.category===p.category&&distance(s,p)<0.15)){excluded.push({name:p.name,reason:'Very close to an already selected stop of the same category.'});continue;}
    const km=distance(current,p)*1.35;
    if(km>3.5) {excluded.push({name:p.name,reason:'Too far from the current stop for this walking plan.'});continue;}
    const walkMinutes=Math.ceil(km/4.5*60)+10;
    const start=clock+walkMinutes, duration=p.category==='food'?50:wet&&!p.indoor?35:70, end=start+duration;
    const hoursStatus=checkHours(p.hours,input.date,start,end);
    if (hoursStatus==='listed-closed' || end>1020 || spent+p.cost>input.budget-reserve) {excluded.push({name:p.name,reason:hoursStatus==='listed-closed'?'Listed hours do not cover the visit.':end>1020?'Would finish after 17:00.':'Exceeds the estimated activity allowance.'}); continue;}
    stops.push({...p,start:timeLabel(start),end:timeLabel(end),walkMinutes,walkKm:Number(km.toFixed(1)),hoursStatus,reason:`${p.category} stop${wet&&p.indoor?' • indoor option favoured for rain':''}${input.interests.includes(p.category)?' • matches your interests':''}`});
    spent+=p.cost; clock=end+15;current=p;
  }
  return {stops,excluded,estimatedActivities:spent,reserve,remaining:input.budget-spent,weatherAdapted:!!wet,
    note:'Costs are rough planning allowances, not verified prices. Walking times use straight-line distance × 1.35 plus a 10-minute buffer, not a routing service. Confirm access, prices and holiday hours before leaving.'};
}
