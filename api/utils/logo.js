const sharp = require('sharp');

const LOGO_DARK_CUTOFF = 50;
const logoCache = new Map();

async function getDarkPercentage(buffer) {
  const { data, info } = await sharp(buffer)
    .png()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let nonTransparentPixels = 0;
  let darkPixels = 0;

  for (let index = 0; index < data.length; index += info.channels) {
    const alpha = info.channels === 4 ? data[index + 3] : 255;

    if (alpha < 10) {
      continue;
    }

    nonTransparentPixels += 1;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    if (luminance < 50) {
      darkPixels += 1;
    }
  }

  return {
    totalPixels: nonTransparentPixels,
    darkPixels,
    darkPercentage: nonTransparentPixels ? ((darkPixels / nonTransparentPixels) * 100).toFixed(2) : '0.00'
  };
}

async function processLogo(url) {
  const key = String(url || '').trim();

  if (!key) {
    throw new Error('Missing logo URL');
  }

  if (logoCache.has(key)) {
    return logoCache.get(key);
  }

  const response = await fetch(key, {
    headers: {
      'User-Agent': 'Node-IPTV-App/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Logo request failed: HTTP ${response.status}`);
  }

  const inputBuffer = Buffer.from(await response.arrayBuffer());

  let processedBuffer;

  try {
    processedBuffer = await sharp(inputBuffer)
      .negate({ alpha: false })
      .png()
      .toBuffer();
  } catch (_error) {
    processedBuffer = await sharp(inputBuffer)
      .png()
      .toBuffer();
  }

  const cachedValue = {
    buffer: processedBuffer,
    contentType: 'image/png'
  };

  logoCache.set(key, cachedValue);

  return cachedValue;
}

module.exports = {
  processLogo
};
