import {validateInput,planDay} from './planner.js';
import {geocode,getWeather,getPlaces,getEvents} from './tools.js';
import {demoCity,demoPlaces} from './demo.js';
import {providerConfig,rankWithProvider} from './provider.js';
export async function runAgent(raw,{signal=new AbortController().signal,emit=()=>{},tools={geocode,getWeather,getPlaces,getEvents},config=providerConfig()}={}) {
  const input=validateInput(raw),activity=[],warnings=[];
  const log=(tool,status,message)=>{const row={tool,status,message,time:new Date().toISOString()};activity.push(row);emit({type:'activity',...row});};
  const ctx={signal,progress:m=>log('places','running',m)};
  async function call(name,fn,optional=false) {
    signal.throwIfAborted();log(name,'running','Calling public data tool…');
    try {const data=await fn();signal.throwIfAborted();log(name,'success','Response received.');return data;}
    catch(e){signal.throwIfAborted();log(name,'error',e.message);if(!optional)throw e;warnings.push(`${name}: ${e.message}`);return null;}
  }
  let city,places,weather,events,planner='Rule-based fallback (no LLM)',ranking=[];
  if(input.mode==='demo') {
    log('demo','success','OFFLINE SAMPLE DATA — no public tools or model called.');
    city=demoCity;places=demoPlaces.filter(p=>input.interests.includes(p.category));weather={high:21,low:12,rainProbability:65,rainMm:4,source:null};events={items:[],note:'Offline demo has no real event listings.',source:null};
    warnings.push('DEMO: places, opening hours, costs and weather are illustrative fixtures, not live findings.');
  } else {
    city=await call('geocoding',()=>tools.geocode(input,ctx));
    [places,weather,events]=await Promise.all([call('places',()=>tools.getPlaces(input,city,ctx),true),call('weather',()=>tools.getWeather(input,city,ctx),true),call('events',()=>tools.getEvents(input,city,ctx),true)]);
    places||=[];events||={items:[],note:'Event service unavailable. Browse the official listing.',source:city.country_code==='AU'&&city.name==='Melbourne'?'https://whatson.melbourne.vic.gov.au/things-to-do':null};
    if(config.enabled&&places.length){const ids=await call('local-model',()=>rankWithProvider(config,input,places,signal),true);if(ids){ranking=ids;planner=config.label;}else warnings.push('Local model unavailable; using rule-based fallback.');}
  }
  signal.throwIfAborted();log('planner','running','Ranking interest matches, checking hours, walking distance and estimated budget.');
  const plan=planDay(input,city,places,weather,ranking);
  if(!plan.stops.length)warnings.push('No feasible stops found. Increase your budget, broaden interests, try a different date, or explicitly select offline demo.');
  if(plan.stops.some(p=>p.hoursStatus==='unknown'))warnings.push('Some opening hours are missing or too complex to interpret. Those stops are provisional.');
  if(places.some(p=>p.dataNote))warnings.push('Place discovery used the live City of Melbourne landmark directory because Overpass was unavailable. Directory entries may be dated; confirm that each venue still operates.');
  if(plan.weatherAdapted&&plan.stops.some(p=>!p.indoor))warnings.push('Rain is forecast: outdoor visits are shortened to 35 minutes. Skip them if conditions are poor.');
  log('planner','success',`Built ${plan.stops.length} provisional stops from ${places.length} candidates; ${plan.excluded.length} skipped.`);
  const currency='AUD';
  if(city.country_code!=='AU') warnings.push('Budget allowances remain in AUD and are not local price quotes or currency conversions.');
  const result={input,city,currency,planner,dataMode:input.mode==='demo'?'OFFLINE DEMO — illustrative data':'LIVE public retrieval — may be partial',generatedAt:new Date().toISOString(),weather,events,plan,warnings,activity};
  emit({type:'result',result});return result;
}
