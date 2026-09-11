const fs = require('fs/promises');
const path = require('path');
const { readEpg, resolveEpgProgram } = require('../api/data/epg');

async function main() {
  const lines = [];
  const assert = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };

  // Verify EPG sources map
  const epg = await readEpg();
  const sources = epg.sources || {};
  const jioCount = Object.values(sources).filter((source) => source === 'jio').length;

  lines.push(`EPG programs: ${Object.keys(epg.programs).length}`);
  lines.push(`JioTV-sourced programs: ${jioCount}`);

  assert(jioCount > 0, 'Expected JioTV-sourced programs to be tracked');

  // Indian channel: name lookup (Jio EPG) takes priority over ID lookup (XML EPG)
  const indianChannel = {
    id: 'cnbctv18prime.in@sd',
    name: 'CNBC TV18 Prime',
    country: 'IN'
  };
  const indianResult = resolveEpgProgram(epg, indianChannel);

  lines.push(`Indian channel resolution: program="${indianResult.program}" source="${indianResult.source}"`);

  assert(indianResult.program, 'Expected Indian channel to resolve a program');
  assert(
    indianResult.source === 'jio',
    `Expected Indian channel to prefer Jio EPG, got source=${indianResult.source}`
  );

  // Indian channel with only XML id-based match should fall back to ID lookup
  const fallbackResult = resolveEpgProgram(epg, {
    id: 'definitely-not-a-jio-channel-id',
    name: 'No Such Channel Anywhere',
    country: 'IN'
  });
  assert(
    fallbackResult.program === '' || fallbackResult.source === 'xml' || fallbackResult.source === '',
    'Expected Indian fallback to use id lookup only'
  );

  // Non-Indian channel: id lookup (XML) takes priority
  const ukChannel = {
    id: 'BBCNews.uk',
    name: 'BBC News',
    country: 'UK'
  };
  const ukResult = resolveEpgProgram(epg, ukChannel);

  lines.push(`Non-Indian channel resolution: program="${ukResult.program}" source="${ukResult.source}"`);

  if (ukResult.program) {
    assert(
      ukResult.source !== 'jio',
      'Expected non-Indian channel to prefer XML/id-based EPG over Jio'
    );
  }

  // Verify page rendering for a Jio channel still includes the badge wiring
  const { renderPage } = require('../api/views/page');
  const html = renderPage({
    channels: [{
      id: 'cnbctv18prime',
      name: 'CNBC TV18 Prime',
      stream_url: 'https://example.com/stream.m3u8',
      stream_urls: ['https://example.com/stream.m3u8'],
      logo: '',
      country: 'IN',
      categories: ['News'],
      program_name: indianResult.program,
      program_source: indianResult.source,
      qualityBadge: ''
    }],
    countries: { IN: 'India' },
    categories: { News: 'News' },
    countryNames: { IN: 'India' },
    total: 1,
    page: 1,
    totalPages: 1,
    search: '',
    country: '',
    category: ''
  });

  assert(html.includes('/jio-logo.svg'), 'Expected page to reference /jio-logo.svg');

  const { clientScript } = require('../api/views/client');
  const script = clientScript();

  assert(script.includes('/jio-logo.svg'), 'Expected client script to include jio badge img');
  assert(script.includes('width="14"'), 'Expected jio badge to be 14px');

  const { styles } = require('../api/views/styles');
  const css = styles();

  assert(css.includes('.jio-epg-badge'), 'Expected styles to include .jio-epg-badge rule');
  assert(css.includes('width:14px'), 'Expected .jio-epg-badge width to be 14px');

  const logoPath = path.join(__dirname, '..', 'jio-logo.svg');
  const logo = await fs.readFile(logoPath, 'utf8');

  assert(logo.includes('<svg'), 'Expected jio-logo.svg to be a valid SVG');

  lines.push('Jio-primary EPG priority test passed');

  await fs.writeFile(path.join(__dirname, '..', 'test-output.txt'), lines.join('\n'), 'utf8');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});