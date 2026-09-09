function attribute(source, name) {
  return source.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'))?.[1] || '';
}

function epgDate(value) {
  return String(value || '').replace(
    /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})/,
    '$1-$2-$3T$4:$5:$6$7'
  );
}

function textContent(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function escapeHtml(value, attributeValue = false) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": attributeValue ? '&#039;' : '&#39;'
  }[char]));
}

function countryFlag(code) {
  if (!/^[a-z]{2}$/i.test(code)) {
    return '';
  }

  return String.fromCodePoint(
    ...code.toUpperCase().split('').map((char) => char.charCodeAt(0) + 127397)
  );
}

function categoryIcon(categoryName) {
  const name = String(categoryName || '').toLowerCase();

  const icons = [
    [/news|current affairs/, '📰'],
    [/sport|football|cricket|tennis/, '🏆'],
    [/movie|film|cinema|series/, '🎬'],
    [/music|radio/, '🎵'],
    [/auto/, '🚗'],
    [/culture/, '🤲'],
    [/family/, '👨‍👩‍👧‍👦'],
    [/outdoor|adventure|relax|nature/, '🏕️'],
    [/lifestyle|health|fitness/, '💪'],
    [/kid|children|cartoon/, '🧸'],
    [/entertainment|comedy/, '🎭'],
    [/documentary|nature|wildlife/, '🌿'],
    [/shop/, '🛒'],
    [/animation|anime/, '🎨'],
    [/legislative/, '🏛️'],
    [/public|government/, '🏢'],
    [/cooking|food|culinary/, '🍳'],
    [/religious|religion/, '🙏'],
    [/business|finance/, '💼'],
    [/science|technology/, '🔬'],
    [/weather/, '🌤️'],
    [/shopping/, '🛍️'],
    [/travel/, '✈️'],
    [/series|drama/, '📺'],
    [/education|educational/, '🎓']
  ];

  return icons.find(([pattern]) => pattern.test(name))?.[1] || '📺';
}

function createPlaceholderUrl(channelName) {
  const name = String(channelName || 'Unknown').trim();
  const separator = name.length > 15 ? '%0A' : '+';
  const text = encodeURIComponent(name).replace(/%20/g, separator);

  return `https://placehold.co/150x80/080b10/EFEFEF?font=montserrat&text=${text}`;
}

function queryUrl(req, params = {}) {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return `${url.pathname}${url.search}`;
}

module.exports = {
  attribute,
  epgDate,
  textContent,
  escapeHtml,
  countryFlag,
  categoryIcon,
  queryUrl,
  createPlaceholderUrl
};
