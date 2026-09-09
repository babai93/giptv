const fs = require('fs/promises');
const path = require('path');

async function readCache(filePath, encoding = 'utf8') {
  try {
    return await fs.readFile(filePath, encoding);
  } catch (_error) {
    return null;
  }
}

async function writeCache(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function isCacheValid(filePath, ttlMs) {
  if (!filePath || !ttlMs) {
    return false;
  }

  try {
    const stat = await fs.stat(filePath);
    return Date.now() - stat.mtimeMs < ttlMs;
  } catch (_error) {
    return false;
  }
}

module.exports = {
  readCache,
  writeCache,
  isCacheValid
};
