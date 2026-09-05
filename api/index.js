const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');

// npm run dev

const DATA_ROOT = path.join(__dirname, '..');
const CACHE_ROOT = '/tmp/giptv-cache';
const API_ROOT = 'https://iptv-org.github.io/api';

async function readJson(url, filename) {
  const cacheFile = path.join(CACHE_ROOT, filename);
  try {
    const cached = await fs.readFile(cacheFile, 'utf8');
    const stat = await fs.stat(cacheFile);
    if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) return JSON.parse(cached);
  } catch (_) {}

  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Node-IPTV-App/1.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    await fs.mkdir(CACHE_ROOT, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(data));
    return data;
  } catch (_) {
    try { return JSON.parse(await fs.readFile(path.join(DATA_ROOT, filename), 'utf8')); } catch (_) { return []; }
  }
}

async function readEpg() {
  const cacheFile = path.join(CACHE_ROOT, 'epg.xml');
  let xml;
  try {
    const cached = await fs.readFile(cacheFile, 'utf8');
    const stat = await fs.stat(cacheFile);
    if (Date.now() - stat.mtimeMs < 6 * 60 * 60 * 1000) xml = cached;
  } catch (_) {}

  if (!xml) {
    try {
      const response = await fetch('https://avkb.short.gy/epg.xml.gz', { headers: { 'User-Agent': 'Node-IPTV-App/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      xml = zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
      await fs.mkdir(CACHE_ROOT, { recursive: true });
      await fs.writeFile(cacheFile, xml);
    } catch (_) {
      try { xml = await fs.readFile(path.join(DATA_ROOT, 'epg.xml'), 'utf8'); } catch (_) { return {}; }
    }
  }

  const programs = {};
  const latest = {};
  for (const match of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi)) {
    const attrs = match[1];
    const body = match[2];
    const channel = attribute(attrs, 'channel');
    const start = Date.parse(epgDate(attribute(attrs, 'start')));
    const stop = Date.parse(epgDate(attribute(attrs, 'stop')));
    const title = textContent(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    if (!channel || !title || Number.isNaN(stop)) continue;
    if (start <= Date.now() && stop > Date.now()) programs[channel] = title;
    if (!latest[channel] || stop > latest[channel].stop) latest[channel] = { title, stop };
  }

  const byName = {};
  for (const match of xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi)) {
    const id = attribute(match[1], 'id');
    const name = textContent(match[2].match(/<display-name\b[^>]*>([\s\S]*?)<\/display-name>/i)?.[1] || '');
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (name && id && (programs[id] || latest[id])) byName[key] = programs[id] || latest[id].title;
  }
  return { programs, byName };
}

function attribute(source, name) {
  return source.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'))?.[1] || '';
}

function epgDate(value) {
  return value.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})/, '$1-$2-$3T$4:$5:$6$7');
}

function textContent(value) {
  return value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function escapeHtml(value, attributeValue = false) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": attributeValue ? '&#039;' : '&#39;' }[char]));
}

function countryFlag(code) {
  if (!/^[a-z]{2}$/i.test(code)) return '';
  return String.fromCodePoint(...code.toUpperCase().split('').map(char => char.charCodeAt(0) + 127397));
}

function categoryIcon(categoryName) {
  const name = String(categoryName || '').toLowerCase();
  const icons = [
    [/news|current affairs/, '📰'],
    [/sport|football|cricket|tennis/, '🏆'],
    [/movie|film|cinema/, '🎬'],
    [/music|radio/, '🎵'],
    [/kid|children|cartoon/, '🧸'],
    [/entertainment|comedy/, '🎭'],
    [/documentary|nature|wildlife/, '🌿'],
    [/religious|religion/, '🙏'],
    [/business|finance/, '💼'],
    [/science|technology/, '🔬'],
    [/weather/, '🌤️'],
    [/shopping/, '🛍️'],
    [/travel/, '✈️'],
    [/series|drama/, '📺'],
    [/education|educational/, '🎓']
  ];
  return icons.find(([pattern]) => pattern.test(name))?.[1] || '📺';
}

