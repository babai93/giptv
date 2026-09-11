const { readJiotvEpg, normalizeChannelName, formatEpgTime } = require('../api/data/jiotv-epg');

console.log('normalizeChannelName:', normalizeChannelName('CNBC TV18 Prime'));
console.log('formatEpgTime:', formatEpgTime(1789065000000));

readJiotvEpg()
  .then((result) => {
    console.log('JioTV EPG programs count:', Object.keys(result.programs).length);
    console.log('JioTV EPG byName count:', Object.keys(result.byName).length);
    const sample = Object.entries(result.byName).slice(0, 5);
    console.log('Sample byName entries:', JSON.stringify(sample));
  })
  .catch((err) => console.error('Error:', err.message));