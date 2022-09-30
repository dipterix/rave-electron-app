const storage = require('electron-json-storage');
const os = require('os');
const path = require('path');
const fs = require('fs');

const appSettingsCache = {};

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
  
  const promise = new Promise((resolve) => {
    if(appSettingsCache.hasOwnProperty(key)) {
      const v = appSettingsCache[key];
      if(v !== undefined) {
        resolve(v);
        return;
      }
    }
    ensureAppSettings()
    storage.has( key, (error, hasKey) => {
      if( error ) {
        resolve( is_missing );
        return;
      }
      
      if( hasKey ) {
        const v = storage.getSync(key);
        resolve( v );
        /*
        storage.get( key , (v) => {
          console.log(`asdasdasdasdadad ${key}: ${hasKey}  ${v}`);
          resolve( v );
        });
        */
      } else {
        resolve( is_missing );
      }
    })
  });
  return promise;
}

async function setAppSettings(key, value) {
  ensureAppSettings();
  appSettingsCache[key] = value;
  await storage.set( key, value );
}

exports.getAppSettings = getAppSettings;
exports.setAppSettings = setAppSettings;

