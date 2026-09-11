const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');

const { CACHE_ROOT, EPG_URL, EPG_LOCAL_FILE, M3U_REFRESH_MS } = require('../config');
const { readCache, writeCache, isCacheValid } = require('../utils/cache');
const { attribute, epgDate, textContent } = require('../utils/helpers');
const { pickCurrentProgram, readJiotvEpg } = require('./jiotv-epg');

let parsedEpgCache = null;
let parsedEpgCacheTime = 0;
const PARSED_EPG_TTL_MS = 5 * 60 * 1000;

function mergeEpgData(baseEpg, jiotvEpg) {
  const programs = {
    ...baseEpg.programs,
    ...jiotvEpg.programs
  };
  const byName = {
    ...baseEpg.byName,
    ...jiotvEpg.byName
  };
  const sources = {};

  for (const key of Object.keys(programs)) {
    sources[key] = key in jiotvEpg.programs ? 'jio' : 'xml';
  }

  const byNameSources = {};

  for (const key of Object.keys(byName)) {
    byNameSources[key] = key in jiotvEpg.byName ? 'jio' : 'xml';
  }

  return { programs, byName, sources, byNameSources };
}

// JioTV entries hold full schedules (arrays of programmes) that must be
// resolved against the wall clock at request time. XML entries are titles
// that were already resolved while parsing the EPG document.
function resolveProgramValue(program, now = Date.now()) {
  if (Array.isArray(program)) {
    return pickCurrentProgram(program, now);
  }

  return String(program || '');
}

function hasProgram(program) {
  if (Array.isArray(program)) {
    return program.length > 0;
  }

  return Boolean(program);
}

// Resolves the program for a channel with JioTV EPG as the primary
// source for Indian channels and XML EPG for the rest.
function resolveEpgProgram(epg, item) {
  const channelId = String(item?.id || '');
  const nameKey = String(item?.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const isIndianChannel = String(item?.country || '').toUpperCase() === 'IN';
  const now = Date.now();

  const idPrograms = epg?.programs || {};
  const namePrograms = epg?.byName || {};
  const idSources = epg?.sources || {};
  const nameSources = epg?.byNameSources || {};

  const primary = isIndianChannel ? namePrograms[nameKey] : idPrograms[channelId];
  const primarySource = isIndianChannel ? nameSources[nameKey] : idSources[channelId];
  const secondary = isIndianChannel ? idPrograms[channelId] : namePrograms[nameKey];
  const secondarySource = isIndianChannel ? idSources[channelId] : nameSources[nameKey];

  if (hasProgram(primary)) {
    return {
      program: resolveProgramValue(primary, now),
      source: primarySource || (isIndianChannel ? 'jio' : '')
    };
  }

  if (hasProgram(secondary)) {
    return {
      program: resolveProgramValue(secondary, now),
      source: secondarySource || ''
    };
  }

  return { program: '', source: '' };
}

async function readEpg() {
  const cacheFile = path.join(CACHE_ROOT, 'epg.xml');

  if (parsedEpgCache && Date.now() - parsedEpgCacheTime < PARSED_EPG_TTL_MS) {
    return parsedEpgCache;
  }

  let baseEpg = { programs: {}, byName: {}, sources: {}, byNameSources: {} };

  try {
    const cachedXml = await readCache(cacheFile);
    const isFresh = cachedXml ? await isCacheValid(cacheFile, M3U_REFRESH_MS) : false;

    if (cachedXml && isFresh) {
      baseEpg = parseEpgXml(cachedXml);
    }
  } catch (_error) {
    // retry below using network/local fallback
  }

  if (!baseEpg.programs || Object.keys(baseEpg.programs).length === 0) {
    try {
      const response = await fetch(EPG_URL, { headers: { 'User-Agent': 'Node-IPTV-App/1.0' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xmlText = zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
      await writeCache(cacheFile, xmlText);

      baseEpg = parseEpgXml(xmlText);
    } catch (_error) {
      try {
        const localXml = await fs.readFile(EPG_LOCAL_FILE, 'utf8');
        baseEpg = parseEpgXml(localXml);
      } catch (_fallbackError) {
        baseEpg = { programs: {}, byName: {}, sources: {}, byNameSources: {} };
      }
    }
  }

  const jiotvEpg = await readJiotvEpg();
  const merged = mergeEpgData(baseEpg, jiotvEpg);

  parsedEpgCache = merged;
  parsedEpgCacheTime = Date.now();
  return merged;
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
  readEpg,
  resolveEpgProgram
};
