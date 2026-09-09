const fs=require('fs/promises');
const path=require('path');
const zlib=require('zlib');

const DATA_ROOT=path.join(__dirname,'..');
const CACHE_ROOT='/tmp/giptv-cache';
const M3U_URL='https://iptv-org.github.io/iptv/index.m3u';
const LOCAL_M3U_FILE=path.join(DATA_ROOT,'index_file.m3u');
const M3U_REFRESH_MS=6*60*60*1000;

async function readM3u(){
  try{
    const localStats=await fs.stat(LOCAL_M3U_FILE);
    const localContent=await fs.readFile(LOCAL_M3U_FILE,'utf8');

    if(Date.now()-localStats.mtimeMs<M3U_REFRESH_MS){
      return localContent;
    }
  }catch(_){ }

  try{
    const response=await fetch(M3U_URL,{headers:{'User-Agent':'Node-IPTV-App/1.0'}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);

    const data=await response.text();

    await fs.writeFile(LOCAL_M3U_FILE,data);

    return data;
  }catch(_){
    try{
      return await fs.readFile(LOCAL_M3U_FILE,'utf8');
    }catch(_){
      return '';
    }
  }
}

function splitExtinfLabel(line){
  let inQuotes=false;
  let quoteChar='';

  for(let index=0; index<line.length; index++){
    const char=line[index];

    if((char==='"'||char==="'") && (quoteChar==='' || char===quoteChar)){
      if(!inQuotes){
        inQuotes=true;
        quoteChar=char;
      }else{
        inQuotes=false;
        quoteChar='';
      }
      continue;
    }

    if(char===',' && !inQuotes){
      return line.slice(index+1).trim();
    }
  }

  return '';
}

function parseM3u(m3uContent){
  const channels=[];
  let currentChannel=null;

  for(const rawLine of String(m3uContent||'').split(/\r?\n/)){
    const line=rawLine.trim();

    if(!line)continue;

    if(line.startsWith('#EXTINF:')){
      const rawName=splitExtinfLabel(line);
      const qualityInfo=extractQualityFromName(rawName);

      const tvgId=attribute(line,'tvg-id')||'';
      const tvgCountry=attribute(line,'tvg-country')||'';

      currentChannel={
        id:tvgId||attribute(line,'tvg-name')||'',
        name:qualityInfo.name,
        logo:attribute(line,'tvg-logo')||'',
        categories:normalizeCategories(attribute(line,'group-title')),
        country:extractCountryFromTvgId(tvgId,tvgCountry),
        stream_url:'',
        stream_urls:[],
        qualityBadge:qualityInfo.qualityBadge
      };
      continue;
    }

    if(line.startsWith('#EXTGRP:')){
      if(currentChannel){
        currentChannel.categories=
          normalizeCategories(
            line.slice('#EXTGRP:'.length).trim()
          );
      }
      continue;
    }

    if(line.startsWith('#'))continue;

    if(currentChannel){
      currentChannel.stream_url=line;
      currentChannel.stream_urls=[line];
      channels.push(currentChannel);
      currentChannel=null;
    }
  }

  return channels.filter(item=>item.name&&item.stream_url);
}

function extractQualityFromName(name) {
  const normalizedName = String(name || '').trim();

  const qualityMatch = normalizedName.match(/\((\d{3,4}[pi])\)/i);

  if (!qualityMatch) {
    return {
      name: normalizedName
        .replace(/\s*\[[^\]]+\]\s*$/g, '')
        .trim(),
      qualityBadge: ''
    };
  }

  const quality = qualityMatch[1].toLowerCase();

  const qualityBadge = (
    /1080p/i.test(quality) ? 'FHD' :
    /720p/i.test(quality)  ? 'HD'  :
    /(576p|480p|576i)/i.test(quality) ? 'SD' :
    quality.toUpperCase()
  );

  const baseName = normalizedName
    .replace(
      new RegExp(`\\s*\\(${qualityMatch[1]}\\)`, 'i'),
      ''
    )
    .replace(/\s*\[[^\]]+\]\s*$/g, '')
    .trim();

  return {
    name: baseName,
    qualityBadge
  };
}

function normalizeCategories(value){
  const categories=
    String(value||'')
      .split(';')
      .map(item=>item.trim())
      .filter(Boolean);

  return categories.length?categories:['Undefined'];
}

function extractCountryFromTvgId(value,fallbackValue=''){
  const explicitCountry=String(fallbackValue||'').trim();

  if(explicitCountry){
    return explicitCountry.toUpperCase();
  }

  const tvgId=String(value||'').trim();
  const match=tvgId.match(/\.([a-z]{2})(?:@|$)/i);

  return match?.[1]?.toUpperCase()||'';
}

async function readEpg(){
  const cacheFile=path.join(CACHE_ROOT,'epg.xml');
  let xml;

  try{
    const cached=await fs.readFile(cacheFile,'utf8');
    const stat=await fs.stat(cacheFile);
    if(Date.now()-stat.mtimeMs<6*60*60*1000)xml=cached;
  }catch(_){}

  if(!xml){
    try{
      const response=await fetch('https://avkb.short.gy/epg.xml.gz',{
        headers:{'User-Agent':'Node-IPTV-App/1.0'}
      });
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      xml=zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
      await fs.mkdir(CACHE_ROOT,{recursive:true});
      await fs.writeFile(cacheFile,xml);
    }catch(_){
      try{
        xml=await fs.readFile(path.join(DATA_ROOT,'epg.xml'),'utf8');
      }catch(_){
        return {};
      }
    }
  }

  const programs={};
  const latest={};

  for(const match of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi)){
    const attrs=match[1];
    const body=match[2];
    const channel=attribute(attrs,'channel');
    const start=Date.parse(epgDate(attribute(attrs,'start')));
    const stop=Date.parse(epgDate(attribute(attrs,'stop')));
    const title=textContent(
      body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''
    );

    if(!channel||!title||Number.isNaN(stop))continue;

    if(start<=Date.now()&&stop>Date.now())programs[channel]=title;

    if(!latest[channel]||stop>latest[channel].stop){
      latest[channel]={title,stop};
    }
  }

  const byName={};

  for(const match of xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi)){
    const id=attribute(match[1],'id');
    const name=textContent(
      match[2].match(/<display-name\b[^>]*>([\s\S]*?)<\/display-name>/i)?.[1]||''
    );
    const key=name.toLowerCase().replace(/[^a-z0-9]/g,'');

    if(name&&id&&(programs[id]||latest[id])){
      byName[key]=programs[id]||latest[id].title;
    }
  }

  return{programs,byName};
}

