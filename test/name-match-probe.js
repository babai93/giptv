const fs = require('fs');
const path = require('path');
process.chdir('d:/Automation/giptv');
const { fetchJioSchedulesByName, pickCurrentProgram, normalizeChannelName } = require('./api/data/jiotv-epg');
(async () => {
  const out = [];
  const names = ['9XM', '9XM India', '9XM TV', 'B4U Music'];
  for (const name of names) {
    try {
      const sch = await fetchJioSchedulesByName(name);
      const title = pickCurrentProgram(sch);
      out.push({ name, key: normalizeChannelName(name), n: sch.length, title: title || null });
    } catch (e) {
      out.push({ name, error: String(e && e.message || e) });
    }
  }
  fs.writeFileSync('d:/Automation/giptv/test/name-match-result.json', JSON.stringify(out, null, 2));
})().catch((e) => fs.writeFileSync('d:/Automation/giptv/test/name-match-result.json', JSON.stringify({ fatal: String(e) }, null, 2)));
