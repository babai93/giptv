const path = require('path');

const { CACHE_ROOT } = require('../config');
const { readCache, writeCache, isCacheValid } = require('../utils/cache');

const JIOTV_CHANNEL_URL =
  'https://jiotv.data.cdn.jio.com/apis/v3.0/getMobileChannelList/get/?os=android&devicetype=phone&usertype=tvYR7NSNn7rymo3F';
const JIOTV_EPG_URL = 'https://jiotv.data.cdn.jio.com/apis/v1.3/getepg/get?offset=%d&channel_id=%d';
const JIOTV_EPG_TTL_MS = 6 * 60 * 60 * 1000;
const JIOTV_EPG_CONCURRENCY = 20;
const JIOTV_EPG_OFFSETS = [0, 1];

let jiotvEpgCache = null;
let jiotvEpgCacheTime = 0;
const JIOTV_EPG_MEMORY_TTL_MS = 5 * 60 * 1000;

function normalizeChannelName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function formatEpgTime(epochMs) {
  const date = new Date(Number(epochMs));
  const pad = (value) => String(value).padStart(2, '0');

  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())} +0530`
  );
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'okhttp/4.2.2',
      ...headers
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchChannels() {
  const data = await fetchJson(JIOTV_CHANNEL_URL);

  return (data?.result || [])
    .filter((channel) => channel?.channel_id && channel?.channel_name)
    .map((channel) => ({
      id: channel.channel_id,
      name: channel.channel_name,
      logo: channel.logoUrl || ''
    }));
}

async function fetchChannelEpg(channelId) {
  const programmes = [];

  for (const offset of JIOTV_EPG_OFFSETS) {
    try {
      const url = JIOTV_EPG_URL.replace('%d', String(offset)).replace('%d', String(channelId));
      const data = await fetchJson(url);

      for (const item of data?.epg || []) {
        const startEpoch = Number(item?.startEpoch || 0);
        const endEpoch = Number(item?.endEpoch || 0);
        const title = String(item?.showname || '').trim();

        if (!startEpoch || !endEpoch || !title) {
          continue;
        }

        programmes.push({
          start: startEpoch,
          stop: endEpoch,
          title,
          description: String(item?.description || '').trim(),
          category: String(item?.showCategory || '').trim(),
          poster: String(item?.episodePoster || '').trim()
        });
      }
    } catch (_error) {
      // Skip failed offset and continue with the next one
    }
  }

  return programmes;
}

async function fetchAllEpg(channels) {
  const results = new Map();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < channels.length) {
      const index = nextIndex++;
      const channel = channels[index];

      try {
        const programmes = await fetchChannelEpg(channel.id);
        results.set(channel.id, programmes);
      } catch (_error) {
        results.set(channel.id, []);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(JIOTV_EPG_CONCURRENCY, channels.length) },
    () => worker()
  );

  await Promise.all(workers);

  return results;
}

function buildEpgMaps(channels, epgByChannel) {
  const programs = {};
  const byName = {};
  const now = Date.now();

  for (const channel of channels) {
    const programmes = epgByChannel.get(channel.id) || [];
    let currentTitle = '';
    let latestTitle = '';
    let latestStop = 0;

    for (const programme of programmes) {
      if (programme.start <= now && programme.stop > now) {
        currentTitle = programme.title;
      }

      if (programme.stop > latestStop) {
        latestStop = programme.stop;
        latestTitle = programme.title;
      }
    }

    const title = currentTitle || latestTitle;

    if (!title) {
      continue;
    }

    const channelId = String(channel.id);
    programs[channelId] = title;

    const key = normalizeChannelName(channel.name);
    byName[key] = title;
  }

  return { programs, byName };
}

async function readJiotvEpg() {
  if (jiotvEpgCache && Date.now() - jiotvEpgCacheTime < JIOTV_EPG_MEMORY_TTL_MS) {
    return jiotvEpgCache;
  }

  const cacheFile = path.join(CACHE_ROOT, 'jiotv-epg.json');

  try {
    const cached = await readCache(cacheFile);

    if (cached && (await isCacheValid(cacheFile, JIOTV_EPG_TTL_MS))) {
      const parsed = JSON.parse(cached);
      jiotvEpgCache = parsed;
      jiotvEpgCacheTime = Date.now();
      return parsed;
    }
  } catch (_error) {
    // Fall through to network fetch
  }

  try {
    const channels = await fetchChannels();
    const epgByChannel = await fetchAllEpg(channels);
    const result = buildEpgMaps(channels, epgByChannel);

    await writeCache(cacheFile, JSON.stringify(result));
    jiotvEpgCache = result;
    jiotvEpgCacheTime = Date.now();
    return result;
  } catch (_error) {
    try {
      const cached = await readCache(cacheFile);

      if (cached) {
        const parsed = JSON.parse(cached);
        jiotvEpgCache = parsed;
        jiotvEpgCacheTime = Date.now();
        return parsed;
      }
    } catch (_fallbackError) {
      // Ignore and return empty
    }

    return { programs: {}, byName: {} };
  }
}

module.exports = {
  readJiotvEpg,
  normalizeChannelName,
  formatEpgTime
};