function attribute(source,name){
  return source.match(
    new RegExp(`${name}=["']([^"']*)["']`,'i')
  )?.[1]||'';
}

function epgDate(value){
  return value.replace(
    /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})/,
    '$1-$2-$3T$4:$5:$6$7'
  );
}

function textContent(value){
  return value
    .replace(/<[^>]+>/g,'')
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .trim();
}

function escapeHtml(value,attributeValue=false){
  return String(value??'').replace(
    /[&<>"']/g,
    char=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":attributeValue?'&#039;':'&#39;'
    }[char])
  );
}

function countryFlag(code){
  if(!/^[a-z]{2}$/i.test(code))return '';

  return String.fromCodePoint(
    ...code.toUpperCase()
      .split('')
      .map(char=>char.charCodeAt(0)+127397)
  );
}

function categoryIcon(categoryName){
  const name=String(categoryName||'').toLowerCase();

  const icons=[
    [/news|current affairs/,'📰'],
    [/sport|football|cricket|tennis/,'🏆'],
    [/movie|film|cinema|series/,'🎬'],
    [/music|radio/,'🎵'],
    [/auto/,'🚗'],
    [/culture/,'🤲'],
    [/family/,'👨‍👩‍👧‍👦'],
    [/outdoor|adventure|relax|nature/,'🏕️'],
    [/lifestyle|health|fitness/,'💪'],
    [/kid|children|cartoon/,'🧸'],
    [/entertainment|comedy/,'🎭'],
    [/documentary|nature|wildlife/,'🌿'],
    [/shop/,'🛒'],
    [/animation|anime/,'🎨'],
    [/legislative/,'🏛️'],
    [/public|government/,'🏢'],
    [/cooking|food|culinary/,'🍳'],
    [/religious|religion/,'🙏'],
    [/business|finance/,'💼'],
    [/science|technology/,'🔬'],
    [/weather/,'🌤️'],
    [/shopping/,'🛍️'],
    [/travel/,'✈️'],
    [/series|drama/,'📺'],
    [/education|educational/,'🎓']
  ];

  return icons.find(([pattern])=>pattern.test(name))?.[1]||'📺';
}

function createPlaceholderUrl(channelName){
  const name=String(channelName||'Unknown').trim();

  /*
   * Short names:
   * Sony Yay! -> Sony+Yay!
   *
   * Longer names:
   * Manoranjan Prime -> Manoranjan%0APrime
   */
  const separator=name.length>15?'%0A':'+';

  const text=encodeURIComponent(name)
    .replace(/%20/g,separator);

  return `https://placehold.co/150x80/080b10/EFEFEF?font=montserrat&text=${text}`;
}

function queryUrl(req,params={}){
  const url=new URL(
    req.url||'/',
    `https://${req.headers.host||'localhost'}`
  );

  Object.entries(params).forEach(([key,value])=>{
    url.searchParams.set(key,value);
  });

  return `${url.pathname}${url.search}`;
}

