const fs = require('fs');
const OUT = 'd:/Automation/giptv/api/data/jiotv-channels.json';
const HEADERS = { 'User-Agent': 'okhttp/4.2.2' };

function normalize(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  const res = await fetch(
    'https://jiotv.data.cdn.jio.com/apis/v3.0/getMobileChannelList/get/?os=android&devicetype=phone&usertype=tvYR7NSNn7rymo3F',
    { headers: HEADERS }
  );
  const data = await res.json();
  const index = {};

  for (const channel of data.result || []) {
    if (channel?.channel_id && channel?.channel_name) {
      const key = normalize(channel.channel_name);
      if (key && !index[key]) {
        index[key] = String(channel.channel_id);
      }
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(index, null, 2));
  const count = Object.keys(index).length;
  require('fs').writeFileSync('d:/Automation/giptv/test/index-gen-result.txt', `channels indexed: ${count}; b4umusic=${index.b4umusic}; 9xm=${index['9xm']}`);
  process.exit(0);
}

main().catch((err) => {
  require('fs').writeFileSync('d:/Automation/giptv/test/index-gen-result.txt', 'FAILED: ' + err.message);
  process.exit(1);
});
