/* scripts.js — updated with filters, expiry badges, analytics + suggestions */
const API_BASE = "/api/items";

/* ---------- Helpers ---------- */
function $(id) { return document.getElementById(id); }
function showPopup(msg) {
  const p = $("popup");
  if (!p) return;
  p.textContent = msg;
  p.style.opacity = 1;
  setTimeout(()=> p.style.opacity = 0, 1200);
}
function escapeHtml(s){ return s ? s.replace(/[&<>"'`]/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;' })[c]) : ''; }

/* ---------- API ---------- */
async function fetchItems(){ const r = await fetch(API_BASE); return r.json(); }
async function postItem(item){ const r = await fetch(API_BASE, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)}); return r.json(); }
async function deleteItem(id){ await fetch(`${API_BASE}/${id}`, { method:'DELETE' }); }

/* ---------- AI-like suggestions ---------- */
const SUGGESTIONS = {
  "milk": { days: 7, storage: "Fridge" },
  "bread": { days: 3, storage: "Room Temp" },
  "apple": { days: 14, storage: "Fridge" },
  "eggs": { days: 21, storage: "Fridge" },
  "cheese": { days: 14, storage: "Fridge" },
  "yogurt": { days: 10, storage: "Fridge" }
};

function getSuggestionForName(name){
  if (!name) return null;
  const key = name.toLowerCase().trim().split(/\s+/)[0];
  return SUGGESTIONS[key] || null;
}

/* ---------- Utility: days left ---------- */
function daysLeft(expiryIso){
  if (!expiryIso) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(expiryIso);
  exp.setHours(0,0,0,0);
  const diff = Math.ceil((exp - today) / (1000*60*60*24));
  return diff; // can be negative if passed
}

/* ---------- Render logic (with filters/sort) ---------- */
async function renderRecent(){
  const list = $("itemsList");
  if (!list) return;
  list.innerHTML = 'Loading...';

  let items = await fetchItems();

  // apply search & filters
  const search = ($("searchText")?.value || "").toLowerCase().trim();
  const fCat = $("filterCategory")?.value || "";
  const fStor = $("filterStorage")?.value || "";
  const sortBy = $("sortBy")?.value || "newest";

  items = items.filter(it=>{
    if (search && !(it.name||"").toLowerCase().includes(search)) return false;
    if (fCat && it.category !== fCat) return false;
    if (fStor && it.storage !== fStor) return false;
    return true;
  });

  // compute daysLeft for each
  items.forEach(it => { it._daysLeft = daysLeft(it.expiry); });

  // sort
  if (sortBy === "expirySoon"){ items.sort((a,b)=> {
      const da = (a._daysLeft === null) ? 99999 : a._daysLeft;
      const db = (b._daysLeft === null) ? 99999 : b._daysLeft;
      return da - db;
    });
  } else if (sortBy === "name") {
    items.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  } else if (sortBy === "daysLeft"){
    items.sort((a,b)=>{
      const da = (a._daysLeft===null)?99999:a._daysLeft;
      const db = (b._daysLeft===null)?99999:b._daysLeft;
      return da - db;
    });
  } else {
    // newest by createdAt
    items.sort((a,b)=> b.createdAt - a.createdAt);
  }

  list.innerHTML = '';
  if (!items.length) { list.innerHTML = '<div style="color:#555">No items</div>'; return; }

  items.forEach(it => {
    const dLeft = it._daysLeft;
    let badgeHtml = '';
    if (dLeft !== null){
      if (dLeft < 0) badgeHtml = `<div class="badge gray">Expired</div>`;
      else if (dLeft <= 2) badgeHtml = `<div class="badge red">${dLeft}d left</div>`;
      else if (dLeft <= 7) badgeHtml = `<div class="badge yellow">${dLeft}d left</div>`;
      else badgeHtml = `<div style="font-size:13px;color:#2d6bff;font-weight:700">${dLeft}d</div>`;
    }

    const locHtml = it.location ? `<div style="font-size:13px;color:#4b5563">${escapeHtml(it.location)}</div>` : '';
    const expiryHtml = it.expiry ? `<div style="font-size:13px;color:#b03030">Expiry: ${new Date(it.expiry).toLocaleDateString()}</div>` : '';

    const div = document.createElement('div');
    div.className = 'item-card';
    div.innerHTML = `
      <div class="item-meta">
        <div style="font-weight:700">${escapeHtml(it.name)}</div>
        <div style="font-size:13px;color:#4b5563">${escapeHtml(it.category)} • ${escapeHtml(it.storage)}</div>
        ${expiryHtml}
        ${locHtml}
        ${badgeHtml}
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        <div class="item-qr"><canvas id="qr-${it.id}"></canvas></div>
        <button style="background:#2b7aee;padding:6px 8px;border-radius:8px;border:none;color:white;font-weight:600" onclick="openMapForItem('${encodeURIComponent(it.location||"")}')">Show map</button>
      </div>
    `;
    list.appendChild(div);

    const payload = [it.name||"", it.category||"", it.storage||"", it.expiry||"", it.location||""].join("|");
    try { QRCode.toCanvas(document.getElementById(`qr-${it.id}`), payload, { width:90 }); } catch(e){}

    // right-click delete
    div.addEventListener('contextmenu', async (e)=>{
      e.preventDefault();
      if (confirm('Delete this item?')){ await deleteItem(it.id); renderRecent(); renderCart(); }
    });
  });

  populateFilterOptions(items);
}

/* ---------- populate filter dropdowns (category/storage) ---------- */
function populateFilterOptions(currentItems){
  const catSet = new Set();
  const storSet = new Set();
  (currentItems || []).forEach(i => { if(i.category) catSet.add(i.category); if(i.storage) storSet.add(i.storage); });
  const catSel = $("filterCategory");
  const storSel = $("filterStorage");
  if (catSel){
    const prev = catSel.value || "";
    catSel.innerHTML = `<option value="">All categories</option>`;
    Array.from(catSet).sort().forEach(c => catSel.innerHTML += `<option>${c}</option>`);
    catSel.value = prev;
  }
  if (storSel){
    const prevS = storSel.value || "";
    storSel.innerHTML = `<option value="">All storage</option>`;
    Array.from(storSet).sort().forEach(s => storSel.innerHTML += `<option>${s}</option>`);
    storSel.value = prevS;
  }
}

/* ---------- cart render ---------- */
async function renderCart(){
  const box = $("cartItems");
  if (!box) return;
  let items = await fetchItems();

  // local cart search & sort (cart page controls wired to inputs)
  const search = ($("searchTextCart")?.value || "").toLowerCase().trim();
  const sortC = $("sortCart")?.value || "newest";
  items = items.filter(it => !search || (it.name||"").toLowerCase().includes(search));

  items.forEach(it => it._daysLeft = daysLeft(it.expiry));

  if (sortC === "expirySoon"){
    items.sort((a,b)=> {
      const da = (a._daysLeft===null)?99999:a._daysLeft;
      const db = (b._daysLeft===null)?99999:b._daysLeft;
      return da - db;
    });
  } else if (sortC === "name"){
    items.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  } else {
    items.sort((a,b)=> b.createdAt - a.createdAt);
  }

  box.innerHTML = "";
  if (!items.length) { box.innerHTML = '<div style="color:#555">Cart empty</div>'; return; }

  items.forEach(it=>{
    const expiryHtml = it.expiry ? `<div style="color:#b03030">Expiry: ${new Date(it.expiry).toLocaleDateString()}</div>` : '';
    const locHtml = it.location ? `<div style="font-size:13px;color:#4b5563">${escapeHtml(it.location)}</div>` : '';
    const days = (it._daysLeft !== null) ? `${it._daysLeft}d left` : '';

    const el = document.createElement('div');
    el.className = 'item-card';
    el.innerHTML = `
      <div style="flex:1">
        <div style="font-weight:700">${escapeHtml(it.name)}</div>
        <div style="font-size:13px;color:#4b5563">${escapeHtml(it.category)} • ${escapeHtml(it.storage)}</div>
        ${expiryHtml}
        ${locHtml}
        <div style="font-size:13px;color:#2d6bff;font-weight:700">${days}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
        <button style="background:#2b7aee;padding:6px 8px;border-radius:8px;border:none;color:white;font-weight:600" onclick="openMapForItem('${encodeURIComponent(it.location||"")}')">Show map</button>
        <button style="background:#ff5b6e;padding:6px 8px;border-radius:8px;border:none;color:white;font-weight:600" onclick="(async ()=>{ if(confirm('Delete?')){ await deleteItem('${it.id}'); renderCart(); renderRecent(); } })()">Delete</button>
      </div>
    `;
    box.appendChild(el);
  });
}

/* ---------- Add item flow with AI suggestion ---------- */
async function handleAdd(){
  const name = $("itemName").value.trim();
  const category = $("category").value;
  const storage = $("storage").value;
  const expiry = $("expiry").value || null;
  const location = $("location").value.trim();

  if (!name) return alert('Enter name');

  await postItem({ name, category, storage, expiry, location });
  $("itemName").value = ""; $("expiry").value = ""; $("location").value = "";
  showPopup('Added');
  renderRecent(); renderCart();
}

/* ---------- Scanner (extended payload) ---------- */
let scannerInstance;
function openScanner(){
  const modal = $("scannerModal");
  if (!modal) return;
  modal.style.display = 'flex';

  scannerInstance = new Html5Qrcode('reader');
  scannerInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 250 },
    async (decodedText) => {
      const parts = decodedText.split("|");
      const item = {
        name: parts[0] || decodedText,
        category: parts[1] || "Other",
        storage: parts[2] || "Pantry",
        expiry: parts[3] || null,
        location: parts[4] || ""
      };
      try { await postItem(item); showPopup('Scanned & added'); renderRecent(); renderCart(); } catch(e){ alert('Add failed'); }
      try { await scannerInstance.stop(); scannerInstance.clear(); } catch(e){}
      modal.style.display = 'none';
    },
    (error)=>{}
  ).catch(err => { alert('Scanner failed: '+err); modal.style.display = 'none'; });
}
async function closeScanner(){ const modal = $("scannerModal"); if (modal) modal.style.display = 'none'; if (scannerInstance) { try{ await scannerInstance.stop(); scannerInstance.clear(); } catch(e){} } }

