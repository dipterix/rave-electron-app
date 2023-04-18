// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts


const { contextBridge, ipcRenderer } = require('electron');
const { title } = require('process');


// tools

contextBridge.exposeInMainWorld('raveElectronAPI', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,

  showNotification: (body, title = "RAVE Notification") => {
    return ipcRenderer.invoke('notification:show', {
      title: title,
      body: body
    });
  },
  
  getSystemPath: () => {
    return ipcRenderer.invoke('R:getSystemPath');
  },

  getPathRscript: () => {
    return ipcRenderer.invoke('R:getPathRscript');
  },

  getRVersion: () => {
    return ipcRenderer.invoke('R:getVersion');
  },

  getPackageVersion: ( package ) => {
    return ipcRenderer.invoke('R:getPackageVersion', package);
  },

  selectDirectory: (args = {}) => {
    return ipcRenderer.invoke('path:select-directory', args);
  },
  selectFile: (args = {}) => {
    return ipcRenderer.invoke('path:select-file', args);
  },

  pathExists: (args) => {
    return ipcRenderer.invoke('path:exist', args);
  },

  getNCPUs: () => {
    return ipcRenderer.invoke('system:ncpus');
  },

  getOSType: () => {
    return ipcRenderer.invoke('system:osType');
  },

  evalRIsolate: ( script, block = true, jobId = undefined ) => {
    return ipcRenderer.invoke('R:evalRIsolate', {
      script: script,
      block : block,
      jobId : jobId
    });
  },

  evalRServer: ( script, block = true, jobId = undefined ) => {
    return ipcRenderer.invoke('R:evalServer', {
      script: script,
      block : block,
      jobId : jobId
    });
  },

  shutdownRServer: () => {
    return ipcRenderer.invoke('R:shutdownServer');
  },

  openExternalURL: (url) => {
    return ipcRenderer.invoke('shell:openExternal', url);
  },

  launchSSHRAVE: (config = {}) => {
    return ipcRenderer.invoke('remote:launchRAVE', config);
  },

  setAppSettings: (settings) => {
    return ipcRenderer.invoke('settings:set', settings);
  },
  getAppSettings: (keys) => {
    return ipcRenderer.invoke('settings:get', keys);
  },


  replaceTextById: (elementId, text) => {
    const element = document.getElementById(elementId);
    if (element) element.innerText = text;
  },

  replaceHtmlById: (elementId, text) => {
    const element = document.getElementById(elementId);
    if (element) element.innerHTML = text;
  },

  registerConsole: (terminalConsole) => {
    
    ipcRenderer.on('terminalConsole:setJobStatus', (_, message) => {
      const evt = new CustomEvent("setJobStatus", {
        detail: message
      });
      terminalConsole._el.dispatchEvent(evt);
    });
  }

  
})


