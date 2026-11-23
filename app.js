'use strict';
const $ = id => document.getElementById(id);
const start = '2026-11-23', end = '2027-09-23';
const prefix = 'daybook:' + new URL('.', location.href).pathname + ':';
const key = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
const today = () => key(new Date());
const locked = () => today() > end;
const dates = new Map(), rows = new Map();
const drafts = new Map();
let active, scrollTop = 0, lastDay;
function read(id) {
  if (drafts.has(id)) return drafts.get(id);
  try { return localStorage.getItem(prefix + id) || ''; }
  catch { $('notice').textContent = 'Browser storage is unavailable. Download a backup before closing.'; return ''; }
}
function paint(id) {
  const row = rows.get(id), value = read(id);
  row.classList.toggle('past', id < today());
  row.classList.toggle('written', !!value.trim());
  row.setAttribute('aria-current', id === today() ? 'date' : 'false');
  row.setAttribute('aria-label', dates.get(id).toLocaleDateString('en-US',{dateStyle:'full'}) + (value.trim() ? ', has note' : ''));
  row.classList.toggle('current', id === today());
}
function fillWeek(cells, count) {
  for (let i = 0; i < count; i++) {
    const slot = document.createElement('span');
    slot.className = 'outside adjacent';
    slot.setAttribute('aria-hidden', 'true');
    cells.append(slot);
  }
}
let month, list;
for (let d = new Date(2026,10,1,12); key(d) <= '2027-09-30'; d.setDate(d.getDate()+1)) {
  const id = key(d), m = id.slice(0,7);
  if (m !== month) {
    month = m;
    list = document.createElement('section');
    list.className = 'month-section';
    const label = d.toLocaleDateString('en-US',{month:'long'});
    list.innerHTML = '<div class="month" id="m'+m+'"><h2>'+label+'</h2><small>'+d.getFullYear()+'</small></div>';
    const weekdays = document.createElement('div');
    weekdays.className = 'weekdays';
    weekdays.setAttribute('aria-hidden','true');
    for(const name of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) {
      const label = document.createElement('span');
      label.textContent = name; weekdays.append(label);
    }
    list.append(weekdays);
    $('months').append(list);
    const cells = document.createElement('div');
    cells.className = 'days'; list.append(cells); list = cells;
    fillWeek(cells, (d.getDay()+6)%7);
  }
  if (id < start || id > end) {
    const day = document.createElement('span');
    day.className = 'outside';
    day.style.gridColumnStart = String((d.getDay()+6)%7+1);
    day.textContent = String(d.getDate());
    day.setAttribute('aria-hidden','true');
    list.append(day);
  } else {
    dates.set(id,new Date(d));
    const row = document.createElement('button');
    row.style.gridColumnStart = String((d.getDay()+6)%7+1);
    row.setAttribute('aria-label',d.toLocaleDateString('en-US',{dateStyle:'full'}));
    row.className = 'row'; row.id = 'd'+id;
    row.innerHTML = '<span class="num">'+d.getDate()+'</span>';
    row.onclick = () => { scrollTop = window.scrollY; history.pushState({daybook:true},'', '#'+id); route(); };
    list.append(row); rows.set(id,row); paint(id);
  }
  const tomorrow = new Date(d);
  tomorrow.setDate(d.getDate()+1);
  if (tomorrow.getDate() === 1) fillWeek(list, (7-d.getDay())%7);
}
function refresh() {
  const changed = lastDay !== today();
  if (changed) {
    lastDay = today();
    for (const id of dates.keys()) paint(id);
  }
  $('note').readOnly = locked();
  $('restore').disabled = locked();
  if (locked()) {
    $('status').textContent = 'Read-only';
    $('notice').textContent = 'This journal closed for editing on September 23, 2027.';
  }
}
function route() {
  const previous = active;
  active = location.hash.slice(1);
  const opened = dates.has(active);
  $('calendar').hidden = opened; $('editor').hidden = !opened;
  if (opened) {
    const d = dates.get(active);
    $('heading').textContent = d.toLocaleDateString('en-US',{month:'long',day:'numeric'});
    $('subtitle').textContent = d.toLocaleDateString('en-US',{weekday:'long'})+' · '+d.getFullYear();
    $('note').value = read(active); $('status').textContent = drafts.has(active) ? 'Unsaved' : '';
    window.scrollTo(0,0); $('back').focus({preventScroll:true});
  } else if (rows.has(previous)) {
    window.scrollTo(0,scrollTop); rows.get(previous).focus({preventScroll:true});
  }
  refresh();
}
history.scrollRestoration = 'manual';
window.addEventListener('popstate',route);
$('back').onclick = () => { if (history.state?.daybook) history.back(); else {history.replaceState(null,'',location.pathname+location.search);route();} };
$('note').oninput = () => {
  if (locked()) { $('note').value = read(active);refresh();return; }
  const value = $('note').value;
  try {
    if (value) localStorage.setItem(prefix+active,value); else localStorage.removeItem(prefix+active);
    drafts.delete(active); $('status').textContent = 'Saved on this device';
  } catch {
    drafts.set(active,value); $('status').textContent = 'Unsaved';
    $('notice').textContent = 'Storage failed. Download a backup before leaving.';
  }
  paint(active);
};
$('settings').onclick = () => $('preferences').showModal();
$('done').onclick = () => $('preferences').close();
$('backup').onclick = () => {$('result').textContent='';$('panel').showModal();};
$('close').onclick = () => $('panel').close();
$('download').onclick = () => {
  const notes = {};
  for (const id of dates.keys()) {const value = read(id); if(value) notes[id] = value;}
  const url = URL.createObjectURL(new Blob([JSON.stringify({format:'daybook-1',notes},null,2)],{type:'application/json'}));
  const a = document.createElement('a'); a.href=url;a.download='daybook-'+today()+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
};
$('restore').onclick = () => $('file').click();
$('file').onchange = async () => {
  let count = 0;
  try {
    const data = JSON.parse(await $('file').files[0].text());
    if(data.format !== 'daybook-1' || !data.notes || typeof data.notes !== 'object' || Array.isArray(data.notes)) throw Error('Invalid backup.');
    const entries = Object.entries(data.notes);
    if(entries.some(([id,text])=>!dates.has(id)||typeof text !== 'string')) throw Error('Invalid entry in backup.');
    for(const [id,text] of entries) {
      if(locked()) throw Error('Journal is read-only.');
      if(!read(id) && text) {localStorage.setItem(prefix+id,text);paint(id);count++;}
    }
    if(dates.has(active)) $('note').value=read(active);
    $('result').textContent = 'Added '+count+' entries.';
  } catch(e) { $('result').textContent = 'Import stopped after '+count+' entries. '+e.message; }
  $('file').value='';
};
window.addEventListener('storage', e => {
  if(e.key === null || e.key.startsWith(prefix)) {
    for(const id of dates.keys()) paint(id);
    if(dates.has(active)) $('note').value=read(active);
  }
});
window.addEventListener('focus',refresh);setInterval(refresh,1000);route();
if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
