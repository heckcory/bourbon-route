/* Bourbon Route travel enhancements. No accounts, booking claims, or vehicle connection. */
(function(root) {
'use strict';
const DATES=['2027-04-07','2027-04-08','2027-04-09','2027-04-10','2027-04-11'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function exactTime(day,label){
 const m=/^(\d{1,2}):(\d{2}) (AM|PM) (ET|CT)$/.exec(label);
 if(!m||!DATES[day])return null;
 const hour=Number(m[1])%12+(m[3]==='PM'?12:0);
 return new Date(DATES[day]+'T'+String(hour).padStart(2,'0')+':'+m[2]+':00'+(m[4]==='CT'?'-05:00':'-04:00'));
}
function nextStop(all,now){
 const start=new Date('2027-04-07T00:00:00-05:00'),end=new Date('2027-04-12T00:00:00-05:00');
 if(now<start)return {phase:'before'};
 if(now>=end)return {phase:'after'};
 const events=all.flatMap((d,day)=>d.events.map((event,index)=>({day,index,event,at:exactTime(day,event[0])}))).filter(x=>x.at&&x.at>=now).sort((a,b)=>a.at-b.at);
 return events.length?{phase:'during',...events[0]}:{phase:'finished'};
}
function booking(event){
 if(event[1]==='Hotel' && /Return|Check out/i.test(event[2]))return 'Planned';
 if(/optional/i.test(event[3]))return 'Optional';
 if(['Distillery','Dinner','Drinks','Hotel','Brunch'].includes(event[1]))return 'Proposed · not confirmed';
 return 'Planned';
}
function price(event,prices){return event[1]==='Breakfast'&&['Proof on Main','Oak & Ember'].includes(event[2])?'Breakfast price to confirm':prices[event[2]]||'';}
function locationFor(day,event){
 const n=event[2];
 const fixed={
 'Elizabethtown Supercharger':'1036 N Mulberry St, Elizabethtown, KY',
 'Frankfort Supercharger':'1302 US-127, Frankfort, KY',
 'Buffalo Trace':'Buffalo Trace Distillery, Frankfort, KY',
 'Castle & Key':'Castle & Key Distillery, Frankfort, KY',
 'Bourbon on Main':'Bourbon on Main, Frankfort, KY',
 "Maker's Mark":"Maker's Mark Distillery, Loretto, KY",
 'Star Hill Provisions':"Star Hill Provisions, Maker's Mark, Loretto, KY",
 'Woodford Reserve':'Woodford Reserve Distillery, Versailles, KY',
 'Four Roses Distillery':'Four Roses Distillery, Lawrenceburg, KY',
 'Wallace Station':'Wallace Station Deli, Versailles, KY'
 };
 if(fixed[n])return fixed[n];
 if(/21c|Proof on Main/.test(n))return n.replace(/\s*[–—-]\s*Check-in$/,'')+', Louisville, KY';
 if(/Trail Hotel|Oak & Ember|Bourbon Vault/.test(n))return (n.includes('Trail Hotel')?'The Trail Hotel':n)+', Bardstown, KY';
 if(['Drive','Arrive'].includes(event[1]))return null;
 return n+(day===0?', Louisville, KY':', Bardstown, KY');
}
function directions(query){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);}
function icsText(s){return String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function stamp(date){return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function calendar(all,now=new Date()){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Bourbon Route//Trip Planner//EN','CALSCALE:GREGORIAN'];
 all.forEach((d,day)=>d.events.forEach((e,i)=>{
 const at=exactTime(day,e[0]);if(!at)return;
 lines.push('BEGIN:VEVENT','UID:bourbon-route-2027-'+day+'-'+i+'@bourbon-route','DTSTAMP:'+stamp(now),'DTSTART:'+stamp(at),'SUMMARY:'+icsText(e[2]),'DESCRIPTION:'+icsText('PROPOSED, not a confirmed reservation. '+e[3]+' Original local time: '+e[0]+'. End time/duration not confirmed.'),'STATUS:TENTATIVE');
 const loc=locationFor(day,e);if(loc)lines.push('LOCATION:'+icsText(loc));
 lines.push('END:VEVENT');
 }));
 lines.push('END:VCALENDAR');
 // Fold at <=75 UTF-8 octets, not code units, for portable calendar imports.
 return lines.map(line=>{let out='',part='',bytes=0;for(const c of line){const n=new TextEncoder().encode(c).length;if(bytes+n>74){out+=part+'\r\n';part=' ';bytes=1;}part+=c;bytes+=n;}return out+part;}).join('\r\n')+'\r\n';
}
const api={exactTime,nextStop,booking,price,locationFor,directions,calendar};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.BourbonTravel=api;
if(typeof document==='undefined')return;

const oldShow=showView,oldDays=renderDays;
let applying=false,currentView='overview';
function updateHash(){if(applying)return;const h='#'+currentView+(currentView==='itinerary'?'/day-'+(selectedDay+1):'');if(location.hash!==h)history.pushState(null,'',h);}
function updateNav(){
 document.querySelectorAll('#nav button').forEach(b=>{if(b.dataset.view===currentView)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const hero=document.querySelector('.hero');if(hero)hero.hidden=currentView!=='overview';
 document.querySelectorAll('#daytabs button').forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===selectedDay));b.setAttribute('aria-label','Day '+(i+1)+': '+days[i].label);});
}
showView=function(id){
 if(!['overview','itinerary','map','hunt'].includes(id))id='overview';
 currentView=id;oldShow(id);updateNav();updateHash();
 const heading=document.querySelector('#'+id+' h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
};
function status(message){document.getElementById('travel-status').textContent=message;}
async function shareStop(day,index){
 const e=days[day].events[index],query=locationFor(day,e);if(!query)return;
 const url=directions(query);
 if(navigator.share){try{await navigator.share({title:e[2],text:query,url});status('Shared using your selected app. Tesla availability depends on your device.');return;}catch(error){if(error.name==='AbortError')return;}}
 status('Sharing is not available here. Use the Directions link for this stop, or copy its address into your Tesla app.');
}
function decorateDays(){
 document.querySelectorAll('#daycontent .event').forEach((el,index)=>{
 const e=days[selectedDay].events[index];if(!e)return;
 el.id='stop-'+selectedDay+'-'+index;
 const body=el.querySelector('.eventbody');
 let meta=body.querySelector('.meta');const p=price(e,eventPrices);
 if(p){if(!meta){meta=document.createElement('div');meta.className='meta';body.append(meta);}meta.textContent=p.includes('to confirm')?p:'Estimated, not verified: '+p;}
 const badge=document.createElement('p');badge.className='booking-state';badge.textContent=booking(e);body.append(badge);
 const query=locationFor(selectedDay,e);if(query){
 const actions=document.createElement('div');actions.className='actions stop-actions';
 actions.innerHTML='<a class="btn small alt" target="_blank" rel="noopener noreferrer" href="'+esc(directions(query))+'">Directions</a><button class="btn small alt" type="button">Share to Tesla / apps</button>';
 const day=selectedDay;actions.querySelector('button').addEventListener('click',()=>shareStop(day,index));
 const site=venueLinks[e[2]];if(site){const a=document.createElement('a');a.className='btn small alt';a.href=site;a.target='_blank';a.rel='noopener noreferrer';a.textContent=site.includes('google.com/maps')?'Location information':'Website / booking info';actions.append(a);}
 body.append(actions);
 }
 });
 updateNav();
}
renderDays=function(){const focused=document.activeElement;const wasDay=focused&&focused.closest('#daytabs');oldDays();decorateDays();if(currentView==='itinerary')updateHash();if(wasDay)document.querySelectorAll('#daytabs button')[selectedDay]?.focus({preventScroll:true});};
function fromHash(){
 const m=/^#(overview|itinerary|map|hunt)(?:\/day-([1-5]))?$/.exec(location.hash);
 applying=true;if(m){if(m[2])selectedDay=Number(m[2])-1;renderDays();showView(m[1]);}else{showView('overview');}applying=false;
}
window.addEventListener('popstate',fromHash);
window.addEventListener('hashchange',fromHash);
const main=document.querySelector('main');
main.insertAdjacentHTML('beforeend','<div id="travel-status" class="travel-status" role="status" aria-live="polite"></div>');
const overview=document.getElementById('overview');
overview.insertAdjacentHTML('afterbegin','<aside id="today-panel" class="card today-panel" aria-labelledby="today-title"></aside>');
let todayKey='';
function renderToday(){
 const n=nextStop(days,new Date()),p=document.getElementById('today-panel');
 const key=n.phase+':'+n.day+':'+n.index;if(key===todayKey)return;todayKey=key;
 let title,copy;
 if(n.phase==='before'){title='Ready for April 7–11, 2027';copy='Your trip has not started yet. Review the planned stops and confirm reservations before departure.';}
 else if(n.phase==='after'||n.phase==='finished'){title='The road home';copy='There are no more timed stops ahead. The itinerary and Photo Hunt remain available.';}
 else {title='Next planned stop: '+n.event[2];copy=days[n.day].label+' · '+n.event[0]+'. Based on the schedule, not your live location. Untimed stops and changes may occur in between.';}
 p.innerHTML='<div class="smallcaps">TODAY / NEXT STOP</div><h3 id="today-title">'+esc(title)+'</h3><p>'+esc(copy)+'</p><button class="btn" type="button">Open '+(n.phase==='during'?'this day':'itinerary')+'</button>';
 p.querySelector('button').addEventListener('click',()=>{if(n.day!==undefined)selectedDay=n.day;renderDays();showView('itinerary');if(n.index!==undefined)document.getElementById('stop-'+n.day+'-'+n.index)?.scrollIntoView({block:'center',behavior:'smooth'});});
}
renderToday();setInterval(renderToday,60000);
const itinerary=document.getElementById('itinerary');
itinerary.querySelector('.lead').insertAdjacentHTML('afterend','<div class="actions travel-tools"><button class="btn small alt" id="export-calendar" type="button">Export calendar</button><button class="btn small alt" id="print-trip" type="button">Print itinerary</button></div><details class="travel-notes"><summary>Reservations, travel & sharing notes</summary><p>Every stop is a proposal, not a confirmed booking. Check official booking releases, opening hours and availability. Prices are planning estimates, not verified quotes; breakfast and dinner pricing may differ.</p><p>Allow a parking and check-in buffer before tours, using each venue’s instructions. Recheck live travel times before leaving. Choose a sober designated driver or arrange transport before tastings; do not drive after drinking.</p><p>“Share to Tesla / apps” opens your phone’s share sheet. Choose your own Tesla app if supported. No car is linked to this website. Directions are available separately, and Tesla navigation should decide charging needs.</p><p>Calendar export contains only stops with exact stated times; vague times and time ranges remain in this itinerary. Entries are tentative with no invented duration. Calendar apps convert Eastern/Central times to your calendar’s time zone.</p></details>');
document.getElementById('export-calendar').addEventListener('click',()=>{
 const blob=new Blob([calendar(days)],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bourbon-route-proposed-2027.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Calendar exported with tentative, timed stops only. Check the local times when importing.');
});
document.getElementById('print-trip').addEventListener('click',()=>{
 document.getElementById('print-itinerary')?.remove();
 const printable=document.createElement('div');printable.id='print-itinerary';
 printable.innerHTML='<h1>The Bourbon Route · April 7–11, 2027</h1><p>Proposed itinerary, not confirmed bookings. Kentucky times are Eastern; Nashville times are Central. Verify availability, prices and travel times. Arrange a sober driver.</p>'+days.map(d=>'<section><h2>'+esc(d.title)+'</h2><p>'+esc(d.subtitle)+'</p>'+d.events.map(e=>'<article><h3>'+esc(e[0])+' · '+esc(e[2])+'</h3><p>'+esc(e[3])+'</p><small>'+esc(booking(e))+'</small></article>').join('')+'</section>').join('');
 document.body.append(printable);window.print();
});
decorateDays();if(location.hash)fromHash();else updateNav();
})(typeof window==='undefined'?globalThis:window);
