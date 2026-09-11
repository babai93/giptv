const fs = require('fs/promises');
const path = require('path');

const { DATA_ROOT, CHANNELS_PER_PAGE } = require('./config');
const { readM3u, readStreamsJson, parseM3u, buildStreamUrlMap, resolveStreamUrls } = require('./data/api');
const { readEpg, resolveEpgProgram } = require('./data/epg');
const { processLogo } = require('./utils/logo');
const { renderPage } = require('./views/page');

async function serveStaticAsset(requestUrl, res, fileName) {
  try {
    const fileData = await fs.readFile(path.join(DATA_ROOT, fileName));

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    return res.status(200).send(fileData);
  } catch (_error) {
    return res.status(404).send(`${fileName} not found`);
  }
}

module.exports = async function handler(req, res) {
  const requestUrl = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/gtv-logo.svg') {
    return serveStaticAsset(requestUrl, res, 'gtv-logo.svg');
  }

  if (requestUrl.pathname === '/video.svg') {
    return serveStaticAsset(requestUrl, res, 'video.svg');
  }

  if (requestUrl.pathname === '/jio-logo.svg') {
    return serveStaticAsset(requestUrl, res, 'jio-logo.svg');
  }

  if (requestUrl.pathname === '/logo') {
    const logoUrl = requestUrl.searchParams.get('url');

    if (!logoUrl) {
      return res.status(400).send('Missing logo url');
    }

    try {
      const { buffer, contentType } = await processLogo(logoUrl);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

      return res.status(200).send(buffer);
    } catch (_error) {
      res.setHeader('Location', logoUrl);
      return res.status(302).end();
    }
  }

  const params = requestUrl.searchParams;

  const [m3uContent, streamsJson, epg] = await Promise.all([
    readM3u(),
    readStreamsJson(),
    readEpg()
  ]);

  const m3uChannels = parseM3u(m3uContent);
  const streamUrlMap = buildStreamUrlMap(streamsJson);

  const countryDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const countryNames = Object.fromEntries(
    [...new Set(m3uChannels.map((item) => item.country).filter(Boolean))]
      .sort()
      .map((code) => [code, countryDisplayNames.of(code) || code])
  );

  let playable = m3uChannels
    .filter((item) => item.id && item.stream_url)
    .map((item) => {
      const streamUrls = resolveStreamUrls(item.id, item.stream_url, streamUrlMap);
      const { program, source } = resolveEpgProgram(epg, item);

      return {
        ...item,
        stream_urls: streamUrls.length ? streamUrls : item.stream_urls || [item.stream_url],
        stream_url: streamUrls[0] || item.stream_url,
        logo: item.logo || '',
        country: item.country || 'IN',
        categories: Array.isArray(item.categories) ? item.categories : [item.categories || 'Undefined'],
        program_name: program,
        program_source: source
      };
    });

  const allCountries = Object.fromEntries(
    [...new Set(playable.map((item) => (item.country || '').toUpperCase()).filter(Boolean))]
      .sort()
      .map((code) => [code, countryNames[code] || code])
  );

  const allCategories = Object.fromEntries(
    [...new Set(
      playable
        .flatMap((item) => Array.isArray(item.categories) ? item.categories : item.categories ? [item.categories] : [])
        .filter(Boolean)
    )]
      .sort()
      .map((id) => [id, id])
  );

  const search = params.get('search') || '';
  const country = (params.get('country') || '').toUpperCase();
  const category = params.get('category') || '';

  if (search) {
    playable = playable.filter((item) => (item.name || '').toLowerCase().includes(search.toLowerCase()));
  }

  if (country) {
    playable = playable.filter((item) => (item.country || '').toUpperCase() === country);
  }

  if (category) {
    playable = playable.filter((item) => {
      const categories = Array.isArray(item.categories)
        ? item.categories
        : item.categories
          ? [item.categories]
          : [];

      return categories.includes(category);
    });
  }

  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const totalPages = Math.ceil(playable.length / CHANNELS_PER_PAGE);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  return res.status(200).send(
    renderPage({
      channels: playable,
      countries: allCountries,
      categories: allCategories,
      countryNames,
      total: playable.length,
      page,
      totalPages,
      search,
      country,
      category
    })
  );
};
