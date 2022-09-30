const storage = require('electron-json-storage');
const os = require('os');
const path = require('path');
const fs = require('fs');

function ensureAppSettings() {
  const uinfo = os.userInfo();
  const modulePath = path.join(uinfo.homedir, "rave_modules", "rave-app-settings");
  if( !fs.existsSync(modulePath) ) {
    fs.mkdirSync(modulePath, { recursive: true });
  }
  storage.setDataPath(modulePath);
  return modulePath;
}

function debug(msg) {
    console.debug(`[RAVE-DEBUG]: ${msg}`);
}

// initialize settings
function getAppSettings(key, is_missing = undefined) {
  ensureAppSettings()
  const promise = new Promise((resolve) => {
    storage.has( key, (error, hasKey) => {
      if( error ) {
        resolve( is_missing );
      }
      if( hasKey ) {
        const v = storage.getSync( key );
        resolve( v );
        return;
      }
      resolve( is_missing );
    })
  });
  return promise;
}

async function setAppSettings(key, value) {
  ensureAppSettings();
  await storage.set( key, value );
}

exports.getAppSettings = getAppSettings;
exports.setAppSettings = setAppSettings;

