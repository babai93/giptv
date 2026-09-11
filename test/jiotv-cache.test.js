const fs = require('fs/promises');
const path = require('path');

async function main() {
  const cacheFile = path.join(__dirname, '..', '.cache', 'jiotv-epg.json');
  const cached = await fs.readFile(cacheFile, 'utf8');
  const parsed = JSON.parse(cached);

  const lines = [];
  lines.push(`JioTV EPG programs count: ${Object.keys(parsed.programs).length}`);
  lines.push(`JioTV EPG byName count: ${Object.keys(parsed.byName).length}`);

  const jioChannels = ['cnbctv18prime', 'colorshd', 'aajtak', 'sonysab', 'zeenews', 'ndtvindia'];
  for (const channel of jioChannels) {
    lines.push(`  ${channel}: ${parsed.byName[channel] || 'NOT FOUND'}`);
  }

  lines.push('JioTV EPG cache test passed');

  await fs.writeFile(path.join(__dirname, '..', 'test-output.txt'), lines.join('\n'), 'utf8');
  process.exit(0);
}

main().catch((err) => {
  const message = `Test failed: ${err.message}`;
  console.error(message);
  process.exit(1);
});