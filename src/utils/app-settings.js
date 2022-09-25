const storage = require('electron-json-storage');

const app_settings = {};

function debug(msg) {
    console.debug(`[RAVE-DEBUG]: ${msg}`);
}

// initialize settings
function getAppSettings(key, is_missing = undefined) {
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
function setAppSettings(key, value) {
  storage.set( key, value );
}

exports.getAppSettings = getAppSettings;
exports.setAppSettings = setAppSettings;

