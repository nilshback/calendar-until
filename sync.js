'use strict';
const api = 'https://api.github.com/repos/nilshback/calendar-until-data';
const branch = 'main';
const noteFile = '/contents/journal.json';
const baseKey = prefix + 'calendar-until-data:cloud-base';
const tokenKey = prefix + 'sync-token';
let credential = '', pendingTimer, busy = false, again = false;

function syncState(button, message) {
  $('syncLabel').textContent = button;
  $('connect').setAttribute('aria-label', 'Sync settings, '+button);
  $('syncMessage').textContent = message;
  $('retry').hidden = $('disconnect').hidden = !credential;
}
function snapshot() {
  const notes = {};
  for (const id of dates.keys()) {
    const value = read(id);
    if (value) notes[id] = value;
  }
  return notes;
}
function encodeNotes(notes) {
  const bytes = new TextEncoder().encode(JSON.stringify(notes));
  let binary = '';
  for(let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
function decodeNotes(content) {
  const bytes = Uint8Array.from(atob(content), c=>c.charCodeAt(0));
  const notes = JSON.parse(new TextDecoder().decode(bytes));
  if(!notes || typeof notes !== 'object' || Array.isArray(notes) ||
    Object.entries(notes).some(([id,v])=>!dates.has(id)||typeof v !== 'string')) throw Error('Invalid remote journal.');
  return notes;
}
async function request(path, token, options = {}) {
  const response = await fetch(api + path, {
    cache:'no-store', redirect:'error', ...options,
    headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'Content-Type':'application/json'}
  });
  if(response.status === 401) throw Error('GitHub rejected the token. Enter a current token for calendar-until-data.');
  if(response.status === 404) throw Error('Check that your token includes nilshback/calendar-until-data and that main contains journal.json.');
  if(response.status === 403 && options.method === 'PUT') {
    const details = await response.json().catch(() => null);
    const reason = details?.message || 'The server provided no further details.';
    throw Error('GitHub refused the upload (403). ' + reason);
  }
  if(!response.ok) throw Error('GitHub returned '+response.status+'. Check the connection, token permissions, and repository branches.');
  return response.json();
}
// Resolve each day independently. Keep both texts when two offline edits diverge.
function mergeDay(base, local, remote) {
  if(local === remote || remote === base) return local;
  if(local === base) return remote;
  if(!local || !remote) return local || remote;
  return local+'\n\n—— Version from another device ——\n\n'+remote;
}
async function synchronize() {
  const token = credential;
  if(!token) return;
  if(busy) {again = true; return;}
  busy = true;
  try {
    syncState('Syncing…','Checking the private repository.');
    const repo = await request('',token);
    if(repo.private !== true) throw Error('Make calendar-until-data private before syncing.');
    const file = await request(noteFile+'?ref='+branch,token);
    const blob = file.encoding === 'base64' ? file : await request('/git/blobs/'+file.sha,token);
    const remote = decodeNotes(blob.content);
    if(token !== credential) return;
    const base = JSON.parse(localStorage.getItem(baseKey)||'{}');
    const local = snapshot();
    const next = {};
    let differs = false;
    for(const id of dates.keys()) {
      const here = local[id] || '', there = remote[id] || '';
      const value = mergeDay(base[id] || '',here,there);
      if(value !== here) {
        if(value) localStorage.setItem(prefix+id,value); else localStorage.removeItem(prefix+id);
        drafts.delete(id); paint(id);
        if(active === id) $('note').value = value;
      }
      if(value) next[id] = value;
      if(value !== there) differs = true;
    }
    localStorage.setItem(baseKey,JSON.stringify(remote));
    if(differs && locked()) {
      syncState('Local edits','Journal closed. Entries awaiting upload remain on this device and can be exported.');
      return;
    }
    if(differs) {
      await request(noteFile,token,{method:'PUT',body:JSON.stringify({
        message:'Save journal entries',branch,sha:file.sha,content:encodeNotes(next)
      })});
      if(token !== credential) return;
      localStorage.setItem(baseKey,JSON.stringify(next));
    }
    syncState('Synced','Last synced at '+new Date().toLocaleTimeString()+'.');
  } catch(error) {
    if(token === credential) syncState('Sync paused',error.message+' Notes stay on this device. Sync retries automatically.');
  } finally {
    busy = false;
    if(again) {again = false; scheduleSync();}
  }
}
function scheduleSync(delay = 1300) {
  if(!credential) return;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    if(navigator.locks) navigator.locks.request(prefix+'sync',{ifAvailable:true},lock=>lock && synchronize());
    else synchronize();
  },delay);
}
$('connect').onclick = () => $('syncPanel').showModal();
$('dismiss').onclick = () => $('syncPanel').close();
$('disconnect').onclick = () => {
  credential = ''; clearTimeout(pendingTimer);localStorage.removeItem(tokenKey);
  syncState('Connect sync','Disconnected. Your local entries are available on this device.');
};
$('syncForm').onsubmit = event => {
  event.preventDefault();
  credential = $('token').value.trim(); $('token').value = '';
  if($('remember').checked) localStorage.setItem(tokenKey,credential); else localStorage.removeItem(tokenKey);
  scheduleSync(0);
};
$('retry').onclick = () => scheduleSync(0);
$('note').addEventListener('input',()=>{if(credential && !locked()){syncState('Pending sync','Saved locally. Waiting to sync.');scheduleSync();}});
$('file').addEventListener('change',()=>scheduleSync());
window.addEventListener('online',()=>scheduleSync(0));
window.addEventListener('focus',()=>scheduleSync(0));
document.addEventListener('visibilitychange',()=>{if(!document.hidden) scheduleSync(0);});
setInterval(()=>{if(!document.hidden) scheduleSync(0);},60000);
try {credential = localStorage.getItem(tokenKey)||'';} catch {}
syncState('Connect sync','Entries are saved on this device.');
scheduleSync(0);