function renderPage({
  channels,
  countries,
  categories,
  countryNames,
  total,
  page,
  totalPages,
  search,
  country,
  category
}){
  const pageChannels=channels.slice(
    (page-1)*48,
    page*48
  );

  const cards=pageChannels.length
    ?pageChannels.map(channel=>{
        const countryCode=(channel.country||'').toUpperCase();

        const flagMarkup=/^[A-Z]{2}$/.test(countryCode)
          ?`<img src="https://flagcdn.com/20x15/${countryCode.toLowerCase()}.png"
                alt="${escapeHtml(countryFlag(countryCode),true)} flag"
                width="20"
                height="15"
                loading="lazy">`
          :'';

        const placeholderUrl=createPlaceholderUrl(channel.name);
        const logoUrl=channel.logo||placeholderUrl;
        const qualityBadge=channel.qualityBadge
          ?`<div class="channel-quality-badge">${escapeHtml(channel.qualityBadge)}</div>`
          :'';

        const categoriesMarkup=(
          Array.isArray(channel.categories)
            ?channel.categories
            :channel.categories?[channel.categories]:[]
        )
          .slice(0,2)
          .map(id=>{
            const name=categories[id]||id;
            return `<span class="channel-category">${categoryIcon(name)} ${escapeHtml(name)}</span>`;
          })
          .join('');

        return `
        <div class="col-6 col-sm-4 col-md-3">
          <div
            class="channel-card"
            onclick='playStream(...${escapeHtml(
              JSON.stringify([
                channel.stream_url,
                channel.name,
                channel.id,
                channel.program_name||''
              ]),
              true
            )})'
          >

            <div class="channel-logo-wrap">
              <img
                src="${escapeHtml(logoUrl,true)}"
                class="channel-logo"
                alt="${escapeHtml(channel.name,true)}"
                loading="lazy"
                onerror="this.onerror=null;this.src='${placeholderUrl}'"
              >

              ${qualityBadge}

              <div class="channel-play">
                <span>▶</span>
              </div>
            </div>

            <div class="channel-info">

              <div
                class="channel-name text-center"
                title="${escapeHtml(channel.name,true)}"
              >
                ${escapeHtml(channel.name)}
              </div>

              <div class="channel-meta">
                ${flagMarkup}
                <span>
                  ${escapeHtml(
                    countryNames[countryCode]||
                    countryCode||
                    'Unknown'
                  )}
                </span>
              </div>

              ${categoriesMarkup
                ?`<div class="channel-tags">${categoriesMarkup}</div>`
                :''}

            </div>

          </div>
        </div>`;
      }).join('')
    :`
      <div class="col-12">
        <div class="empty-state">
          <div class="empty-icon">📺</div>
          <h4>No channels found</h4>
          <p>Try changing your search or filters.</p>
        </div>
      </div>`;

  const pageLinks=totalPages>1
    ?`
      <nav class="mt-5">
        <ul class="pagination">

          ${
            page>1
              ?`
                <li class="page-item">
                  <a
                    class="page-link"
                    href="${queryUrl(
                      {url:'/',headers:{}},
                      {page:page-1,search,country,category}
                    )}"
                  >
                    ‹
                  </a>
                </li>
              `
              :''
          }

          ${
            Array.from(
              {length:totalPages},
              (_,index)=>index+1
            )
            .filter(number=>
              number>=Math.max(1,page-2)&&
              number<=Math.min(totalPages,page+2)
            )
            .map(number=>
              `
              <li class="page-item ${number===page?'active':''}">
                <a
                  class="page-link"
                  href="${queryUrl(
                    {url:'/',headers:{}},
                    {page:number,search,country,category}
                  )}"
                >
                  ${number}
                </a>
              </li>
              `
            ).join('')
          }

          ${
            page<totalPages
              ?`
                <li class="page-item">
                  <a
                    class="page-link"
                    href="${queryUrl(
                      {url:'/',headers:{}},
                      {page:page+1,search,country,category}
                    )}"
                  >
                    ›
                  </a>
                </li>
              `
              :''
          }

        </ul>
      </nav>
    `
    :'';

  const selectedCountryName=
    country
      ?countries[country]||country
      :'All countries';

  const selectedCategoryName=
    category
      ?categories[category]||category
      :'All categories';

  const countryPickerOptions=
    Object.entries(countries)
      .map(([code,name])=>
        `
        <button
          type="button"
          class="country-option"
          data-country="${escapeHtml(code,true)}"
        >
          <img
            src="https://flagcdn.com/20x15/${code.toLowerCase()}.png"
            alt="${escapeHtml(countryFlag(code),true)} flag"
            width="20"
            height="15"
            loading="lazy"
          >
          ${escapeHtml(name)}
        </button>
        `
      )
      .join('');

  const categoryPickerOptions=
    Object.entries(categories)
      .map(([id,name])=>
        `
        <button
          type="button"
          class="country-option"
          data-category="${escapeHtml(id,true)}"
        >
          ${categoryIcon(name)} ${escapeHtml(name)}
        </button>
        `
      )
      .join('');

  return `
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<title>Global IPTV</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/shaka-player@4.15.5/dist/controls.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Doppio+One&display=swap" rel="stylesheet">
<script src="https://unpkg.com/shaka-player@4.15.5/dist/shaka-player.ui.js"></script>

<style>
${styles()}
</style>

</head>

<body>

<div class="ambient ambient-one"></div>
<div class="ambient ambient-two"></div>

<div class="container-fluid main-container">

  <!-- HEADER -->

  <header class="top-header">

    <div class="brand-area flex-grow-1">

      <div class="brand-logo">
      <a href="/" aria-label="Global IPTV Home">
        <img src="gtv-logo.svg" alt="GTV">
      </a>
      </div>

      <div>
        <h1 class="doppio-one-regular">Global IPTV</h1>
        <p>
          Live television from around the world
        </p>
      </div>

    </div>

    <div class="channel-count">
      <strong>${total.toLocaleString()}</strong>
      <span>Live Channels</span>
    </div>

    <div class="header-actions">
      <a
        href="https://github.com/babai93/giptv"
        class="header-action"
        title="GitHub"
        aria-label="GitHub"
        target="_blank"
        rel="noreferrer"
      >
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg" alt="GitHub" width="20" height="20">
      </a>
    </div>

  </header>


  <!-- FILTER BAR -->

  <section class="filter-panel">

    <form id="filter-form">

      <div class="search-box">

        <span class="search-icon">⌕</span>

        <input
          type="text"
          name="search"
          class="modern-input"
          placeholder="Search channels..."
          value="${escapeHtml(search,true)}"
          autocomplete="off"
        >

      </div>


      <div class="country-picker">

        <input
          type="hidden"
          name="country"
          value="${escapeHtml(country,true)}"
        >

        <button
          type="button"
          id="country-picker-toggle"
          class="filter-control"
        >

          <span>

            ${
              country
                ?`
                  <img
                    src="https://flagcdn.com/20x15/${country.toLowerCase()}.png"
                    alt="${escapeHtml(countryFlag(country),true)} flag"
                    width="20"
                    height="15"
                  >
                `
                :''
            }

            ${escapeHtml(selectedCountryName)}

          </span>

          <span>🔻</span>

        </button>


        <div
          id="country-picker-menu"
          class="country-picker-menu"
          hidden
        >

          <button
            type="button"
            class="country-option"
            data-country=""
          >
            🌎 All countries
          </button>

          ${countryPickerOptions}

        </div>

      </div>


      <div class="category-picker">

        <input
          type="hidden"
          name="category"
          value="${escapeHtml(category,true)}"
        >

        <button
          type="button"
          id="category-picker-toggle"
          class="filter-control"
        >

          <span>
            ${category
              ?`${categoryIcon(categories[category]||category)} ${escapeHtml(categories[category]||category)}`
              :'📺 All categories'
            }
          </span>

          <span>🔻</span>

        </button>

        <div
          id="category-picker-menu"
          class="country-picker-menu"
          hidden
        >

          <button
            type="button"
            class="country-option"
            data-category=""
          >
            📺 All categories
          </button>

          ${categoryPickerOptions}

        </div>

      </div>

      <button
        class="search-button"
        type="submit"
      >
        Search
      </button>


      ${
        search||country||category
          ?`
            <a
              href="/"
              class="clear-button"
              onclick="
                const form=this.closest('form');
                form.elements.search.value='';
                form.elements.country.value='';
                form.elements.category.value='';
                const countryToggle=form.querySelector('#country-picker-toggle span');
                const categoryToggle=form.querySelector('#category-picker-toggle span');

                if(countryToggle)
                  countryToggle.innerHTML='🌎 All countries';

                if(categoryToggle)
                  categoryToggle.innerHTML='📺 All categories';

                form.elements.country.value='';
                form.elements.category.value='';
              "
            >
              Clear
            </a>
          `
          :''
      }

    </form>

  </section>


  <!-- MAIN CONTENT -->

  <main>

    <div class="row gx-4">

      <!-- PLAYER -->

      <div class="col-lg-5 mb-4">

        <div id="player-wrapper">

          <div
            data-shaka-player-container
            shaka-controls="true"
          >

            <video
              data-shaka-player
              id="video-player"
              autoplay
            ></video>

          </div>


          <div class="p-3 player-meta">

            <div
              class="d-flex align-items-center justify-content-between gap-2"
            >

              <div class="now-playing-info">

                <span class="now-label">
                  NOW PLAYING
                </span>

                <h5
                  id="now-playing-title"
                  class="m-0 text-truncate"
                  title="Select a channel to play"
                >
                  Select a channel to play
                </h5>

              </div>


              <small
                id="now-playing-status"
                class="text-muted status-text"
              >
                Waiting...
              </small>

            </div>


            <div
              id="now-playing-program"
              class="small text-light text-truncate mt-2"
              aria-live="polite"
            ></div>

          </div>

        </div>

      </div>


      <!-- CHANNEL GRID -->

      <div class="col-lg-7">

        <div class="section-heading">

          <div>

            <span class="section-kicker">
              LIVE TV
            </span>

            <h2>
              ${
                search
                  ?`Search results for "${escapeHtml(search)}"`
                  :country
                    ?escapeHtml(selectedCountryName)
                    :category
                      ?escapeHtml(categories[category]||category)
                      :'Explore Channels'
              }
            </h2>

          </div>

          <span class="result-count">
            ${total.toLocaleString()} channels
          </span>

        </div>


        <div
          id="channel-list"
          class="row g-3"
        >
          ${cards}
        </div>


        <div id="pagination-container">
          ${pageLinks}
        </div>

      </div>

    </div>

  </main>

</div>


<script>
${clientScript()}
</script>

</body>

</html>`;
}


