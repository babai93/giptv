const { escapeHtml } = require('../utils/helpers');

function clientScript() {
  return `
const video = document.getElementById('video-player');
const titleEl = document.getElementById('now-playing-title');
const statusEl = document.getElementById('now-playing-status');
const programEl = document.getElementById('now-playing-program');

let shakaPlayer;
let pendingStream;

function updateProgram(name) {
  const safeName = String(name || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  programEl.innerHTML = safeName
    ? '<img src="/video.svg" alt="Now Playing"> ' + safeName
    : '';
}

async function loadStream(url, streamCandidates = []) {
  if (!shakaPlayer) {
    pendingStream = {
      url,
      streamCandidates
    };
    return;
  }

  try {
    statusEl.textContent = 'Connecting...';
    statusEl.className = 'text-info';

    await shakaPlayer.load(url);

    statusEl.textContent = 'Live';
    statusEl.className = 'text-success live-status';
  } catch (error) {
    console.error(error);

    const candidates = Array.isArray(streamCandidates) && streamCandidates.length
      ? streamCandidates
      : [url];

    const currentIndex = candidates.indexOf(url);

    if (currentIndex >= 0 && currentIndex < candidates.length - 1) {
      statusEl.textContent = 'Trying alternate stream...';
      statusEl.className = 'text-warning';
      return loadStream(candidates[currentIndex + 1], candidates);
    }

    statusEl.textContent = 'Stream unavailable';
    statusEl.className = 'text-danger';
  }
}

async function init() {
  const ui = video.ui;

  if (!ui) {
    statusEl.textContent = 'Player unavailable';
    return;
  }

  shakaPlayer = ui.getControls().getPlayer();

  shakaPlayer.addEventListener('error', () => {
    statusEl.textContent = 'Stream unavailable';
    statusEl.className = 'text-danger';
  });

  if (pendingStream) {
    const stream = pendingStream;
    pendingStream = null;
    loadStream(stream.url, stream.streamCandidates || [stream.url]);
  }
}

document.addEventListener('shaka-ui-loaded', init);

const countryPicker = document.getElementById('country-picker-toggle');
const countryMenu = document.getElementById('country-picker-menu');

function getFlagUrl(code) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const flagCode = normalizedCode === 'UK' ? 'GB' : normalizedCode;
  return 'https://flagcdn.com/20x15/' + flagCode.toLowerCase() + '.png';
}

if (countryPicker && countryMenu) {
  countryPicker.addEventListener('click', () => {
    countryMenu.hidden = !countryMenu.hidden;
  });

  countryMenu.addEventListener('click', (event) => {
    const option = event.target.closest('.country-option');

    if (!option) {
      return;
    }

    const code = option.dataset.country;
    const form = countryPicker.closest('form');
    const hidden = form.querySelector('[name="country"]');

    hidden.value = code;

    countryPicker.querySelector('span').innerHTML = code
      ? '<img src="' + getFlagUrl(code) + '" alt="Country flag" width="20" height="15"> ' + option.textContent.trim()
      : '🌎 All countries';

    countryMenu.hidden = true;
  });

  document.addEventListener('click', (event) => {
    if (!countryPicker.contains(event.target) && !countryMenu.contains(event.target)) {
      countryMenu.hidden = true;
    }
  });
}

const categoryPicker = document.getElementById('category-picker-toggle');
const categoryMenu = document.getElementById('category-picker-menu');

if (categoryPicker && categoryMenu) {
  categoryPicker.addEventListener('click', () => {
    categoryMenu.hidden = !categoryMenu.hidden;
  });

  categoryMenu.addEventListener('click', (event) => {
    const option = event.target.closest('.country-option');

    if (!option) {
      return;
    }

    const categoryId = option.dataset.category || '';
    const form = categoryPicker.closest('form');
    const hidden = form.querySelector('[name="category"]');

    hidden.value = categoryId;

    categoryPicker.querySelector('span').innerHTML = categoryId
      ? option.innerHTML
      : '📺 All categories';

    categoryMenu.hidden = true;
  });

  document.addEventListener('click', (event) => {
    if (!categoryPicker.contains(event.target) && !categoryMenu.contains(event.target)) {
      categoryMenu.hidden = true;
    }
  });
}

async function loadPage(url, updateHistory = true) {
  const channelList = document.getElementById('channel-list');
  const pagination = document.getElementById('pagination-container');

  channelList.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch(url, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (!response.ok) {
      throw new Error('Page request failed');
    }

    const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');

    const nextList = documentFragment.getElementById('channel-list');
    const nextPagination = documentFragment.getElementById('pagination-container');
    const nextChannelCount = documentFragment.querySelector('.channel-count');
    const nextResultCount = documentFragment.querySelector('.result-count');
    const nextSectionTitle = documentFragment.querySelector('.section-heading h2');

    const currentChannelCount = document.querySelector('.channel-count');
    const currentResultCount = document.querySelector('.result-count');
    const currentSectionTitle = document.querySelector('.section-heading h2');

    const currentClearButton = document.querySelector('#filter-form .clear-button');
    const nextClearButton = documentFragment.querySelector('#filter-form .clear-button');

    if (!nextList || !nextPagination) {
      throw new Error('Missing page content');
    }

    channelList.innerHTML = nextList.innerHTML;
    pagination.replaceWith(nextPagination);

    if (nextChannelCount && currentChannelCount) {
      currentChannelCount.innerHTML = nextChannelCount.innerHTML;
    }

    if (nextResultCount && currentResultCount) {
      currentResultCount.textContent = nextResultCount.textContent;
    }

    if (nextSectionTitle && currentSectionTitle) {
      currentSectionTitle.textContent = nextSectionTitle.textContent;
    }

    if (currentClearButton && !nextClearButton) {
      currentClearButton.remove();
    } else if (!currentClearButton && nextClearButton) {
      document.getElementById('filter-form').append(nextClearButton);
    }

    if (updateHistory) {
      history.pushState({}, '', url);
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  } catch (error) {
    console.error(error);
    location.href = url;
  } finally {
    channelList.removeAttribute('aria-busy');
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('#pagination-container a.page-link,#filter-form a.clear');

  if (!link) {
    return;
  }

  event.preventDefault();
  loadPage(link.href);
});

function playStream(url, name, id, program, streamUrls = [], scroll = true) {
  const cleanedName = String(name || '')
    .replace(/\s*\((\d{3,4}[pi])\)(?:\s*\[[^\]]+\])*\s*$/i, '')
    .trim();

  const candidates = Array.isArray(streamUrls) && streamUrls.length
    ? streamUrls
    : [url].filter(Boolean);

  titleEl.textContent = cleanedName;
  titleEl.title = cleanedName;

  statusEl.textContent = 'Connecting...';
  statusEl.className = 'text-info';

  updateProgram(program);

  sessionStorage.setItem('iptv-current-stream', JSON.stringify({
    url: candidates[0] || url,
    name: cleanedName,
    id,
    program,
    streamUrls: candidates
  }));

  if (scroll) {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  loadStream(candidates[0] || url, candidates);
}

document.getElementById('filter-form').addEventListener('submit', (event) => {
  event.preventDefault();

  const url = new URL(location.href);
  url.search = new URLSearchParams(new FormData(event.target));
  url.searchParams.set('page', '1');

  loadPage(url.toString());
});

window.addEventListener('popstate', () => {
  loadPage(location.href, false);
});

const saved = sessionStorage.getItem('iptv-current-stream');

if (saved) {
  try {
    const stream = JSON.parse(saved);

    if (stream.url && stream.name) {
      playStream(
        stream.url,
        stream.name,
        stream.id,
        stream.program || '',
        stream.streamUrls || [stream.url],
        false
      );
    }
  } catch (error) {
    sessionStorage.removeItem('iptv-current-stream');
  }
}
`;
}

module.exports = {
  clientScript
};
