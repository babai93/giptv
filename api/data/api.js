const fs = require('fs/promises');
const path = require('path');
const { CACHE_ROOT, M3U_URL, STREAMS_URL, LOCAL_M3U_FILE, EPG_LOCAL_FILE, M3U_REFRESH_MS } = require('../config');
const { readCache, writeCache, isCacheValid } = require('../utils/cache');

async function readM3u() {
  try {
    const localStats = await fs.stat(LOCAL_M3U_FILE);
    const localContent = await fs.readFile(LOCAL_M3U_FILE, 'utf8');

    if (Date.now() - localStats.mtimeMs < M3U_REFRESH_MS) {
      return localContent;
    }
  } catch (_error) {
    // fallback to remote fetch below
  }

  try {
    const response = await fetch(M3U_URL, { headers: { 'User-Agent': 'Node-IPTV-App/1.0' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.text();
    await fs.writeFile(LOCAL_M3U_FILE, data, 'utf8');
    return data;
  } catch (_error) {
    try {
      return await fs.readFile(LOCAL_M3U_FILE, 'utf8');
    } catch (_fallbackError) {
      return '';
    }
  }
}

async function readStreamsJson() {
  const cacheFile = path.join(CACHE_ROOT, 'streams.json');

  try {
    const cached = await readCache(cacheFile);
    if (cached && (await isCacheValid(cacheFile, M3U_REFRESH_MS))) {
      const parsed = JSON.parse(cached);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (_error) {
    // ignore malformed cache and refresh below
  }

  try {
    const response = await fetch(STREAMS_URL, { headers: { 'User-Agent': 'Node-IPTV-App/1.0' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.text();
    const parsed = JSON.parse(data);

    await writeCache(cacheFile, data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    try {
      const cached = await readCache(cacheFile);
      if (!cached) {
        return [];
      }
      const parsed = JSON.parse(cached);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_fallbackError) {
      return [];
    }
  }
}

function splitExtinfLabel(line) {
  let inQuotes = false;
  let quoteChar = '';

  for (let index = 0; index < line.length; index++) {
    const char = line[index];

    if ((char === '"' || char === "'") && (quoteChar === '' || char === quoteChar)) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else {
        inQuotes = false;
        quoteChar = '';
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      return line.slice(index + 1).trim();
    }
  }

  return '';
}

function normalizeCategories(value) {
  const categories = String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

  return categories.length ? categories : ['Undefined'];
}

function extractCountryFromTvgId(value, fallbackValue = '') {
  const explicitCountry = String(fallbackValue || '').trim();

  if (explicitCountry) {
    return explicitCountry.toUpperCase();
  }

  const tvgId = String(value || '').trim();
  const match = tvgId.match(/\.([a-z]{2})(?:@|$)/i);

  return match?.[1]?.toUpperCase() || '';
}

function stripTrailingMetadata(name) {
  let cleanedName = String(name || '')
    .replace(/\s*\[[^\]]+\]\s*$/g, '')
    .trim();

  let previousName = '';

  while (cleanedName !== previousName) {
    previousName = cleanedName;

    cleanedName = cleanedName
      .replace(/\s*\((?:HEVC|H265|H264|AVC|VP9|AV1|SDR|HDR|UHD|4K|\d{3,4}[pi])\)\s*$/gi, '')
      .trim();
  }

  return cleanedName;
}

function extractQualityFromName(name) {
  const normalizedName = String(name || '').trim();

  const qualityMatch = normalizedName.match(/\((\d{3,4}[pi])\)/i);

  if (!qualityMatch) {
    return {
      name: stripTrailingMetadata(normalizedName),
      qualityBadge: ''
    };
  }

  const quality = qualityMatch[1].toLowerCase();

  const qualityBadge = /1080p/i.test(quality)
    ? 'FHD'
    : /720p/i.test(quality)
      ? 'HD'
      : /(576p|480p|576i|504p|540P)/i.test(quality)
        ? 'SD'
        : quality.toUpperCase();

  const baseName = stripTrailingMetadata(
    normalizedName.replace(new RegExp(`\\s*\\(${qualityMatch[1]}\\)`, 'i'), '')
  );

  return {
    name: baseName,
    qualityBadge
  };
}

function attribute(source, name) {
  return source.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'))?.[1] || '';
}

function parseM3u(m3uContent) {
  const channels = [];
  let currentChannel = null;

  for (const rawLine of String(m3uContent || '').split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const rawName = splitExtinfLabel(line);
      const qualityInfo = extractQualityFromName(rawName);

      const tvgId = attribute(line, 'tvg-id') || '';
      const tvgCountry = attribute(line, 'tvg-country') || '';

      currentChannel = {
        id: tvgId || attribute(line, 'tvg-name') || '',
        name: qualityInfo.name,
        logo: attribute(line, 'tvg-logo') || '',
        categories: normalizeCategories(attribute(line, 'group-title')),
        country: extractCountryFromTvgId(tvgId, tvgCountry),
        stream_url: '',
        stream_urls: [],
        qualityBadge: qualityInfo.qualityBadge
      };
      continue;
    }

    if (line.startsWith('#EXTGRP:')) {
      if (currentChannel) {
        currentChannel.categories = normalizeCategories(line.slice('#EXTGRP:'.length).trim());
      }
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    if (currentChannel) {
      currentChannel.stream_url = line;
      currentChannel.stream_urls = [line];
      channels.push(currentChannel);
      currentChannel = null;
    }
  }

  return channels.filter((item) => item.name && item.stream_url);
}

function buildStreamUrlMap(streams) {
  const map = new Map();

  for (const stream of Array.isArray(streams) ? streams : []) {
    const channel = String(stream?.channel || '').trim();
    const url = String(stream?.url || '').trim();

    if (!channel || !url) {
      continue;
    }

    const keys = [
      channel,
      channel.toLowerCase(),
      channel.replace(/@sd$/i, ''),
      channel.replace(/@sd$/i, '').toLowerCase()
    ];

    for (const key of [...new Set(keys)]) {
      const existing = map.get(key) || [];

      if (!existing.includes(url)) {
        existing.push(url);
      }

      map.set(key, existing);
    }
  }

  return map;
}

function resolveStreamUrls(channelId, streamUrl, streamUrlMap) {
  const candidates = [
    String(channelId || '').trim(),
    String(channelId || '').trim().toLowerCase(),
    String(channelId || '').trim().replace(/@sd$/i, ''),
    String(channelId || '').trim().replace(/@sd$/i, '').toLowerCase()
  ];

  const urls = [];

  for (const candidate of [...new Set(candidates)]) {
    if (!candidate) {
      continue;
    }

    const fallbackList = streamUrlMap.get(candidate) || [];

    for (const fallbackUrl of fallbackList) {
      if (fallbackUrl && !urls.includes(fallbackUrl)) {
        urls.push(fallbackUrl);
      }
    }
  }

  if (urls.length) {
    return urls;
  }

  return streamUrl ? [streamUrl] : [];
}

module.exports = {
  readM3u,
  readStreamsJson,
  parseM3u,
  buildStreamUrlMap,
  resolveStreamUrls
};
