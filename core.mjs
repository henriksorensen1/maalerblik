export const METERS = { el: { name: 'El', unit: 'kWh', icon: 'ϟ' }, vand: { name: 'Vand', unit: 'm³', icon: '◉' }, varme: { name: 'Varme', unit: 'MWh', icon: '♨' } };
export const MAX_RECORDS = 20000;
export function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '1900-01-01' && !Number.isNaN(Date.parse(s)) && new Date(s+'T12:00:00Z').toISOString().slice(0,10) === s; }
export function parseValue(s) {
  const v = String(s).trim();
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(v)) throw Error('Skriv et positivt tal eller 0 med højst 3 decimaler. Brug komma eller punktum som decimaltegn, uden tusindtalsseparator.');
  const n = Number(v.replace(',','.'));
  if (!Number.isFinite(n) || n > 1e9) throw Error('Tallet er for stort (maks. 1 milliard).');
  return n;
}
export function ordered(records, meter) { return records.filter(r => r.meter === meter).sort((a,b)=>a.date.localeCompare(b.date)); }
export function validateRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) throw Error('Backup skal indeholde en liste med højst 20.000 aflæsninger.');
  const keys = new Set(), ids = new Set();
  const clean = records.map(r => {
    if (!r || typeof r !== 'object' || !Object.hasOwn(METERS,r.meter) || !validDate(r.date) || r.date > today() || typeof r.value !== 'number' || !Number.isFinite(r.value) || r.value < 0 || r.value > 1e9 || Math.abs(r.value*1000-Math.round(r.value*1000)) > 0.001 || typeof r.reset !== 'boolean' || typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(r.id)) throw Error('En aflæsning har ugyldig dato, måler, tal eller identifikation. Fremtidige datoer er ikke tilladt.');
    const key = r.meter+'|'+r.date;
    if (keys.has(key) || ids.has(r.id)) throw Error('Der er flere aflæsninger for samme måler/dato eller gentagne identifikationer.');
    keys.add(key); ids.add(r.id);
    return { id:r.id, meter:r.meter, date:r.date, value:r.value, reset:r.reset };
  });
  for (const meter of Object.keys(METERS)) {
    const rows = ordered(clean,meter);
    for (let i=1;i<rows.length;i++) if (!rows[i].reset && rows[i].value < rows[i-1].value) throw Error(`${METERS[meter].name}: aflæsningen ${rows[i].date} er lavere end den forrige. Ret tallet, eller markér målerskift på den første aflæsning fra den nye måler.`);
  }
  return clean;
}
export function difference(row, previous) { return !previous || row.reset ? null : (Math.round(row.value*1000)-Math.round(previous.value*1000))/1000; }
export function intervals(records,meter) { const rows=ordered(records,meter); return rows.map((r,i)=>({...r, previous:rows[i-1] || null, delta:difference(r,rows[i-1]), days:i ? Math.round((Date.parse(r.date)-Date.parse(rows[i-1].date))/86400000) : null })); }
export function readBackup(text) {
  let data; try { data=JSON.parse(text); } catch { throw Error('Filen er ikke gyldig JSON. Vælg en backup fra Målerblik.'); }
  if (!data || data.app !== 'maalerblik' || data.version !== 1) throw Error('Filen er ikke en understøttet Målerblik-backup (version 1).');
  return validateRecords(data.records);
}
export function mergeRecords(existing,incoming) {
  const result = [...existing], keys = new Map(existing.map(r=>[r.meter+'|'+r.date,r]));
  let added=0;
  for (const r of incoming) {
    const key=r.meter+'|'+r.date, old=keys.get(key);
    if (old) { if(old.value !== r.value || old.reset !== r.reset) throw Error(`Konflikt: ${METERS[r.meter].name} den ${r.date} har forskellige tal eller markeringer. Ingen data er importeret. Ret aflæsningen i historikken først.`); }
    else { const row={...r, id:crypto.randomUUID()}; result.push(row); keys.set(key,row); added++; }
  }
  return { records:validateRecords(result), added };
}