function queryUrl(req, params = {}) {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return `${url.pathname}${url.search}`;
}

function renderPage({ channels, countries, categories, countryNames, total, page, totalPages, search, country, category }) {
  const pageChannels = channels.slice((page - 1) * 48, page * 48);
  const cards = pageChannels.length ? pageChannels.map(channel => {
    const countryCode = (channel.country || '').toUpperCase();
    const flagMarkup = /^[A-Z]{2}$/.test(countryCode)
      ? `<img src="https://flagcdn.com/20x15/${countryCode.toLowerCase()}.png" alt="${escapeHtml(countryFlag(countryCode), true)} flag" width="20" height="15" loading="lazy">`
      : '';
    return `
    <div class="col-6 col-sm-4 col-md-3"><div class="card channel-card h-100 p-2" onclick='playStream(...${escapeHtml(JSON.stringify([channel.stream_url, channel.name, channel.id, channel.program_name || '']), true)})'>
      <div class="logo-container mb-2"><img src="${escapeHtml(channel.logo || `https://placehold.co/150x80/000/EEE?font=montserrat&text=${encodeURIComponent(channel.name)}`, true)}" class="channel-logo" alt="Logo" loading="lazy" onerror="this.src='https://placehold.co/150x80/000/EEE?font=montserrat&text=No+Logo'"></div>
      <div class="text-center text-truncate fw-bold" style="font-size:0.85rem" title="${escapeHtml(channel.name, true)}">${escapeHtml(channel.name)}</div>
      <div class="text-center text-muted" style="font-size:0.7rem">${flagMarkup} ${escapeHtml(countryNames[countryCode] || countryCode || 'Unknown')}</div>
    </div></div>`;
  }).join('') : '<div class="col-12 text-center text-muted p-5"><h5>No channels found.</h5></div>';
  const pageLinks = totalPages > 1 ? `<nav class="mt-4"><ul class="pagination">${Array.from({ length: totalPages }, (_, index) => index + 1).filter(number => number >= Math.max(1, page - 2) && number <= Math.min(totalPages, page + 2)).map(number => `<li class="page-item ${number === page ? 'active' : ''}"><a class="page-link" href="${queryUrl({ url: '/', headers: {} }, { page: number, search, country, category })}">${number}</a></li>`).join('')}</ul></nav>` : '';
  const selectedCountryName = country ? (countries[country] || country) : 'All countries';
  const countryPickerOptions = Object.entries(countries).map(([code, name]) => `<button type="button" class="country-option" data-country="${escapeHtml(code, true)}"><img src="https://flagcdn.com/20x15/${code.toLowerCase()}.png" alt="${escapeHtml(countryFlag(code), true)} flag" width="20" height="15" loading="lazy"> ${escapeHtml(name)}</button>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" href="/favicon.ico" type="image/x-icon"><title>Global IPTV</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><link rel="stylesheet" href="https://unpkg.com/shaka-player@4.15.5/dist/controls.css"><script src="https://unpkg.com/shaka-player@4.15.5/dist/shaka-player.ui.js"></script>
    <style>${styles()}</style></head><body><div class="background-animation" aria-hidden="true">${'<span class="bubble"></span>'.repeat(8)}</div><div class="container py-4">
    <div class="row mb-4 align-items-center glass-panel header-panel"><div class="col-md-7"><h2>▣ Global IPTV Player</h2><p class="text-muted small mb-0">Powered by iptv-org API | Found ${total.toLocaleString()} playable channels</p></div><div class="col-md-5 mt-3 mt-md-0"><form id="filter-form" method="GET"><div class="input-group"><input type="text" name="search" class="form-control glass-control" placeholder="Search for a channel..." value="${escapeHtml(search, true)}"><div class="country-picker"><input type="hidden" name="country" value="${escapeHtml(country, true)}"><button type="button" id="country-picker-toggle" class="country-picker-toggle glass-control"><span>${country ? `<img src="https://flagcdn.com/20x15/${country.toLowerCase()}.png" alt="${escapeHtml(countryFlag(country), true)} flag" width="20" height="15">` : ''} ${escapeHtml(selectedCountryName)}</span><span aria-hidden="true">&#9662;</span></button><div id="country-picker-menu" class="country-picker-menu" hidden><button type="button" class="country-option" data-country="">All countries</button>${countryPickerOptions}</div></div><select name="category" class="form-select glass-control"><option value="">📺 All categories</option>${Object.entries(categories).map(([id, name]) => `<option value="${escapeHtml(id, true)}" ${category === id ? 'selected' : ''}>${categoryIcon(name)} ${escapeHtml(name)}</option>`).join('')}</select><button class="btn btn-primary" type="submit">Search</button>${search || country || category ? '<a href="/" class="btn btn-outline-secondary clear" onmousedown="this.form.elements.search.value=\'\'" onclick="this.form.elements.search.value=\'\'">Clear</a>' : ''}</div></form></div></div>
    <div class="row"><div class="col-lg-5 mb-4"><div id="player-wrapper"><div data-shaka-player-container><video data-shaka-player id="video-player" autoplay></video></div><div class="p-3 player-meta"><div class="d-flex align-items-center justify-content-between gap-2"><h5 id="now-playing-title" class="m-0 text-truncate">Select a channel to play</h5><small id="now-playing-status" class="text-muted">Waiting...</small></div><div id="now-playing-program" class="small text-light text-truncate mt-1" aria-live="polite"></div></div></div></div><div class="col-lg-7"><div id="channel-list" class="row g-3">${cards}</div><div id="pagination-container">${pageLinks}</div></div></div></div><script>${clientScript()}</script></body></html>`;
}

function styles() {
  return `:root{--glass:#121920c7;--border:#ffffff33}body{position:relative;min-height:100vh;overflow-x:hidden;background:#1a1e23;color:#fff}.background-animation{display:none}.container{position:relative;z-index:1}.glass-panel,#player-wrapper,.channel-card{background:var(--glass);border:1px solid var(--border);border-radius:1rem;box-shadow:0 1.5rem 3rem #0003;backdrop-filter:blur(1.25rem)}.header-panel{position:relative;z-index:30;padding:1.25rem}.glass-control{background:#ffffff17!important;border:1px solid var(--border)!important;color:#f8fafc!important}.glass-control::placeholder{color:#ffffff9e}.glass-control option{background:#202b34}.card{color:#dce7ef}.country-picker{position:relative;z-index:31;flex:1 1 auto;width:1%;min-width:0}.country-picker-toggle{width:100%;height:100%;display:flex;align-items:center;justify-content:space-between;gap:.5rem;text-align:left;border-radius:0!important;white-space:nowrap;overflow:hidden}.country-picker-toggle span:first-child{overflow:hidden;text-overflow:ellipsis}.country-picker-toggle img,.country-option img{vertical-align:middle;margin-right:.25rem}.country-picker-menu{position:absolute;top:calc(100% + .25rem);left:0;right:0;z-index:40;max-height:18rem;overflow-y:auto;padding:.25rem;background:#202b34;border:1px solid var(--border);border-radius:.375rem;box-shadow:0 .75rem 1.5rem #0008;width: fit-content;}.country-option{display:block;width:100%;padding:.4rem .5rem;border:0;background:transparent;color:#f8fafc;text-align:left;white-space:nowrap}.country-option:hover,.country-option:focus{background:#ffffff24}.channel-card{cursor:pointer;transition:.25s}.channel-card:hover{background:#ffffff2b;border-color:#7dd3fcb8;transform:translateY(-.25rem)}.logo-container{height:80px;display:flex;align-items:center;justify-content:center;background:#030000;padding:5px;border-radius:12px}.channel-logo{max-height:100%;max-width:100%;object-fit:contain}#player-wrapper{position:sticky;top:20px;z-index:2;overflow:hidden}video{width:100%;aspect-ratio:16/9;background:#000}.pagination{justify-content:center;flex-wrap:wrap}.page-link{background:#ffffff05;border-color:var(--border);color:#fff}.page-item.active .page-link{background:#38bdf880;border-color:#7dd3fcbf}.text-muted{color:#aaa!important}.player-meta{background:#0000003d!important}.live-status{display:inline-flex;align-items:center;gap:.35rem}.live-status::before{content:'';width:.5rem;height:.5rem;border-radius:50%;background:#21c55d;box-shadow:0 0 .4rem #21c55dcc;flex:0 0 .5rem}@media(max-width:768px){.container{padding-left:1rem;padding-right:1rem}.input-group{flex-wrap:wrap;gap:.5rem}.input-group>*{flex:1 1 100%;border-radius:.375rem!important}.country-picker{width:100%}.country-picker-toggle{border-radius:.375rem!important}}`;
}

function clientScript() {
  return `const video=document.getElementById('video-player'),titleEl=document.getElementById('now-playing-title'),statusEl=document.getElementById('now-playing-status'),programEl=document.getElementById('now-playing-program');let shakaPlayer,pendingStream;function updateProgram(name){programEl.textContent=name?'Now playing: '+name:''}async function loadStream(url){if(!shakaPlayer){pendingStream={url};return}try{await shakaPlayer.load(url);statusEl.textContent='Live';statusEl.className='text-success live-status'}catch(error){console.error(error);statusEl.textContent='Stream unavailable';statusEl.className='text-danger'}}async function init(){const ui=video.ui;if(!ui){statusEl.textContent='Player unavailable';return}shakaPlayer=ui.getControls().getPlayer();shakaPlayer.addEventListener('error',()=>{statusEl.textContent='Stream unavailable';statusEl.className='text-danger'});if(pendingStream){const stream=pendingStream;pendingStream=null;loadStream(stream.url)}}document.addEventListener('shaka-ui-loaded',init);const countryPicker=document.getElementById('country-picker-toggle'),countryMenu=document.getElementById('country-picker-menu');if(countryPicker&&countryMenu){countryPicker.addEventListener('click',()=>{countryMenu.hidden=!countryMenu.hidden});countryMenu.addEventListener('click',event=>{const option=event.target.closest('.country-option');if(!option)return;const code=option.dataset.country,hidden=countryPicker.closest('form').querySelector('[name="country"]');hidden.value=code;countryPicker.querySelector('span').innerHTML=code?'<img src="https://flagcdn.com/20x15/'+code.toLowerCase()+'.png" alt="Country flag" width="20" height="15"> '+option.textContent.trim():'All countries';countryMenu.hidden=true});document.addEventListener('click',event=>{if(!countryPicker.contains(event.target)&&!countryMenu.contains(event.target))countryMenu.hidden=true})}async function loadPage(url,updateHistory=true){const channelList=document.getElementById('channel-list'),pagination=document.getElementById('pagination-container');channelList.setAttribute('aria-busy','true');try{const response=await fetch(url,{headers:{'X-Requested-With':'XMLHttpRequest'}});if(!response.ok)throw new Error('Page request failed');const documentFragment=new DOMParser().parseFromString(await response.text(),'text/html'),nextList=documentFragment.getElementById('channel-list'),nextPagination=documentFragment.getElementById('pagination-container');if(!nextList||!nextPagination)throw new Error('Missing page content');channelList.innerHTML=nextList.innerHTML;pagination.replaceWith(nextPagination);if(updateHistory)history.pushState({},'',url)}catch(error){console.error(error);location.href=url}finally{channelList.removeAttribute('aria-busy')}}document.addEventListener('click',event=>{const link=event.target.closest('#pagination-container a.page-link,#filter-form a.clear');if(!link)return;event.preventDefault();loadPage(link.href)});function playStream(url,name,id,program,scroll=true){titleEl.textContent=name;statusEl.textContent='Connecting to stream...';statusEl.className='text-info';updateProgram(program);sessionStorage.setItem('iptv-current-stream',JSON.stringify({url,name,id,program}));if(scroll)window.scrollTo({top:0,behavior:'smooth'});loadStream(url)}document.getElementById('filter-form').addEventListener('submit',event=>{event.preventDefault();const url=new URL(location.href);url.search=new URLSearchParams(new FormData(event.target));url.searchParams.set('page','1');loadPage(url.toString())});window.addEventListener('popstate',()=>loadPage(location.href,false));const saved=sessionStorage.getItem('iptv-current-stream');if(saved){try{const stream=JSON.parse(saved);if(stream.url&&stream.name)playStream(stream.url,stream.name,stream.id,stream.program||'',false)}catch(error){sessionStorage.removeItem('iptv-current-stream')}}`;
}

module.exports = async function handler(req, res) {
  const requestUrl = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  const params = requestUrl.searchParams;
  const [channels, streams, logos, countryData, categoryData, epg] = await Promise.all([
    readJson(`${API_ROOT}/channels.json`, 'channels.json'), readJson(`${API_ROOT}/streams.json`, 'streams.json'), readJson(`${API_ROOT}/logos.json`, 'logos.json'), readJson(`${API_ROOT}/countries.json`, 'countries.json'), readJson(`${API_ROOT}/categories.json`, 'categories.json'), readEpg()
  ]);
  const countryNames = Object.fromEntries(countryData.filter(item => item.code && item.name).map(item => [item.code.toUpperCase(), item.name]));
  const categoryNames = Object.fromEntries(categoryData.filter(item => item.id && item.name).map(item => [item.id, item.name]));
  const streamMap = streams.filter(item => item.channel && item.url).reduce((map, item) => {
    if (! map[item.channel]) map[item.channel] = [];
    map[item.channel].push(item.url);
    return map;
  }, {});
  const logoMap = {}; logos.filter(item => item.channel && item.url).forEach(item => { if (!logoMap[item.channel] || item.in_use) logoMap[item.channel] = item.url; });
  let playable = channels.filter(item => item.id && streamMap[item.id]).map(item => {
    const streamUrls = streamMap[item.id];
    const preferredUrl = [...streamUrls].sort((firstUrl, secondUrl) => {
      const firstPreferred = firstUrl.includes('streams.tangotv.in') ? 0 : 1;
      const secondPreferred = secondUrl.includes('streams.tangotv.in') ? 0 : 1;
      return firstPreferred - secondPreferred;
    })[0];
    return { ...item, stream_urls: streamUrls, stream_url: preferredUrl, logo: logoMap[item.id], program_name: epg.programs[item.id] || epg.byName[(item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')] || '' };
  });
  const allCountries = Object.fromEntries([...new Set(playable.map(item => (item.country || '').toUpperCase()).filter(Boolean))].sort().map(code => [code, countryNames[code] || code]));
  const allCategories = Object.fromEntries([...new Set(playable.flatMap(item => Array.isArray(item.categories) ? item.categories : [item.categories]).filter(Boolean))].sort().map(id => [id, categoryNames[id] || id]));
  const search = params.get('search') || '', country = (params.get('country') || '').toUpperCase(), category = params.get('category') || '';
  if (search) playable = playable.filter(item => (item.name || '').toLowerCase().includes(search.toLowerCase()));
  if (country) playable = playable.filter(item => (item.country || '').toUpperCase() === country);
  if (category) playable = playable.filter(item => (Array.isArray(item.categories) ? item.categories : [item.categories]).includes(category));
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1), totalPages = Math.ceil(playable.length / 48);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderPage({ channels: playable, countries: allCountries, categories: allCategories, countryNames, total: playable.length, page, totalPages, search, country, category }));
};