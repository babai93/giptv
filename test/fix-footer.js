const fs = require('fs');
const path = 'd:/Automation/giptv/api/views/page.js';
let s = fs.readFileSync(path, 'utf8');
const old1 = 'serverTime\n}) {';
// Fix footer: replace broken escaped footer block
const re = /\n\s*<footer class=\\"clock-footer\\">[\s\S]*?<\/footer>/;
if (!re.test(s)) {
  // try literal backslash-quote version as stored
  console.log('re1 miss');
}
const before = s;
s = s.replace(/\n  <footer class=\\"clock-footer\\">\n    <span class=\\"clock-label\\">Server time<\/span>\n    <span id=\\"server-clock\" data-server-epoch=\\"\$\{serverTime \|\| Date\.now\(\)\}\\"<\/span>\n  <\/footer>/,
`\n  <footer class="clock-footer">\n    <span class="clock-label">Server time (IST)</span>\n    <span id="server-clock" data-server-epoch="\${serverTime || Date.now()}"></span>\n    \${serverRegion ? `<span class="clock-region" title="Vercel runtime region">\${escapeHtml(serverRegion)}</span>` : ''}\n  </footer>`);
if (s === before) {
  // dump nearby lines for debug
  const i = s.indexOf('clock-footer');
  fs.writeFileSync('d:/Automation/giptv/test/footer-snip.txt', JSON.stringify(s.slice(i-20, i+220)));
  console.log('NO_REPLACE');
} else {
  fs.writeFileSync(path, s);
  console.log('REPLACED');
}
