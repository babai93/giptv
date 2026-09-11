const fs=require('fs');
process.chdir('d:/Automation/giptv');
const { resolveJioChannelId, normalizeChannelName, fetchJioSchedulesByName, pickCurrentProgram } = require('./api/data/jiotv-epg');
const index = require('./api/data/jiotv-channels.json');
const cases = ['9XM','9XM India','9XM TV','B4U Music','B4UMusic.in@India','Colors HD'];
const out = cases.map((name)=>({ name, key: normalizeChannelName(name), id: resolveJioChannelId(index, name) }));
fs.writeFileSync('d:/Automation/giptv/test/name-resolve.json', JSON.stringify(out,null,2));
(async()=>{
  const live=[];
  for (const name of ['9XM India','B4U Music']) {
    try {
      const sch = await fetchJioSchedulesByName(name);
      live.push({ name, n: sch.length, title: pickCurrentProgram(sch) || null });
    } catch(e) {
      live.push({ name, error: String(e && e.message || e) });
    }
  }
  fs.writeFileSync('d:/Automation/giptv/test/name-live.json', JSON.stringify(live,null,2));
})();
