const fs = require('fs/promises');
const path = require('path');
const { readEpg } = require('../api/data/epg');

async function main() {
  const result = await readEpg();
  const lines = [];

  lines.push(`EPG programs count: ${Object.keys(result.programs).length}`);
  lines.push(`EPG byName count: ${Object.keys(result.byName).length}`);

  const jioChannels = ['cnbctv18prime', 'colorshd', 'aajtak', 'sonysab', 'zeenews', 'ndtvindia'];
  for (const channel of jioChannels) {
    lines.push(`  ${channel}: ${result.byName[channel] || 'NOT FOUND'}`);
  }

  if (Object.keys(result.programs).length === 0) {
    throw new Error('EPG programs map is empty');
  }

  lines.push('EPG integration test passed');
  await fs.writeFile(path.join(__dirname, '..', 'test-output.txt'), lines.join('\n'), 'utf8');
  process.exit(0);
}

main().catch((err) => {
  const message = `EPG integration test failed: ${err.message}`;
  console.error(message);
  process.exit(1);
});