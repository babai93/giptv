const { styles } = require('./styles');
const { clientScript } = require('./client');
const {
  escapeHtml,
  countryFlag,
  categoryIcon,
  createPlaceholderUrl,
  queryUrl
} = require('../utils/helpers');
const { CHANNELS_PER_PAGE } = require('../config');

function getFlagUrl(code) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const flagCode = normalizedCode === 'UK' ? 'GB' : normalizedCode;

  return `https://flagcdn.com/20x15/${flagCode.toLowerCase()}.png`;
}

function buildLogoUrl(logoUrl, placeholderUrl) {
  const sourceUrl = String(logoUrl || '').trim();

  if (!sourceUrl) {
    return placeholderUrl;
  }

  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
    return `/logo?url=${encodeURIComponent(sourceUrl)}`;
  }

  return sourceUrl;
}

function buildCards({ channels, categories, countryNames }) {
  return channels.length
    ? channels.map((channel) => {
        const countryCode = (channel.country || '').toUpperCase();
        const flagMarkup = /^[A-Z]{2}$/.test(countryCode)
          ? `<img src="${getFlagUrl(countryCode)}"
                alt="${escapeHtml(countryFlag(countryCode), true)} flag"
                width="20"
                height="15"
                loading="lazy">`
          : '';

        const placeholderUrl = createPlaceholderUrl(channel.name);
        const logoUrl = buildLogoUrl(channel.logo, placeholderUrl);
        const qualityBadge = channel.qualityBadge
          ? `<div class="channel-quality-badge">${escapeHtml(channel.qualityBadge)}</div>`
          : '';

        const categoriesMarkup = (Array.isArray(channel.categories)
          ? channel.categories
          : channel.categories ? [channel.categories] : [])
          .slice(0, 2)
          .map((id) => {
            const name = categories[id] || id;
            return `<span class="channel-category">${categoryIcon(name)} ${escapeHtml(name)}</span>`;
          })
          .join('');

        return `
        <div class="col-6 col-sm-4 col-md-3">
          <div
            class="channel-card"
            onclick='playStream(...${escapeHtml(
              JSON.stringify([
                channel.stream_url,
                channel.name,
                channel.id,
                channel.program_name || '',
                channel.stream_urls && channel.stream_urls.length
                  ? channel.stream_urls
                  : [channel.stream_url]
              ]),
              true
            )})'
          >

            <div class="channel-logo-wrap">
              <img
                src="${escapeHtml(logoUrl, true)}"
                class="channel-logo"
                alt="${escapeHtml(channel.name, true)}"
                loading="lazy"
                onerror="this.onerror=null;this.src='${placeholderUrl}'"
              >

              ${qualityBadge}

              <div class="channel-play">
                <span>▶</span>
              </div>
            </div>

            <div class="channel-info">

              <div
                class="channel-name text-center"
                title="${escapeHtml(channel.name, true)}"
              >
                ${escapeHtml(channel.name)}
              </div>

              <div class="channel-meta">
                ${flagMarkup}
                <span>
                  ${escapeHtml(countryNames[countryCode] || countryCode || 'Unknown')}
                </span>
              </div>

              ${categoriesMarkup ? `<div class="channel-tags">${categoriesMarkup}</div>` : ''}

            </div>

          </div>
        </div>`;
      }).join('')
    : `
      <div class="col-12">
        <div class="empty-state">
          <div class="empty-icon">📺</div>
          <h4>No channels found</h4>
          <p>Try changing your search or filters.</p>
        </div>
      </div>`;
}

