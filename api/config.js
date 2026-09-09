const path = require('path');

const DATA_ROOT = path.join(__dirname, '..');
const CACHE_ROOT = path.join(DATA_ROOT, '.cache');
const M3U_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const STREAMS_URL = 'https://iptv-org.github.io/api/streams.json';
const EPG_URL = 'https://avkb.short.gy/epg.xml.gz';
const LOCAL_M3U_FILE = path.join(DATA_ROOT, 'index_file.m3u');
const EPG_LOCAL_FILE = path.join(DATA_ROOT, 'epg.xml');
const M3U_REFRESH_MS = 6 * 60 * 60 * 1000;
const CHANNELS_PER_PAGE = 48;

module.exports = {
  DATA_ROOT,
  CACHE_ROOT,
  M3U_URL,
  STREAMS_URL,
  EPG_URL,
  LOCAL_M3U_FILE,
  EPG_LOCAL_FILE,
  M3U_REFRESH_MS,
  CHANNELS_PER_PAGE
};
