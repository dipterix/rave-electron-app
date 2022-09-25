// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts


const { contextBridge, ipcRenderer } = require('electron')


// tools

contextBridge.exposeInMainWorld('raveElectronAPI', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  

  getPathRscript: () => {
    return ipcRenderer.invoke('R:getPathRscript');
  },

  getRVersion: () => {
    return ipcRenderer.invoke('R:getVersion');
  },

  getPackageVersion: ( package ) => {
    return ipcRenderer.invoke('R:getPackageVersion', package);
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