function styles(){

return `

:root{
  --bg:#07090d;
  --panel:#10141b;
  --panel2:#151a22;
  --border:rgba(255,255,255,.09);
  --text:#f5f7fa;
  --muted:#8d96a3;
  --accent:#e51b23;
  --accent2:#ff3440;
  --success:#24d17e;
}

*{
  box-sizing:border-box;
}

html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  min-height:100vh;
  overflow-x:hidden;
  color:var(--text);
  background:
    radial-gradient(
      circle at 75% 5%,
      rgba(229,27,35,.10),
      transparent 28%
    ),
    radial-gradient(
      circle at 10% 50%,
      rgba(255,255,255,.025),
      transparent 25%
    ),
    var(--bg);
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.doppio-one-regular {
  font-family: "Doppio One", sans-serif;
  font-weight: 400;
  font-style: normal;
}

.ambient{
  position:fixed;
  pointer-events:none;
  filter:blur(100px);
  opacity:.16;
  z-index:0;
}

.ambient-one{
  width:300px;
  height:300px;
  background:#e51b23;
  top:-150px;
  right:10%;
}

.ambient-two{
  width:250px;
  height:250px;
  background:#6d28d9;
  bottom:-100px;
  left:5%;
}

.main-container{
  position:relative;
  z-index:1;
  max-width:1600px;
  margin:auto;
  padding:26px 30px 60px;
}


/* HEADER */

.top-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
  padding:8px 4px 24px;
}

.header-actions{
  display:flex;
  align-items:center;
  gap:10px;
}

.header-action{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:42px;
  height:38px;
  padding:0 12px;
  border:1px solid var(--border);
  border-radius:12px;
  background:rgba(255,255,255,.03);
  color:var(--text);
  text-decoration:none;
  font-weight:600;
  transition:transform .2s ease, border-color .2s ease, background .2s ease;
}

.header-action img {
  filter: brightness(0) invert(1); /* makes it white */
}

.header-action:hover{
  transform:translateY(-1px);
  border-color:rgba(255,255,255,.18);
  background:rgba(255,255,255,.06);
}

.brand-area{
  display:flex;
  align-items:center;
  gap:14px;
}

.brand-logo{
  width:48px;
  height:48px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:14px;
  background:
    linear-gradient(
      145deg,
      rgba(255,255,255,.12),
      rgba(255,255,255,.025)
    );
  border:1px solid var(--border);
  box-shadow:0 10px 35px rgba(0,0,0,.35);
  overflow:hidden;
}

.brand-logo img{
  width:36px;
  height:auto;
}

.brand-area h1{
  margin:0;
  font-size:1.55rem;
  font-weight:750;
  letter-spacing:-.04em;
}

.brand-area p{
  margin:3px 0 0;
  color:var(--muted);
  font-size:.78rem;
}

.channel-count{
  display:flex;
  flex-direction:column;
  align-items:flex-end;
}

.channel-count strong{
  font-size:1.2rem;
  font-weight:750;
}

.channel-count span{
  color:var(--muted);
  font-size:.7rem;
  text-transform:uppercase;
  letter-spacing:.08em;
}

/* FILTER */

.filter-panel{
  position:relative;
  z-index:30;
  margin-bottom:28px;
  padding:10px;
  border:1px solid var(--border);
  border-radius:17px;
  background:rgba(17,21,28,.82);
  box-shadow:
    0 15px 50px rgba(0,0,0,.25);
  backdrop-filter:blur(25px);
}

.filter-panel form{
  display:flex;
  gap:8px;
  align-items:stretch;
}

.search-box{
  position:relative;
  flex:2 1 280px;
}

.search-icon{
  position:absolute;
  left:15px;
  top:50%;
  transform:translateY(-50%);
  color:#9da5b1;
  font-size:20px;
  pointer-events:none;
}

.modern-input,
.filter-control{
  width:100%;
  min-height:44px;
  border:1px solid rgba(255,255,255,.07);
  outline:none;
  color:#fff;
  background:#ffffff08;
  transition:.2s ease;
}

.modern-input{
  padding:0 15px 0 43px;
  border-radius:11px;
}

.modern-input::placeholder{
  color:#737d89;
}

.modern-input:focus,
.filter-control:focus{
  border-color:rgba(229,27,35,.65);
  background:#ffffff0d;
  box-shadow:0 0 0 3px rgba(229,27,35,.08);
}

.country-picker{
  position:relative;
  flex:1 1 180px;
  min-width:0;
}

.filter-control{
  padding:0 13px;
  border-radius:11px;
  text-align:left;
}

button.filter-control{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}

.filter-control span:first-child{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.filter-control img{
  vertical-align:middle;
  margin-right:5px;
}

.category-picker{
  position:relative;
  flex:1 1 180px;
  min-width:0;
}

.search-button{
  min-width:90px;
  padding:0 20px;
  border:0;
  border-radius:11px;
  color:#fff;
  background:
    linear-gradient(
      135deg,
      var(--accent),
      var(--accent2)
    );
  font-weight:700;
  transition:.2s ease;
  box-shadow:0 8px 25px rgba(229,27,35,.18);
}

.search-button:hover{
  transform:translateY(-1px);
  box-shadow:0 12px 30px rgba(229,27,35,.28);
}

.clear-button{
  display:flex;
  align-items:center;
  justify-content:center;
  padding:0 14px;
  color:#adb5c0;
  text-decoration:none;
  border:1px solid var(--border);
  border-radius:11px;
  font-size:.85rem;
  transition:.2s;
}

.clear-button:hover{
  color:#fff;
  background:#ffffff08;
}


/* COUNTRY MENU */

.country-picker-menu{
  position:absolute;
  top:calc(100% + 7px);
  left:0;
  min-width:230px;
  max-height:320px;
  overflow-y:auto;
  z-index:100;
  padding:6px;
  border:1px solid rgba(255,255,255,.10);
  border-radius:12px;
  background:#141920;
  box-shadow:
    0 20px 50px rgba(0,0,0,.55);
  backdrop-filter:blur(25px);
}

.country-option{
  display:block;
  width:100%;
  padding:9px 10px;
  border:0;
  border-radius:8px;
  color:#e9edf2;
  background:transparent;
  text-align:left;
  white-space:nowrap;
  transition:.15s;
}

.country-option:hover,
.country-option:focus{
  color:#fff;
  background:#ffffff0d;
}

.country-option img{
  vertical-align:middle;
  margin-right:5px;
}


/* PLAYER */

#player-wrapper{
  position:sticky;
  top:20px;
  z-index:2;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.10);
  border-radius:18px;
  background:#080a0e;
  box-shadow:
    0 25px 70px rgba(0,0,0,.50),
    0 0 0 1px rgba(255,255,255,.02);
}

#player-wrapper
[data-shaka-player-container]{
  position:relative;
  width:100%;
  background:#000;
  aspect-ratio:16/9;
}

#video-player{
  width:100%;
  height:100%;
  aspect-ratio:16/9;
  display:block;
  background:#000;
}

.player-meta{
  background:
    linear-gradient(
      180deg,
      #131820,
      #0d1117
    ) !important;
  border-top:1px solid rgba(255,255,255,.06);
}

.now-playing-info{
  min-width:0;
}

.now-label{
  display:block;
  margin-bottom:4px;
  color:#7e8793;
  font-size:.62rem;
  font-weight:800;
  letter-spacing:.12em;
}

#now-playing-title{
  display:block;
  color:#fff;
  font-size:1rem;
  font-weight:700;
}

#now-playing-status{
  padding:5px 10px;
  border-radius:20px;
  background:#ffffff08;
  font-size:.72rem;
  white-space:nowrap;
}

.live-status{
  display:inline-flex;
  align-items:center;
  gap:6px;
  color:var(--success)!important;
}

.live-status::before{
  content:'';
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--success);
  box-shadow:0 0 9px var(--success);
  animation:liveBlink 2s infinite;
}

@keyframes liveBlink{
  0%,100%{
    opacity:1;
    box-shadow:0 0 10px var(--success);
  }
  50%{
    opacity:.25;
    box-shadow:0 0 2px var(--success);
  }
}

#now-playing-program{
  min-height:18px;
  color:#b9c1cb!important;
}

.player-footer{
  display:flex;
  justify-content:space-between;
  margin-top:12px;
  padding-top:10px;
  border-top:1px solid rgba(255,255,255,.06);
  color:#6f7885;
  font-size:.66rem;
  text-transform:uppercase;
  letter-spacing:.07em;
}

.player-footer i{
  display:inline-block;
  width:5px;
  height:5px;
  margin-right:5px;
  border-radius:50%;
  background:var(--success);
}


/* SHAKA */

#player-wrapper
.shaka-controls-container{
  font-family:inherit;
}

#player-wrapper
.shaka-bottom-controls{
  padding:0 12px 10px;
}

#player-wrapper
.shaka-overflow-menu,
#player-wrapper
.shaka-settings-menu{
  border-radius:12px;
  overflow:hidden;
}


/* SECTION */

.section-heading{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:20px;
  margin:5px 2px 18px;
}

.section-kicker{
  display:block;
  margin-bottom:4px;
  color:#707a87;
  font-size:.65rem;
  font-weight:800;
  letter-spacing:.13em;
}

.section-heading h2{
  margin:0;
  color:#fff;
  font-size:1.35rem;
  font-weight:750;
  letter-spacing:-.03em;
}

.result-count{
  color:#6f7885;
  font-size:.72rem;
}


/* CHANNEL CARDS */

.channel-card{
  height:100%;
  overflow:hidden;
  cursor:pointer;
  border:1px solid rgba(255,255,255,.075);
  border-radius:14px;
  background:
    linear-gradient(
      145deg,
      rgba(25,30,38,.96),
      rgba(14,18,24,.96)
    );
  box-shadow:0 8px 25px rgba(0,0,0,.20);
  transition:
    transform .22s ease,
    border-color .22s ease,
    box-shadow .22s ease,
    background .22s ease;
}

.channel-card:hover{
  transform:translateY(-4px);
  border-color:rgba(229,27,35,.42);
  background:
    linear-gradient(
      145deg,
      rgba(34,39,48,.98),
      rgba(16,20,27,.98)
    );
  box-shadow:
    0 16px 35px rgba(0,0,0,.38),
    0 0 25px rgba(229,27,35,.06);
}

.channel-card:active{
  transform:translateY(-1px);
}

.channel-logo-wrap{
  position:relative;
  height:105px;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:13px;
  overflow:hidden;
  background:
    radial-gradient(
      circle at center,
      rgba(255,255,255,.07),
      transparent 65%
    ),
    #080a0e;
}

.channel-logo{
  width:100%;
  height:100%;
  object-fit:contain;
  transition:transform .25s ease;
}

.channel-quality-badge{
  position:absolute;
  top:8px;
  right:8px;
  z-index:2;
  padding:2px 7px;
  border-radius:8px;
  background:rgb(92 0 4);
  color:#fff;
  font-size:.62rem;
  font-weight:800;
  letter-spacing:.04em;
  text-transform:uppercase;
  box-shadow:0 6px 14px rgba(0,0,0,.28);
  pointer-events:none;
}

.channel-card:hover .channel-logo{
  transform:scale(1.045);
}

.channel-play{
  position:absolute;
  right:9px;
  bottom:8px;
  width:29px;
  height:29px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:50%;
  color:#fff;
  background:rgba(229,27,35,.92);
  box-shadow:0 5px 15px rgba(0,0,0,.45);
  opacity:0;
  transform:scale(.75);
  transition:.2s ease;
}

.channel-card:hover .channel-play{
  opacity:1;
  transform:scale(1);
}

.channel-play span{
  margin-left:2px;
  font-size:11px;
}

.channel-info{
  padding:11px 12px 12px;
}

.channel-name{
  overflow:hidden;
  margin-bottom:6px;
  color:#f4f6f8;
  font-size:.84rem;
  font-weight:700;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.channel-meta{
  display:flex;
  align-items:center;
  gap:5px;
  min-width:0;
  overflow:hidden;
  color:#798390;
  font-size:.68rem;
  white-space:nowrap;
  justify-content: center;
}

.channel-meta span{
  overflow:hidden;
  text-overflow:ellipsis;
}

.channel-tags{
  display:flex;
  gap:4px;
  overflow:hidden;
  margin-top:8px;
  justify-content: center;
}

.channel-category{
  max-width:100%;
  padding:3px 6px;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.06);
  border-radius:5px;
  color:#737d89;
  background:#ffffff04;
  font-size:.57rem;
  text-overflow:ellipsis;
  white-space:nowrap;
}


/* EMPTY */

.empty-state{
  padding:70px 20px;
  text-align:center;
  border:1px dashed rgba(255,255,255,.10);
  border-radius:16px;
  background:#ffffff03;
}

.empty-icon{
  margin-bottom:10px;
  font-size:38px;
  opacity:.6;
}

.empty-state h4{
  font-size:1rem;
}

.empty-state p{
  margin:0;
  color:#727c89;
  font-size:.8rem;
}


/* PAGINATION */

.pagination{
  justify-content:center;
  gap:5px;
}

.page-link{
  min-width:36px;
  border:1px solid var(--border);
  border-radius:9px!important;
  color:#aab2bd;
  background:#ffffff04;
  text-align:center;
}

.page-link:hover{
  color:#fff;
  background:#ffffff0b;
  border-color:rgba(229,27,35,.3);
}

.page-item.active .page-link{
  color:#fff;
  border-color:var(--accent);
  background:var(--accent);
  box-shadow:0 5px 20px rgba(229,27,35,.2);
}


/* MOBILE */

@media(max-width:991px){

  #player-wrapper{
    position:relative;
    top:0;
  }

  .section-heading{
    margin-top:10px;
  }

}

@media(max-width:768px){

  .main-container{
    padding:15px 12px 40px;
  }

  .top-header{
    padding-bottom:17px;
  }

  .brand-area h1{
    font-size:1.25rem;
  }

  .brand-area p{
    font-size:.68rem;
  }

  .channel-count{
    display:none;
  }

  .filter-panel{
    padding:8px;
  }

  .filter-panel form{
    flex-wrap:wrap;
  }

  .search-box,
  .country-picker,
  .category-picker,
  .search-button,
  .clear-button{
    flex:1 1 100%;
    width:100%;
  }

  .search-button,
  .clear-button{
    min-height:43px;
  }

  .channel-logo-wrap{
    height:85px;
  }

  .channel-info{
    padding:9px;
  }

  .channel-name{
    font-size:.76rem;
  }

  .channel-category{
    display:none;
  }

  .section-heading h2{
    font-size:1.1rem;
  }

}

@media(max-width:420px){

  .brand-logo{
    width:42px;
    height:42px;
  }

  .brand-logo img{
    width:31px;
  }

  .channel-logo-wrap{
    height:78px;
  }

  .channel-card{
    border-radius:11px;
  }

}

`;
}


