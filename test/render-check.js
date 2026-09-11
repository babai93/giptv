const fs = require('fs');
const OUT = 'd:/Automation/giptv/test/render-check-result.txt';
const out = [];
function line(s) { out.push(s); }

async function main() {
  const { readEpg, resolveEpgProgram } = require('../api/data/epg');
  const epg = await readEpg();
  line('programsCount: ' + Object.keys(epg.programs).length);
  line('jioCount: ' + Object.values(epg.sources).filter((s) => s === 'jio').length);

  const uk = resolveEpgProgram(epg, { id: 'BBCNews.uk', name: 'BBC News', country: 'UK' });
  line('UK resolve: ' + JSON.stringify(uk));

  const { renderPage } = require('../api/views/page');
  try {
    const html = renderPage({
      channels: [], countries: {}, categories: {}, countryNames: {},
      total: 0, page: 1, totalPages: 1, search: '', country: '', category: '',
      serverTime: Date.now()
    });
    line('renderPage OK len=' + html.length);
    line('has clock-footer: ' + html.includes('clock-footer'));
    line('has data-server-epoch: ' + html.includes('data-server-epoch'));
  } catch (e) {
    line('RENDER ERROR: ' + e.message);
    line(e.stack);
  }

  fs.writeFileSync(OUT, out.join('\n') + '\n');
  process.exit(0);
}

main().catch((e) => {
  fs.writeFileSync(OUT, 'FATAL: ' + e.message + '\n' + e.stack);
  process.exit(1);
});
