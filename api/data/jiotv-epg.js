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

// XMLTV timestamps must always carry IST (+0530) regardless of the server's
// local timezone, so format the epoch explicitly in Asia/Kolkata.
function formatEpgTime(epochMs) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = {};

  for (const part of formatter.formatToParts(Number(epochMs))) {
    parts[part.type] = part.value;
  }

  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second} +0530`;
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

// Resolves the programme that should be displayed right now from a channel's
// schedule: the on-air programme, else the next upcoming one, else the last
// known programme in the fetched window.
function pickCurrentProgram(schedules, now = Date.now()) {
  if (!Array.isArray(schedules) || schedules.length === 0) {
    return '';
  }

  let currentTitle = '';
  let upcoming = null;
  let latest = null;

  for (const programme of schedules) {
    if (programme.start <= now && programme.stop > now) {
      currentTitle = programme.title;
    }

    if (programme.start > now && (!upcoming || programme.start < upcoming.start)) {
      upcoming = programme;
    }

    if (!latest || programme.stop > latest.stop) {
      latest = programme;
    }
  }

  if (currentTitle) {
    return currentTitle;
  }

  return (upcoming || latest).title;
}

function buildEpgSchedules(channels, epgByChannel) {
  const programs = {};
  const byName = {};

  for (const channel of channels) {
    const schedules = (epgByChannel.get(channel.id) || [])
      .filter((programme) => programme.start && programme.stop && programme.title)
      .map((programme) => ({ start: programme.start, stop: programme.stop, title: programme.title }))
      .sort((a, b) => a.start - b.start);

    if (schedules.length === 0) {
      continue;
    }

    const channelId = String(channel.id);
    programs[channelId] = schedules;

    const key = normalizeChannelName(channel.name);
    if (key) {
      byName[key] = schedules;
    }
  }

  return { programs, byName };
}

// Older caches stored only the "now playing" title resolved at build time,
// which went stale for up to 6 hours. Schedule-shaped caches keep every
// programme so the current show can be resolved at request time.
function isScheduleCache(result) {
  return Boolean(
    result &&
      result.programs &&
      result.byName &&
      Object.values(result.programs).some((value) => Array.isArray(value) && value.length > 0)
  );
}

// Per-channel schedules fetched on demand (used by serverless, where
// rebuilding the full catalogue per request would be far too slow).
const JIOTV_CHANNEL_TTL_MS = 30 * 60 * 1000;
const perChannelMemory = new Map();

async function fetchJioSchedules(channelId) {
  const id = String(channelId || '');
  if (!id) {
    return [];
  }

  const memo = perChannelMemory.get(id);
  if (memo && Date.now() - memo.time < JIOTV_CHANNEL_TTL_MS) {
    return memo.schedules;
  }

  const cacheFile = path.join(CACHE_ROOT, `jiotv-channel-${id}.json`);

  try {
    const cached = await readCache(cacheFile);

    if (cached && (await isCacheValid(cacheFile, JIOTV_CHANNEL_TTL_MS))) {
      const schedules = JSON.parse(cached);
      perChannelMemory.set(id, { schedules, time: Date.now() });
      return schedules;
    }
  } catch (_error) {
    // Fall through to network fetch
  }

  try {
    const programmes = await fetchChannelEpg(id);
    const schedules = programmes
      .filter((programme) => programme.start && programme.stop && programme.title)
      .map((programme) => ({ start: programme.start, stop: programme.stop, title: programme.title }))
      .sort((a, b) => a.start - b.start);

    if (schedules.length > 0) {
      await writeCache(cacheFile, JSON.stringify(schedules));
      perChannelMemory.set(id, { schedules, time: Date.now() });
      return schedules;
    }
  } catch (_error) {
    // Fall through to stale memory below
  }

  return memo ? memo.schedules : [];
}

// Resolves Jio channel ids from normalized channel names, so entries coming
// from the m3u (whose tvg-id is not Jio's numeric id) can still be matched.
const JIOTV_CHANNEL_LIST_TTL_MS = 6 * 60 * 60 * 1000;
let channelIndexMemory = null;

async function getJioChannelIndex() {
  if (channelIndexMemory && Date.now() - channelIndexMemory.time < JIOTV_CHANNEL_LIST_TTL_MS) {
    return channelIndexMemory.index;
  }

  const cacheFile = path.join(CACHE_ROOT, 'jiotv-channels-index.json');

  try {
    const cached = await readCache(cacheFile);

    if (cached && (await isCacheValid(cacheFile, JIOTV_CHANNEL_LIST_TTL_MS))) {
      const index = JSON.parse(cached);
      channelIndexMemory = { index, time: Date.now() };
      return index;
    }
  } catch (_error) {
    // Fall through to network fetch
  }

  try {
    const channels = await fetchChannels();
    const index = {};

    for (const channel of channels) {
      const key = normalizeChannelName(channel.name);
      if (key && !index[key]) {
        index[key] = String(channel.id);
      }
    }

    await writeCache(cacheFile, JSON.stringify(index));
    channelIndexMemory = { index, time: Date.now() };
    return index;
  } catch (_error) {
    return channelIndexMemory ? channelIndexMemory.index : {};
  }
}

async function fetchJioSchedulesByName(name, fallbackId) {
  const index = await getJioChannelIndex();
  const resolvedId = index[normalizeChannelName(name)] || String(fallbackId || '');

  if (!resolvedId) {
    return [];
  }

  return fetchJioSchedules(resolvedId);
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

      if (isScheduleCache(parsed)) {
        jiotvEpgCache = parsed;
        jiotvEpgCacheTime = Date.now();
        return parsed;
      }
      // Legacy cache only has baked-in titles, so rebuild from the network.
    }
  } catch (_error) {
    // Fall through to network fetch
  }

  try {
    const channels = await fetchChannels();
    const epgByChannel = await fetchAllEpg(channels);
    const result = buildEpgSchedules(channels, epgByChannel);

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
  fetchJioSchedules,
  fetchJioSchedulesByName,
  normalizeChannelName,
  formatEpgTime,
  pickCurrentProgram
};