/* ---------- Map helper ---------- */
function openMapForItem(encodedLocation){
  const loc = decodeURIComponent(encodedLocation || "");
  if (!loc) { window.open('https://www.google.com/maps/search/food+donation+near+me','_blank'); return; }
  window.open(`https://www.google.com/maps/search/${encodeURIComponent(loc)}`,'_blank');
}
function openDonationMap(){ window.open('https://www.google.com/maps/search/food+donation+near+me','_blank'); }

/* ---------- Generate QR for last item ---------- */
async function generateQR(){
  const items = await fetchItems();
  if (!items.length) return alert('No items');
  const last = items[0];
  let canvas = document.getElementById('sampleQR');
  if (!canvas){ canvas = document.createElement('canvas'); canvas.id = 'sampleQR'; $("itemsList").prepend(canvas); }
  const payload = [last.name||"", last.category||"", last.storage||"", last.expiry||"", last.location||""].join("|");
  QRCode.toCanvas(canvas, payload, { width: 180 }).catch(()=>{});
}

/* ---------- Analytics: build charts ---------- */
async function buildAnalytics(){
  const items = await fetchItems();
  // category distribution
  const catCount = {};
  const expiryBuckets = { 'Expired':0, '0-2d':0, '3-7d':0, '8-30d':0, '30+d':0, 'No expiry':0 };
  items.forEach(it=>{
    const c = it.category || 'Other'; catCount[c] = (catCount[c]||0)+1;
    const dl = daysLeft(it.expiry);
    if (dl === null) expiryBuckets['No expiry']++;
    else if (dl < 0) expiryBuckets['Expired']++;
    else if (dl <=2) expiryBuckets['0-2d']++;
    else if (dl <=7) expiryBuckets['3-7d']++;
    else if (dl <=30) expiryBuckets['8-30d']++;
    else expiryBuckets['30+d']++;
  });

  // render charts if canvases exist
  const catCtx = document.getElementById('catChart');
  if (catCtx){
    const labels = Object.keys(catCount);
    const data = labels.map(l=>catCount[l]);
    new Chart(catCtx, { type:'pie', data:{ labels, datasets:[{ data, backgroundColor: generateColors(labels.length) }]}, options:{ responsive:true }});
  }

  const expCtx = document.getElementById('expiryChart');
  if (expCtx){
    const labels = Object.keys(expiryBuckets);
    const data = labels.map(l=>expiryBuckets[l]);
    new Chart(expCtx, { type:'bar', data:{ labels, datasets:[{ label:'Items', data, backgroundColor: generateColors(labels.length) }]}, options:{ responsive:true, scales:{ y:{ beginAtZero:true }}}});
  }
}

