const fs = require('fs');
const now = Date.now();
console.log('NOW-LOCAL:', new Date().toString());
console.log('NOW-IST :', new Date(now).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

const CHANNEL_URL = 'https://jiotv.data.cdn.jio.com/apis/v3.0/getMobileChannelList/get/?os=android&devicetype=phone&usertype=tvYR7NSNn7rymo3F';
const EPG_URL = 'https://jiotv.data.cdn.jio.com/apis/v1.3/getepg/get?offset=%d&channel_id=%d';
const HEADERS = { 'User-Agent': 'okhttp/4.2.2' };

function ist(ms) {
  return new Date(Number(ms)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  // 1) Confirm B4U channels and channel 183 in Jio's live channel list
  const listData = await fetchJson(CHANNEL_URL);
  const channels = (listData.result || []).filter((c) => c && c.channel_id && c.channel_name);
  const b4u = channels.filter((c) => /b4u/i.test(c.channel_name));
  console.log('\n--- B4U channels in live Jio list ---');
  for (const c of b4u) console.log(`  id=${c.channel_id}  name="${c.channel_name}"`);
  const c183 = channels.find((c) => String(c.channel_id) === '183');
  console.log('  channel_id 183 =>', c183 ? `"${c183.channel_name}"` : 'NOT FOUND');

  // 2) Live EPG schedule for channel 183 (offset 0 = today, offset 1 = tomorrow)
  for (const offset of [0, 1]) {
    const data = await fetchJson(EPG_URL.replace('%d', String(offset)).replace('%d', '183'));
    const items = (data.epg || [])
      .map((i) => ({ show: String(i.showname || '').trim(), start: Number(i.startEpoch), end: Number(i.endEpoch) }))
      .filter((i) => i.show && i.start && i.end)
      .sort((a, b) => a.start - b.start);
    console.log(`\n--- Live Jio EPG (offset ${offset}) for channel 183 (B4U Music) ---`);
    for (const it of items) {
      const current = it.start <= now && it.end > now ? '  <== CURRENT' : '';
      console.log(`  ${ist(it.start)} -> ${ist(it.end)}  | ${it.show}${current}`);
    }
    const current = items.find((i) => i.start <= now && i.end > now);
    console.log('  JIO-SAYS-NOW:', current ? current.show : 'NONE');
  }

  // 3) Compare with cached jiotv-epg.json
  try {
    const cached = JSON.parse(fs.readFileSync('d:/Automation/giptv/.cache/jiotv-epg.json', 'utf8'));
    console.log('\n--- Cached jiotv-epg.json ---');
    console.log('  programs["183"] =', cached.programs && cached.programs['183']);
    console.log('  byName["b4umusic"] =', cached.byName && cached.byName.b4umusic);
    const stat = fs.statSync('d:/Automation/giptv/.cache/jiotv-epg.json');
    console.log('  cache mtime:', stat.mtime.toString(), `(${((now - stat.mtimeMs) / 3600000).toFixed(2)} hours old)`);
  } catch (e) {
    console.log('  cache read error:', e.message);
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
