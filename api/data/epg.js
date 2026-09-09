const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');

const { CACHE_ROOT, EPG_URL, EPG_LOCAL_FILE, M3U_REFRESH_MS } = require('../config');
const { readCache, writeCache, isCacheValid } = require('../utils/cache');
const { attribute, epgDate, textContent } = require('../utils/helpers');

let parsedEpgCache = null;
let parsedEpgCacheTime = 0;
const PARSED_EPG_TTL_MS = 5 * 60 * 1000;

async function readEpg() {
  const cacheFile = path.join(CACHE_ROOT, 'epg.xml');

  if (parsedEpgCache && Date.now() - parsedEpgCacheTime < PARSED_EPG_TTL_MS) {
    return parsedEpgCache;
  }

  try {
    const cachedXml = await readCache(cacheFile);
    const isFresh = cachedXml ? await isCacheValid(cacheFile, M3U_REFRESH_MS) : false;

    if (cachedXml && isFresh) {
      const parsed = parseEpgXml(cachedXml);
      parsedEpgCache = parsed;
      parsedEpgCacheTime = Date.now();
      return parsed;
    }
  } catch (_error) {
    // retry below using network/local fallback
  }

  try {
    const response = await fetch(EPG_URL, { headers: { 'User-Agent': 'Node-IPTV-App/1.0' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xmlText = zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
    await writeCache(cacheFile, xmlText);

    const parsed = parseEpgXml(xmlText);
    parsedEpgCache = parsed;
    parsedEpgCacheTime = Date.now();
    return parsed;
  } catch (_error) {
    try {
      const localXml = await fs.readFile(EPG_LOCAL_FILE, 'utf8');
      const parsed = parseEpgXml(localXml);
      parsedEpgCache = parsed;
      parsedEpgCacheTime = Date.now();
      return parsed;
    } catch (_fallbackError) {
      return { programs: {}, byName: {} };
    }
  }
}

function parseEpgXml(xml) {
  const programs = {};
  const latest = {};

  for (const match of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi)) {
    const attrs = match[1];
    const body = match[2];
    const channel = attribute(attrs, 'channel');
    const start = Date.parse(epgDate(attribute(attrs, 'start')));
    const stop = Date.parse(epgDate(attribute(attrs, 'stop')));
    const title = textContent(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');

    if (!channel || !title || Number.isNaN(stop)) {
      continue;
    }

    if (start <= Date.now() && stop > Date.now()) {
      programs[channel] = title;
    }

    if (!latest[channel] || stop > latest[channel].stop) {
      latest[channel] = { title, stop };
    }
  }

  const byName = {};

  for (const match of xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi)) {
    const id = attribute(match[1], 'id');
    const name = textContent(
      match[2].match(/<display-name\b[^>]*>([\s\S]*?)<\/display-name>/i)?.[1] || ''
    );
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (name && id && (programs[id] || latest[id])) {
      byName[key] = programs[id] || latest[id].title;
    }
  }

  return { programs, byName };
}

module.exports = {
  readEpg
};