/* ---------- Export CSV ---------- */
async function exportCSV(){
  const items = await fetchItems();
  const rows = [['id','name','category','storage','expiry','location','createdAt']];
  items.forEach(it => rows.push([it.id, it.name, it.category, it.storage, it.expiry||'', it.location||'', new Date(it.createdAt).toISOString()]));
  const csv = rows.map(r => r.map(c => `"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'wastenot_items.csv'; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- UI wiring ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  // page actions
  if ($('addBtn')) $('addBtn').addEventListener('click', handleAdd);
  if ($('scanBtn')) $('scanBtn').addEventListener('click', openScanner);
  if ($('closeScanner')) $('closeScanner').addEventListener('click', closeScanner);
  if ($('generateSampleQr')) $('generateSampleQr').addEventListener('click', generateQR);
  if ($('donationMap')) $('donationMap').addEventListener('click', openDonationMap);
  if ($('donationMapCart')) $('donationMapCart').addEventListener('click', openDonationMap);
  if ($('donationMapFooter')) $('donationMapFooter').addEventListener('click', openDonationMap);
  if ($('goAnalytics')) $('goAnalytics').addEventListener('click', ()=> location.href='analytics.html');
  if ($('goAnalyticsCart')) $('goAnalyticsCart').addEventListener('click', ()=> location.href='analytics.html');

  // filters
  ['searchText','filterCategory','filterStorage','sortBy'].forEach(id=>{
    const el = $(id); if (el) el.addEventListener('input', ()=> renderRecent());
  });
  if ($('clearFilters')) $('clearFilters').addEventListener('click', ()=>{
    if ($('searchText')) $('searchText').value='';
    if ($('filterCategory')) $('filterCategory').value='';
    if ($('filterStorage')) $('filterStorage').value='';
    if ($('sortBy')) $('sortBy').value='newest';
    renderRecent();
  });

  if ($('searchTextCart')) $('searchTextCart').addEventListener('input', ()=> renderCart());
  if ($('sortCart')) $('sortCart').addEventListener('change', ()=> renderCart());

  // suggestion logic on name input
  const nameInput = $('itemName');
  if (nameInput){
    nameInput.addEventListener('input', ()=>{
      const s = getSuggestionForName(nameInput.value);
      const textEl = $('suggestText'); const applyBtn = $('applySuggest');
      if (s){
        const suggestedDate = new Date(); suggestedDate.setDate(suggestedDate.getDate() + s.days);
        textEl.innerHTML = `Suggested expiry: <strong>${suggestedDate.toISOString().slice(0,10)}</strong>, storage: <strong>${s.storage}</strong>`;
        applyBtn.style.display = 'inline-block';
        applyBtn.onclick = ()=> {
          $('expiry').value = suggestedDate.toISOString().slice(0,10);
          $('storage').value = s.storage;
        };
      } else {
        textEl.innerHTML = '';
        if (applyBtn) applyBtn.style.display = 'none';
      }
    });
  }

  // analytics export
  if ($('exportCsv')) $('exportCsv').addEventListener('click', exportCSV);

  // initialize page-specific renders
  renderRecent(); renderCart();
  if (location.pathname.endsWith('analytics.html')) buildAnalytics();
});

/* ---------- small helpers for charts ---------- */
function generateColors(n){
  const palette = ['#4f7cff','#2b7aee','#ff9f43','#f6c95f','#e53e3e','#8f9bb3','#7bd389','#6f42c1','#ff6b6b','#1dd1a1'];
  const out=[];
  for(let i=0;i<n;i++) out.push(palette[i % palette.length]);
  return out;
}