function clientScript(){

return `

const video=document.getElementById('video-player');

const titleEl=
  document.getElementById('now-playing-title');

const statusEl=
  document.getElementById('now-playing-status');

const programEl=
  document.getElementById('now-playing-program');

let shakaPlayer;
let pendingStream;


function updateProgram(name){
  programEl.textContent=
    name?'Now playing: '+name:'';
}


async function loadStream(url){

  if(!shakaPlayer){
    pendingStream={url};
    return;
  }

  try{

    statusEl.textContent='Connecting...';
    statusEl.className='text-info';

    await shakaPlayer.load(url);

    statusEl.textContent='Live';
    statusEl.className=
      'text-success live-status';

  }catch(error){

    console.error(error);

    statusEl.textContent='Stream unavailable';
    statusEl.className='text-danger';

  }

}


async function init(){

  const ui=video.ui;

  if(!ui){

    statusEl.textContent='Player unavailable';
    return;

  }

  shakaPlayer=
    ui.getControls().getPlayer();

  shakaPlayer.addEventListener(
    'error',
    ()=>{
      statusEl.textContent=
        'Stream unavailable';

      statusEl.className=
        'text-danger';
    }
  );

  if(pendingStream){

    const stream=pendingStream;

    pendingStream=null;

    loadStream(stream.url);

  }

}


document.addEventListener(
  'shaka-ui-loaded',
  init
);


/* COUNTRY PICKER */

const countryPicker=
  document.getElementById(
    'country-picker-toggle'
  );

const countryMenu=
  document.getElementById(
    'country-picker-menu'
  );


if(countryPicker&&countryMenu){

  countryPicker.addEventListener(
    'click',
    ()=>{
      countryMenu.hidden=
        !countryMenu.hidden;
    }
  );


  countryMenu.addEventListener(
    'click',
    event=>{

      const option=
        event.target.closest(
          '.country-option'
        );

      if(!option)return;

      const code=
        option.dataset.country;

      const form=
        countryPicker.closest('form');

      const hidden=
        form.querySelector(
          '[name="country"]'
        );

      hidden.value=code;

      countryPicker
        .querySelector('span')
        .innerHTML=
          code
            ?'<img src="https://flagcdn.com/20x15/'+
              code.toLowerCase()+
              '.png" alt="Country flag" width="20" height="15"> '+
              option.textContent.trim()
            :'🌎 All countries';

      countryMenu.hidden=true;

    }
  );


  document.addEventListener(
    'click',
    event=>{

      if(
        !countryPicker.contains(event.target)&&
        !countryMenu.contains(event.target)
      ){
        countryMenu.hidden=true;
      }

    }
  );

}


/* CATEGORY PICKER */

const categoryPicker=
  document.getElementById(
    'category-picker-toggle'
  );

const categoryMenu=
  document.getElementById(
    'category-picker-menu'
  );


if(categoryPicker&&categoryMenu){

  categoryPicker.addEventListener(
    'click',
    ()=>{
      categoryMenu.hidden=
        !categoryMenu.hidden;
    }
  );


  categoryMenu.addEventListener(
    'click',
    event=>{

      const option=
        event.target.closest(
          '.country-option'
        );

      if(!option)return;

      const categoryId=
        option.dataset.category||'';

      const form=
        categoryPicker.closest('form');

      const hidden=
        form.querySelector(
          '[name="category"]'
        );

      hidden.value=categoryId;

      categoryPicker
        .querySelector('span')
        .innerHTML=
          categoryId
            ?option.innerHTML
            :'📺 All categories';

      categoryMenu.hidden=true;

    }
  );


  document.addEventListener(
    'click',
    event=>{

      if(
        !categoryPicker.contains(event.target)&&
        !categoryMenu.contains(event.target)
      ){
        categoryMenu.hidden=true;
      }

    }
  );

}


/* AJAX PAGE LOADING */

async function loadPage(
  url,
  updateHistory=true
){

  const channelList=
    document.getElementById(
      'channel-list'
    );

  const pagination=
    document.getElementById(
      'pagination-container'
    );

  channelList.setAttribute(
    'aria-busy',
    'true'
  );

  try{

    const response=
      await fetch(
        url,
        {
          headers:{
            'X-Requested-With':
              'XMLHttpRequest'
          }
        }
      );

    if(!response.ok)
      throw new Error(
        'Page request failed'
      );

    const documentFragment=
      new DOMParser()
        .parseFromString(
          await response.text(),
          'text/html'
        );

    const nextList=
      documentFragment
        .getElementById(
          'channel-list'
        );

    const nextPagination=
      documentFragment
        .getElementById(
          'pagination-container'
        );

    const nextChannelCount=
      documentFragment
        .querySelector(
          '.channel-count'
        );

    const nextResultCount=
      documentFragment
        .querySelector(
          '.result-count'
        );

    const nextSectionTitle=
      documentFragment
        .querySelector(
          '.section-heading h2'
        );

    const currentChannelCount=
      document.querySelector(
        '.channel-count'
      );

    const currentResultCount=
      document.querySelector(
        '.result-count'
      );

    const currentSectionTitle=
      document.querySelector(
        '.section-heading h2'
      );

    const currentClearButton=
      document.querySelector(
        '#filter-form .clear-button'
      );

    const nextClearButton=
      documentFragment.querySelector(
        '#filter-form .clear-button'
      );

    if(!nextList||!nextPagination)
      throw new Error(
        'Missing page content'
      );

    channelList.innerHTML=
      nextList.innerHTML;

    pagination.replaceWith(
      nextPagination
    );

    if(nextChannelCount&&currentChannelCount)
      currentChannelCount.innerHTML=
        nextChannelCount.innerHTML;

    if(nextResultCount&&currentResultCount)
      currentResultCount.textContent=
        nextResultCount.textContent;

    if(nextSectionTitle&&currentSectionTitle)
      currentSectionTitle.textContent=
        nextSectionTitle.textContent;

    if(currentClearButton&&!nextClearButton)
      currentClearButton.remove();
    else if(!currentClearButton&&nextClearButton)
      document
        .getElementById('filter-form')
        .append(nextClearButton);

    if(updateHistory)
      history.pushState(
        {},
        '',
        url
      );

    window.scrollTo({
      top:0,
      behavior:'smooth'
    });

  }catch(error){

    console.error(error);

    location.href=url;

  }finally{

    channelList.removeAttribute(
      'aria-busy'
    );

  }

}


/* PAGINATION */

document.addEventListener(
  'click',
  event=>{

    const link=
      event.target.closest(
        '#pagination-container a.page-link,#filter-form a.clear'
      );

    if(!link)return;

    event.preventDefault();

    loadPage(link.href);

  }
);


/* PLAY CHANNEL */

function playStream(
  url,
  name,
  id,
  program,
  scroll=true
){

  const cleanedName=
    String(name||'')
      .replace(/\s*\((\d{3,4}[pi])\)(?:\s*\[[^\]]+\])*\s*$/i, '')
      .trim();

  titleEl.textContent=cleanedName;
  titleEl.title=cleanedName;

  statusEl.textContent=
    'Connecting...';

  statusEl.className=
    'text-info';

  updateProgram(program);

  sessionStorage.setItem(
    'iptv-current-stream',
    JSON.stringify({
      url,
      name:cleanedName,
      id,
      program
    })
  );

  if(scroll){

    window.scrollTo({
      top:0,
      behavior:'smooth'
    });

  }

  loadStream(url);

}


/* FILTER */

document
  .getElementById('filter-form')
  .addEventListener(
    'submit',
    event=>{

      event.preventDefault();

      const url=
        new URL(location.href);

      url.search=
        new URLSearchParams(
          new FormData(event.target)
        );

      url.searchParams.set(
        'page',
        '1'
      );

      loadPage(
        url.toString()
      );

    }
  );


/* BROWSER BACK/FORWARD */

window.addEventListener(
  'popstate',
  ()=>{
    loadPage(
      location.href,
      false
    );
  }
);


/* RESTORE LAST CHANNEL */

const saved=
  sessionStorage.getItem(
    'iptv-current-stream'
  );


if(saved){

  try{

    const stream=
      JSON.parse(saved);

    if(stream.url&&stream.name){

      playStream(
        stream.url,
        stream.name,
        stream.id,
        stream.program||'',
        false
      );

    }

  }catch(error){

    sessionStorage.removeItem(
      'iptv-current-stream'
    );

  }

}

`;
}


