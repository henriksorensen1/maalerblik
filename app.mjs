import { METERS, today, parseValue, validateRecords, intervals, readBackup, mergeRecords } from './core.mjs?v=2-kwh';
const $ = s => document.querySelector(s);
const KEY='maalerblik-v2-kwh', LEGACY_KEY='maalerblik-v1', BACKUP_KEY='maalerblik-last-export';
const fmt=n=>new Intl.NumberFormat('da-DK',{maximumFractionDigits:3}).format(n);
const dateLabel=d=>new Intl.DateTimeFormat('da-DK',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00'));
const styles={el:['#c57b16','#fbf1d9'],vand:['#237ca4','#e7f3f9'],varme:['#b45f4e','#f9ebe5']};
let records=[], original=null, rescueSource=null, writable=true, editing=null, selected='el', pending=null, limit=30;
function tell(message,error=false) { $('#notice').textContent=message; $('#notice').classList.toggle('error',error); $('#notice').hidden=false; }
function storageFailure(message) {
  writable=false; $('#storage-error').textContent=message; $('#storage-error').hidden=false;
  $('#save').disabled=true; $('#import').disabled=true;
  $('#rescue').hidden=rescueSource===null;
}
function chooseHeatUnit(source){
  $('#heat-source').textContent=source;
  $('#heat-dialog').showModal();
  return new Promise(resolve=>{
    const finish=unit=>{for(const id of ['heat-keep','heat-convert'])$('#'+id).onclick=null;$('#heat-dialog').close();resolve(unit);};
    $('#heat-keep').onclick=()=>finish('kWh');$('#heat-convert').onclick=()=>finish('MWh');
  });
}
$('#heat-dialog').addEventListener('cancel',e=>e.preventDefault());
async function readWithHeatChoice(text,source){
  try{return readBackup(text);}catch(e){if(e.code!=='HEAT_UNIT_REQUIRED')throw e;return readBackup(text,await chooseHeatUnit(source));}
}
async function load() {
  try {
    original=localStorage.getItem(KEY);
    const legacy=original===null?localStorage.getItem(LEGACY_KEY):null;
    rescueSource=original??legacy;
    records=rescueSource===null ? [] : await readWithHeatChoice(rescueSource,'Der findes aflæsninger fra den tidligere version af Målerblik. Hvordan indtastede du dine varmetal?');
    localStorage.setItem('maalerblik-probe','1'); localStorage.removeItem('maalerblik-probe');
    if(legacy!==null){
      if(localStorage.getItem(LEGACY_KEY)!==legacy)throw Error('Den gamle historik blev ændret i et andet vindue. Genindlæs appen.');
      persist(records);tell('Din historik er klar. Varme vises nu i kWh. Den oprindelige historik er bevaret som en lokal kopi.');
    }
  } catch(e) { storageFailure('Lageret kan ikke læses eller bruges: '+e.message+' Eksisterende data bliver ikke overskrevet. Hent eventuelt de oprindelige data, og prøv at genåbne appen uden privat browsing.'); }
}
function persist(next) {
  if (!writable) throw Error('Lokal lagring er ikke tilgængelig. Ingen ændringer er gemt.');
  const clean=validateRecords(next);
  if(localStorage.getItem(KEY)!==original) throw Error('Data er ændret i et andet vindue. Genindlæs siden, før du prøver igen.');
  const raw=JSON.stringify({app:'maalerblik',version:2,heatUnit:'kWh',records:clean});
  try {localStorage.setItem(KEY,raw);} catch {throw Error('Der er ikke plads eller adgang til lokal lagring. Ændringen er ikke gemt. Eksportér dine eksisterende aflæsninger som backup.');}
  records=clean; original=raw; render();
}
function newId(){return crypto.randomUUID();}
function initInputs() {
  for(const [meter,m] of Object.entries(METERS)) {
    const [accent]=styles[meter];
    const wrapper=document.createElement('div');wrapper.className='reading-field';wrapper.style.setProperty('--accent',accent);
    wrapper.innerHTML=`<label class="reading-label" for="value-${meter}"><span class="reading-dot" aria-hidden="true"></span>${m.name}</label><div class="value-wrap"><input id="value-${meter}" name="${meter}" type="text" inputmode="decimal" placeholder="0,000" autocomplete="off" aria-describedby="input-help"><span class="unit">${m.unit}</span></div><label class="reset-label"><input type="checkbox" id="reset-${meter}">Ny måler / nulstilling</label>`;
    $('#meter-inputs').append(wrapper);
  }
}
function resetForm(){editing=null;$('#reading-form').reset();$('#date').value=today();$('#entry-title').textContent='Ny aflæsning';$('#save').innerHTML='Gem aflæsning <span aria-hidden="true">↗</span>';$('#cancel-edit').hidden=true;$('#form-error').hidden=true;for(const m of Object.keys(METERS)){$('#value-'+m).disabled=false;$('#reset-'+m).disabled=false;$('#value-'+m).removeAttribute('aria-invalid');}}
$('#reading-form').addEventListener('submit',e=>{
  e.preventDefault();$('#form-error').hidden=true;
  try {
    const date=$('#date').value;const additions=[];
    for(const meter of Object.keys(METERS)) {
      const input=$('#value-'+meter);input.removeAttribute('aria-invalid');
      if(input.disabled) continue;
      if(!input.value.trim()){if(editing)throw Error('Indtast en aflæsning. Brug Slet i historikken, hvis du vil fjerne den.');continue;}
      let value;try{value=parseValue(input.value);}catch(e){input.setAttribute('aria-invalid','true');input.focus();throw Error(METERS[meter].name+': '+e.message);}
      additions.push({id:editing || newId(),meter,date,value,reset:$('#reset-'+meter).checked});
    }
    if(!additions.length)throw Error('Udfyld mindst én måler, før du gemmer.');
    if(!date || date>today())throw Error('Vælg en gyldig dato, som ikke ligger i fremtiden.');
    if(additions.some(a=>records.some(r=>r.id!==editing && r.meter===a.meter && r.date===date)))throw Error('Der findes allerede en aflæsning for en af målerne på denne dato. Ret den i historikken. Ingen nye aflæsninger er gemt.');
    const wasEditing=!!editing;
    persist([...records.filter(r=>r.id!==editing),...additions]);resetForm();tell(wasEditing?'Aflæsningen er rettet. Forbruget er beregnet igen.':`${additions.length===1?'Aflæsningen er':additions.length+' aflæsninger er'} gemt på denne enhed.`);
  } catch(e){$('#form-error').textContent=e.message;$('#form-error').hidden=false;}
});
$('#cancel-edit').addEventListener('click',resetForm);
function edit(row) {
  resetForm();editing=row.id;$('#date').value=row.date;
  for(const meter of Object.keys(METERS)){$('#value-'+meter).disabled=meter!==row.meter;$('#reset-'+meter).disabled=meter!==row.meter;}
  $('#value-'+row.meter).value=String(row.value).replace('.',',');$('#reset-'+row.meter).checked=row.reset;
  $('#entry-title').textContent='Ret aflæsning · '+METERS[row.meter].name;$('#save').textContent='Gem ændring';$('#cancel-edit').hidden=false;
  $('.entry-panel').scrollIntoView({behavior:'auto',block:'start'});$('#value-'+row.meter).focus();
}
function renderOverview(){
  $('#overview').replaceChildren();
  for(const [meter,m] of Object.entries(METERS)) {
    const rows=intervals(records,meter), last=rows.at(-1);const b=document.createElement('button');b.className='meter-card';const [accent,tint]=styles[meter];b.style.setProperty('--accent',accent);b.style.setProperty('--tint',tint);
    b.innerHTML=`<span class="meter-top">${m.name}<span class="meter-symbol" aria-hidden="true">${m.icon}</span></span><span class="meter-value">${last?fmt(last.value):'—'}<span class="unit">${m.unit}</span></span><span class="meter-detail">${last ? dateLabel(last.date)+'<br>'+(last.delta===null ? (last.reset?'Nyt udgangspunkt':'Første aflæsning') : '+'+fmt(last.delta)+' '+m.unit+' siden sidst') : 'Ingen aflæsninger endnu<br>Tryk for at komme i gang'}</span>`;
    b.setAttribute('aria-label',m.name+': '+(last?fmt(last.value)+' '+m.unit:'ingen aflæsninger')+'. Indtast aflæsning');b.addEventListener('click',()=>{resetForm();$('.entry-panel').scrollIntoView({block:'start'});$('#value-'+meter).focus();});$('#overview').append(b);
  }
}
function renderChart() {
  const m=METERS[selected], all=intervals(records,selected), points=all.filter(r=>r.delta!==null).slice(-12);
  $('#graph-tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.meter===selected)));
  const container=$('#chart');container.replaceChildren();
  if(!points.length){container.innerHTML='<div class="empty"><span class="empty-icon" aria-hidden="true">▥</span><strong>Her vokser dit overblik</strong><p>Gem to aflæsninger for '+m.name.toLowerCase()+' på forskellige datoer. Så viser vi forbruget imellem dem.</p></div>';return;}
  const last=points.at(-1),head=document.createElement('div');head.className='chart-head';head.innerHTML=`<span class="chart-total">${fmt(last.delta)} <span class="unit">${m.unit}</span></span><span class="chart-note">seneste ${last.days} ${last.days===1?'dag':'dage'}</span>`;container.append(head);
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('chart');svg.setAttribute('viewBox','0 0 560 250');svg.setAttribute('role','img');svg.setAttribute('aria-labelledby','chart-svg-title chart-svg-desc');
  function el(tag,attrs,text){const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;svg.append(e);return e;}
  el('title',{id:'chart-svg-title'},m.name+' · Forbrug i '+m.unit);el('desc',{id:'chart-svg-desc'},points.map(p=>`${dateLabel(p.previous.date)} til ${dateLabel(p.date)}: ${fmt(p.delta)} ${m.unit} over ${p.days} dage`).join('. '));
  const max=Math.max(...points.map(p=>p.delta),1),left=65,width=475,base=202,height=164,step=width/points.length;
  for(let i=0;i<=4;i++){const y=base-i*height/4;el('line',{x1:left,y1:y,x2:540,y2:y,stroke:'#e5eae1','stroke-dasharray':i?'3 4':'0'});el('text',{x:left-10,y:y+4,'text-anchor':'end',fill:'#62736d','font-size':11},fmt(max*i/4));}
  points.forEach((p,i)=>{const bh=p.delta/max*height,bw=Math.min(step*.55,48),x=left+i*step+(step-bw)/2;const rect=el('rect',{x,y:base-bh,width:bw,height:Math.max(bh,1),rx:4,fill:styles[selected][0],opacity:i===points.length-1?1:.55});const title=document.createElementNS(ns,'title');title.textContent=`${dateLabel(p.date)}: ${fmt(p.delta)} ${m.unit} / ${p.days} dage`;rect.append(title);if(points.length<=6||i%2===0||i===points.length-1)el('text',{x:x+bw/2,y:224,'text-anchor':'middle',fill:'#62736d','font-size':11},p.date.slice(8,10)+'.'+p.date.slice(5,7)+'.');});
  container.append(svg);const note=document.createElement('p');note.className='chart-note';note.textContent=`${points.length} ${points.length===1?"seneste forbrugsperiode":"seneste forbrugsperioder"} · ${m.unit} pr. periode`;container.append(note);
}
function renderHistory(){
  const filter=$('#history-filter').value;const all=Object.keys(METERS).flatMap(m=>intervals(records,m)).filter(r=>filter==='all'||r.meter===filter).sort((a,b)=>b.date.localeCompare(a.date)||a.meter.localeCompare(b.meter));
  $('#history-count').textContent=all.length;const container=$('#history');container.replaceChildren();
  if(!all.length){container.innerHTML='<div class="empty"><strong>En frisk start</strong><p>Dine aflæsninger dukker op her, når du har gemt dem.</p></div>';return;}
  const head=document.createElement('div');head.className='history-row head';head.setAttribute('aria-hidden','true');head.innerHTML='<span>DATO</span><span>MÅLER</span><span>AFLÆSNING</span><span>FORBRUG</span><span>HANDLINGER</span>';container.append(head);
  for(const r of all.slice(0,limit)) {
    const m=METERS[r.meter],row=document.createElement('article');row.className='history-row';row.setAttribute('aria-label',m.name+', '+dateLabel(r.date));
    row.innerHTML=`<div class="history-date">${dateLabel(r.date)}</div><div class="history-meter">${m.name}</div><div class="number">${fmt(r.value)} ${m.unit}<span class="row-sub">Samlet aflæsning</span></div><div class="number">${r.delta===null?'—':fmt(r.delta)+' '+m.unit}<span class="row-sub">${r.reset?'Ny måler / nulstilling':!r.previous?'Udgangspunkt':r.days+' dage siden sidst'}</span></div><div class="row-actions"><button class="edit">Ret</button><button class="delete">Slet</button></div>`;
    row.querySelector('.edit').setAttribute('aria-label','Ret '+m.name+' '+dateLabel(r.date));row.querySelector('.delete').setAttribute('aria-label','Slet '+m.name+' '+dateLabel(r.date));
    row.querySelectorAll('button').forEach(b=>b.disabled=!writable);
    row.querySelector('.edit').addEventListener('click',()=>edit(r));row.querySelector('.delete').addEventListener('click',()=>{if(confirm(`Slet ${m.name.toLowerCase()} den ${dateLabel(r.date)} (${fmt(r.value)} ${m.unit})? Forbruget beregnes igen.`))try{persist(records.filter(x=>x.id!==r.id));if(editing===r.id)resetForm();tell('Aflæsningen er slettet.');}catch(e){tell('Kunne ikke slette: '+e.message,true);}});container.append(row);
  }
  if(all.length>limit){const more=document.createElement('button');more.className='secondary';more.textContent='Vis 30 flere';more.addEventListener('click',()=>{limit+=30;renderHistory();});container.append(more);}
}
function render(){renderOverview();renderChart();renderHistory();$('#export').disabled=!writable;}
$('#graph-tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b){selected=b.dataset.meter;renderChart();}});
$('#history-filter').addEventListener('change',()=>{limit=30;renderHistory();});
function download(content,name){const blob=new Blob([content],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function renderBackupStatus(){let date;try{date=localStorage.getItem(BACKUP_KEY);}catch{}$('#backup-status').textContent=date?'Seneste eksport: '+new Date(date).toLocaleString('da-DK'):'Ingen backup eksporteret endnu.';}
$('#export').addEventListener('click',()=>{download(JSON.stringify({app:'maalerblik',version:2,heatUnit:'kWh',exportedAt:new Date().toISOString(),records},null,2),'maalerblik-backup-'+today()+'.json');try{localStorage.setItem(BACKUP_KEY,new Date().toISOString());}catch{}renderBackupStatus();tell('Backup er klar til at blive gemt. Kontrollér, at JSON-filen er gemt i Filer eller Overførsler.');});
$('#rescue').addEventListener('click',()=>download(rescueSource,'maalerblik-oprindelige-data.json'));
$('#import').addEventListener('click',()=>{$('#import-file').value='';$('#import-file').click();});
$('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('Filen er for stor (maks. 10 MB).');const incoming=await readWithHeatChoice(await file.text(),'Denne backup er fra den tidligere version. Hvordan blev varmetallene i filen indtastet?');const result=mergeRecords(records,incoming);pending=incoming;$('#import-summary').textContent=`Filen indeholder ${incoming.length} ${incoming.length===1?"aflæsning":"aflæsninger"}. ${result.added} ${result.added===1?"ny tilføjes":"nye tilføjes"}, og ${incoming.length-result.added} identiske springes over.`;$('#import-dialog').showModal();}catch(e){pending=null;tell('Import afvist: '+e.message,true);}});
$('#import-cancel').addEventListener('click',()=>{$('#import-dialog').close();pending=null;});
$('#import-confirm').addEventListener('click',()=>{try{if(!pending)throw Error('Vælg backupfilen igen.');const result=mergeRecords(records,pending);persist(result.records);$('#import-dialog').close();pending=null;resetForm();tell(`${result.added===1?"1 ny aflæsning er":result.added+" nye aflæsninger er"} importeret. Eksisterende aflæsninger er bevaret.`);}catch(e){$('#import-dialog').close();pending=null;tell('Import afvist: '+e.message,true);}});
window.addEventListener('storage',e=>{if(e.key===KEY || e.key===null){tell('Aflæsninger er ændret i et andet vindue. Genindlæs siden for at arbejde med den nyeste historik.',true);writable=false;$('#save').disabled=true;$('#import').disabled=true;render();}});
initInputs();await load();resetForm();$('#date').max=today();render();renderBackupStatus();
if('serviceWorker' in navigator && window.isSecureContext){
  navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{$('#offline-status').textContent='Klar til offline. Appen kan åbnes fra denne adresse uden internet, så længe browseren beholder de gemte appfiler.';}).catch(()=>{$('#offline-status').textContent='Offline er ikke klar. Åbn appen med internet og genindlæs for at prøve igen. Aflæsninger gemmes stadig lokalt, hvis lageret er tilgængeligt.';});
}else $('#offline-status').textContent='Offline kræver en HTTPS-adresse (eller localhost ved test). Åbning af HTML-filen direkte giver ikke fuld appfunktion.';
