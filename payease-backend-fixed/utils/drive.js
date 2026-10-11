const Settings = require('../models/Settings');

let cachedDriveUrl = null;
let lastFetchTime = 0;

async function getDriveUrl() {
  const now = Date.now();
  if (cachedDriveUrl !== null && now - lastFetchTime < 60000) {
    return cachedDriveUrl;
  }
  try {
    const s = await Settings.findOne({ key: 'googleDriveUrl' });
    cachedDriveUrl = s?.value ? String(s.value).trim() : '';
    lastFetchTime = now;
  } catch (_) {
    cachedDriveUrl = '';
  }
  return cachedDriveUrl;
}

// Fast non-blocking Google Drive sync
function syncToGoogleDrive(payload) {
  getDriveUrl().then((url) => {
    if (!url) return;

    let targetUrl = url;
    if (url.includes('/macros/s/') && !url.endsWith('/exec')) {
      targetUrl = url.replace(/\/echo|\/edit.*$/, '/exec');
    }

    fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify(payload)
    }).catch((err) => {
      console.warn('Google Drive Sync Warning:', err.message);
    });
  }).catch(() => {});
}

module.exports = { syncToGoogleDrive, getDriveUrl };