module.exports=async function handler(req,res){

  const requestUrl=
    new URL(
      req.url||'/',
      `https://${req.headers.host||'localhost'}`
    );


  if(requestUrl.pathname==='/gtv-logo.svg'){

    try{

      const logo=
        await fs.readFile(
          path.join(
            DATA_ROOT,
            'gtv-logo.svg'
          )
        );

      res.setHeader(
        'Content-Type',
        'image/svg+xml; charset=utf-8'
      );

      res.setHeader(
        'Cache-Control',
        'public, max-age=86400'
      );

      return res
        .status(200)
        .send(logo);

    }catch(_){

      return res
        .status(404)
        .send('Logo not found');

    }

  }


  const params=
    requestUrl.searchParams;


  const[
    m3uContent,
    epg
  ]=await Promise.all([
    readM3u(),
    readEpg()
  ]);


  const m3uChannels=
    parseM3u(m3uContent);


  const countryDisplayNames=
    new Intl.DisplayNames(
      ['en'],
      {type:'region'}
    );

  const countryNames=
    Object.fromEntries(
      [
        ...new Set(
          m3uChannels
            .map(item=>item.country)
            .filter(Boolean)
        )
      ]
      .sort()
      .map(code=>[
        code,
        countryDisplayNames.of(code)||code
      ])
    );


  let playable=
    m3uChannels
      .filter(
        item=>
          item.id&&
          item.stream_url
      )
      .map(item=>({

        ...item,

        stream_urls:
          item.stream_urls||[
            item.stream_url
          ],

        stream_url:
          item.stream_url,

        logo:
          item.logo||'',

        country:
          item.country||'IN',

        categories:
          Array.isArray(item.categories)
            ?item.categories
            :normalizeCategories(item.categories),

        program_name:
          epg.programs[item.id]||
          epg.byName[
            (item.name||'')
              .toLowerCase()
              .replace(
                /[^a-z0-9]/g,
                ''
              )
          ]||
          ''

      }));


  const allCountries=
    Object.fromEntries(

      [
        ...new Set(
          playable
            .map(
              item=>
                (item.country||'')
                  .toUpperCase()
            )
            .filter(Boolean)
        )
      ]
      .sort()
      .map(
        code=>[
          code,
          countryNames[code]||code
        ]
      )

    );


  const allCategories=
    Object.fromEntries(

      [
        ...new Set(

          playable
            .flatMap(
              item=>
                Array.isArray(item.categories)
                  ?item.categories
                  :item.categories
                    ?[item.categories]
                    :[]
            )
            .filter(Boolean)

        )
      ]
      .sort()
      .map(
        id=>[
          id,
          id
        ]
      )

    );


  const search=
    params.get('search')||'';

  const country=
    (
      params.get('country')||''
    ).toUpperCase();

  const category=
    params.get('category')||'';


  if(search){

    playable=
      playable.filter(
        item=>
          (item.name||'')
            .toLowerCase()
            .includes(
              search.toLowerCase()
            )
      );

  }


  if(country){

    playable=
      playable.filter(
        item=>
          (item.country||'')
            .toUpperCase()===
          country
      );

  }


  if(category){

    playable=
      playable.filter(
        item=>
          (
            Array.isArray(item.categories)
              ?item.categories
              :item.categories
                ?[item.categories]
                :[]
          ).includes(category)
      );

  }


  const page=
    Math.max(
      1,
      Number.parseInt(
        params.get('page')||'1',
        10
      )||1
    );


  const totalPages=
    Math.ceil(
      playable.length/48
    );


  res.setHeader(
    'Content-Type',
    'text/html; charset=utf-8'
  );


  res
    .status(200)
    .send(
      renderPage({
        channels:playable,
        countries:allCountries,
        categories:allCategories,
        countryNames,
        total:playable.length,
        page,
        totalPages,
        search,
        country,
        category
      })
    );

};