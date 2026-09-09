const assert = require('node:assert/strict');
const { parseM3u } = require('../api/data/api');

const m3uSample = `#EXTINF:-1 tvg-id="BBCNews.uk@Africa" tvg-logo="https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_BBC_NEWS/images/LOGO_HD/image.png" group-title="News",BBC News (1080p) (HEVC) (1080p)
https://vs-cmaf-push-ww-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/hevc_iptv_mse_v0.mpd`;

const channels = parseM3u(m3uSample);

assert.equal(channels.length, 1, 'Expected exactly one parsed channel');
assert.equal(channels[0].name, 'BBC News', 'Expected duplicate quality suffixes to be stripped from channel names');
assert.equal(channels[0].qualityBadge, 'FHD', 'Expected the quality badge to remain correct');

console.log('normalization test passed');
