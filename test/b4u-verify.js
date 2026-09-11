const fs = require('fs');

const OUT = 'd:/Automation/giptv/test/b4u-verify-result.json';

async function main() {
  const { readEpg, resolveEpgProgram } = require('../api/data/epg');

  const epg = await readEpg();

  const results = {
    at: new Date().toString(),
    programsCount: Object.keys(epg.programs).length,
    jioSourcedPrograms: Object.values(epg.sources).filter((s) => s === 'jio').length
  };

  // The channel from the user's report (http://127.0.0.1:5001/play/183)
  results.b4uMusic = resolveEpgProgram(epg, { id: '183', name: 'B4U Music', country: 'IN' });

  // Regression references from test/epg-source.test.js
  results.cnbcPrime = resolveEpgProgram(epg, { id: 'cnbctv18prime.in@sd', name: 'CNBC TV18 Prime', country: 'IN' });

  // Cross-check against Jio's live EPG right now
  const now = Date.now();
  const res = await fetch(
    'https://jiotv.data.cdn.jio.com/apis/v1.3/getepg/get?offset=0&channel_id=183',
    { headers: { 'User-Agent': 'okhttp/4.2.2' } }
  );
  const data = await res.json();
  const live = (data.epg || [])
    .map((i) => ({ show: String(i.showname || '').trim(), start: Number(i.startEpoch), end: Number(i.endEpoch) }))
    .filter((i) => i.show && i.start <= now && i.end > now)[0];

  results.liveJioOnAirNow = live ? live.show : 'NONE';
  results.matchesLiveJio = Boolean(live) && live.show === results.b4uMusic.program;
  results.nextUpcoming = (data.epg || [])
    .map((i) => ({ show: String(i.showname || '').trim(), start: Number(i.startEpoch) }))
    .filter((i) => i.show && i.start > now)
    .sort((a, b) => a.start - b.start)[0] || null;

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch((err) => {
  fs.writeFileSync(OUT, JSON.stringify({ fatal: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