function buildPageLinks({ totalPages, page, search, country, category }) {
  if (totalPages <= 1) {
    return '';
  }

  const buildQuery = (nextPage) => queryUrl({ url: '/', headers: { host: 'localhost' } }, {
    page: nextPage,
    search,
    country,
    category
  });

  const visibleNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((number) => number >= Math.max(1, page - 2) && number <= Math.min(totalPages, page + 2));

  return `
      <nav class="mt-5">
        <ul class="pagination">

          ${page > 1 ? `
                <li class="page-item">
                  <a
                    class="page-link"
                    href="${buildQuery(page - 1)}"
                  >
                    ‹
                  </a>
                </li>
              ` : ''}

          ${visibleNumbers.map((number) => `
              <li class="page-item ${number === page ? 'active' : ''}">
                <a
                  class="page-link"
                  href="${buildQuery(number)}"
                >
                  ${number}
                </a>
              </li>
              `).join('')}

          ${page < totalPages ? `
                <li class="page-item">
                  <a
                    class="page-link"
                    href="${buildQuery(page + 1)}"
                  >
                    ›
                  </a>
                </li>
              ` : ''}

        </ul>
      </nav>
    `;
}

function renderPage({
  channels,
  countries,
  categories,
  countryNames,
  total,
  page,
  totalPages,
  search,
  country,
  category
}) {
  const pageChannels = channels.slice((page - 1) * CHANNELS_PER_PAGE, page * CHANNELS_PER_PAGE);

  const cards = buildCards({ channels: pageChannels, categories, countryNames });
  const pageLinks = buildPageLinks({ totalPages, page, search, country, category });

  const selectedCountryName = country ? countries[country] || country : '🌎 All countries';
  const selectedCategoryName = category ? categories[category] || category : 'All categories';

  const countryPickerOptions = Object.entries(countries)
    .map(([code, name]) => `
        <button
          type="button"
          class="country-option"
          data-country="${escapeHtml(code, true)}"
        >
          <img
            src="${getFlagUrl(code)}"
            alt="${escapeHtml(countryFlag(code), true)} flag"
            width="20"
            height="15"
            loading="lazy"
          >
          ${escapeHtml(name)}
        </button>
        `)
    .join('');

  const categoryPickerOptions = Object.entries(categories)
    .map(([id, name]) => `
        <button
          type="button"
          class="country-option"
          data-category="${escapeHtml(id, true)}"
        >
          ${categoryIcon(name)} ${escapeHtml(name)}
        </button>
        `)
    .join('');

  const clearButton = search || country || category
    ? `
            <a
              href="/"
              class="clear-button"
              onclick="
                const form=this.closest('form');
                form.elements.search.value='';
                form.elements.country.value='';
                form.elements.category.value='';
                const countryToggle=form.querySelector('#country-picker-toggle span');
                const categoryToggle=form.querySelector('#category-picker-toggle span');

                if(countryToggle)
                  countryToggle.innerHTML='🌎 All countries';

                if(categoryToggle)
                  categoryToggle.innerHTML='📺 All categories';

                form.elements.country.value='';
                form.elements.category.value='';
              "
            >
              Clear
            </a>
          `
    : '';

  return `
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<title>Global IPTV</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/shaka-player@4.15.5/dist/controls.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Doppio+One&display=swap" rel="stylesheet">
<script src="https://unpkg.com/shaka-player@4.15.5/dist/shaka-player.ui.js"></script>

<style>
${styles()}
</style>

</head>

<body>

<div class="ambient ambient-one"></div>
<div class="ambient ambient-two"></div>

<div class="container-fluid main-container">

  <header class="top-header">

    <div class="brand-area flex-grow-1">

      <div class="brand-logo">
      <a href="/" aria-label="Global IPTV Home">
        <img src="gtv-logo.svg" alt="GTV">
      </a>
      </div>

      <div>
        <h1 class="doppio-one-regular">Global IPTV</h1>
        <p>
          Live television from around the world
        </p>
      </div>

    </div>

    <div class="channel-count">
      <strong>${total.toLocaleString()}</strong>
      <span>Live Channels</span>
    </div>

    <div class="header-actions">
      <a
        href="https://github.com/babai93/giptv"
        class="header-action"
        title="GitHub"
        aria-label="GitHub"
        target="_blank"
        rel="noreferrer"
      >
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg" alt="GitHub" width="20" height="20">
      </a>
    </div>

  </header>

  <section class="filter-panel">

    <form id="filter-form">

      <div class="search-box">

        <span class="search-icon">⌕</span>

        <input
          type="text"
          name="search"
          class="modern-input"
          placeholder="Search channels..."
          value="${escapeHtml(search, true)}"
          autocomplete="off"
        >

      </div>

      <div class="country-picker">

        <input
          type="hidden"
          name="country"
          value="${escapeHtml(country, true)}"
        >

        <button
          type="button"
          id="country-picker-toggle"
          class="filter-control"
        >

          <span>

            ${country
              ? `
                  <img
                    src="${getFlagUrl(country)}"
                    alt="${escapeHtml(countryFlag(country), true)} flag"
                    width="20"
                    height="15"
                  >
                `
              : ''}

            ${escapeHtml(selectedCountryName)}

          </span>

          <span>🔻</span>

        </button>

        <div
          id="country-picker-menu"
          class="country-picker-menu"
          hidden
        >

          <button
            type="button"
            class="country-option"
            data-country=""
          >
            🌎 All countries
          </button>

          ${countryPickerOptions}

        </div>

      </div>

      <div class="category-picker">

        <input
          type="hidden"
          name="category"
          value="${escapeHtml(category, true)}"
        >

        <button
          type="button"
          id="category-picker-toggle"
          class="filter-control"
        >

          <span>
            ${category
              ? `${categoryIcon(categories[category] || category)} ${escapeHtml(categories[category] || category)}`
              : '📺 All categories'}
          </span>

          <span>🔻</span>

        </button>

        <div
          id="category-picker-menu"
          class="country-picker-menu"
          hidden
        >

          <button
            type="button"
            class="country-option"
            data-category=""
          >
            📺 All categories
          </button>

          ${categoryPickerOptions}

        </div>

      </div>

      <button
        class="search-button"
        type="submit"
      >
        Search
      </button>

      ${clearButton}

    </form>

  </section>

  <main>

    <div class="row gx-4">

      <div class="col-lg-5 mb-4">

        <div id="player-wrapper">

          <div
            data-shaka-player-container
            shaka-controls="true"
          >

            <video
              data-shaka-player
              id="video-player"
              autoplay
            ></video>

          </div>

          <div class="p-3 player-meta">

            <div
              class="d-flex align-items-center justify-content-between gap-2"
            >

              <div class="now-playing-info">

                <span class="now-label">
                  NOW PLAYING
                </span>

                <h5
                  id="now-playing-title"
                  class="m-0 text-truncate"
                  title="Select a channel to play"
                >
                  Select a channel to play
                </h5>

              </div>

              <small
                id="now-playing-status"
                class="text-muted status-text"
              >
                Waiting...
              </small>

            </div>

            <div
              id="now-playing-program"
              class="small text-light text-truncate mt-2"
              aria-live="polite"
            ></div>

          </div>

        </div>

      </div>

      <div class="col-lg-7">

        <div class="section-heading">

          <div>

            <span class="section-kicker">
              LIVE TV
            </span>

            <h2>
              ${search
                ? `Search results for "${escapeHtml(search)}"`
                : country
                  ? escapeHtml(selectedCountryName)
                  : category
                    ? escapeHtml(selectedCategoryName)
                    : 'Explore Channels'}
            </h2>

          </div>

          <span class="result-count">
            ${total.toLocaleString()} channels
          </span>

        </div>

        <div
          id="channel-list"
          class="row g-3"
        >
          ${cards}
        </div>

        <div id="pagination-container">
          ${pageLinks}
        </div>

      </div>

    </div>

  </main>

</div>

<script>
${clientScript()}
</script>

</body>

</html>`;
}

module.exports = {
  renderPage
};
