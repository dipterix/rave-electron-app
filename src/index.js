const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
const contextMenu = require('electron-context-menu');
const { rcmd } = require("./utils/system-command");
const { remote } = require("./utils/remote-server");
const path = require('path');


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line global-require
 if (require('electron-squirrel-startup')) {
  app.quit();
}

class ExtendedBrowserWindow {
  constructor () {
    // We cannot require the screen module until the app is ready.
    const { screen } = require('electron');

    // Create a window that fills the screen's available work area.
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const minWidth = width > 800 ? 800 : width;
    const minHeight = height > 600 ? 600 : width;


    // Create the browser window.
    const mainWindow = new BrowserWindow({
      width: width,
      height: height,
      // useContentSize: true,
      title: "R Analysis & Visualization of iEEG",
      // titleBarStyle: "hiddenInset",
      titleBarOverlay: true,
      thickFrame: false,
      // frame: false,
      vibrancy: "content",

      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: true,
        enableRemoteModule: true,
      },
    });
    this.frame = mainWindow;
    mainWindow.setWindowButtonVisibility(true);
    mainWindow.setMinimumSize(minWidth, minHeight);
    // mainWindow.setBackgroundColor('#ccff99')

    contextMenu({
      window: mainWindow,
      prepend: (params, browserWindow) => [
        {
          label: 'Rainbow',
          // Only show it when right-clicking images
          visible: params.mediaType === 'image'
        },
        {
          role: "zoomIn"
        },
        {
            role: "zoomOut"
        },
        {
          role: "resetZoom"
        },
        {
          role: "editMenu"
        },
        {
          role: "reload"
        },
      ]
    });

    // and load the index.html of the app.
    mainWindow.loadFile(path.join(__dirname, 'welcome.html'));
    mainWindow.webContents.openDevTools();

    mainWindow.on('close', () => {
      this.finalize()
    });

    mainWindow.__instance = this;

    this.remoteInstances = [];
    this.sockerServer = rcmd.RSocketServer();
    
  }

  finalize() {
    this.remoteInstances.forEach(inst => {
      try {
        inst.disconnect();
      } catch (error) {
      }
    });

    this.shutdownSocketServer();
  }

  launchRAVERemotely(config) {
    const inst = remote.launchRAVERemotely(config);
    this.remoteInstances.push(inst);
    return inst;
  }

  shutdownSocketServer() {
    this.sockerServer.shutdownRSocketServer();
  }

  async evalRIsolate(script, block = true) {
    return await rcmd.evalRIsolate(script, block);
  }

  async evalServer(script, block = true) {
    return await this.sockerServer.executeRSocketServer(script, block);
  }

}

function getExtendedBWByFrameId(frameId) {
  const senderFrame = BrowserWindow.fromId(frameId);
  if( !senderFrame || !senderFrame.__instance) {
    return;
  }
  return senderFrame.__instance;
}


function createWindow () {
  return new ExtendedBrowserWindow();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  
  ipcMain.handle('R:getSystemPath', rcmd.getSystemPath);
  ipcMain.handle('R:getPathRscript', rcmd.find_rscript);
  ipcMain.handle('R:getVersion', rcmd.version);
  ipcMain.handle('R:getPackageVersion', async (_, arg) => {
    return await rcmd.package_version(arg);
  });

  ipcMain.handle('settings:set', (_, args) => {
    if(typeof args !== "object" || !args) { return; }
    for( let k in args ) {
      rcmd.setAppSettings( `app-custom-${k}`, args[k] );
    }
  });
  ipcMain.handle('settings:get', async (_, args) => {
    let re = {};
    if( typeof args === "string" ) {
      re[args] = await rcmd.getAppSettings(`app-custom-${args}`);
    } else if (Array.isArray(args)) {
      for(let i in args) {
        const k = args[i];
        re[k] = await rcmd.getAppSettings(`app-custom-${k}`);
      }
    }
    return re;
  });
  
  ipcMain.handle('R:evalRIsolate', async (evt, args) => {

    const frame = getExtendedBWByFrameId(evt.frameId);
    if( frame ) {
      const results = await frame.evalRIsolate(args.script, args.block);
      if( results && typeof results === "object" ) {
        results.process = undefined;
      }
      if( !args.block && typeof args.jobId === "string" ) {
        const sender = evt.sender;
  
        new Promise((r) => {
          const checkResult = () => {
            try {
              sender.send('terminalConsole:setJobStatus', {
                jobId : args.jobId,
                results: results
              });
              if( results && results.status === "started" ) {
                setTimeout(checkResult, 1000);
              } else {
                r(null);
              }
            } catch (error) {
              
            }
            
          }
          checkResult()
        }).catch(console.log);
        
      }
  
      return results;
    }

  });

  ipcMain.handle('R:evalServer', async (evt, args) => {
    const frame = getExtendedBWByFrameId(evt.frameId);
    if( frame ) {
      const results = await frame.evalServer(args.script, args.block);
      if( results && typeof results === "object" ) {
        results.process = undefined;
      }
      return results;
    }
  });

  ipcMain.handle('R:shutdownServer', async (evt) => {
    // return await rcmd.shutdownServer();
    const frame = getExtendedBWByFrameId(evt.frameId);
    if( frame ) {
      return await frame.shutdownSocketServer();
    }
  });

  ipcMain.handle('shell:openExternal', (_, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('notification:show', (_, args = {}) => {
    const body = args.body;
    if(typeof body !== "string") { return; }
    const title = args.title || "RAVE Notification";
    new Notification({ title: title, body: body }).show();
  });

  ipcMain.handle('remote:launchRAVE', async (evt, args = {}) => {
    const frame = getExtendedBWByFrameId(evt.frameId);
    if( frame ) {
      const jobId = args.jobId;
      
      const info = await frame.launchRAVERemotely(args);
      const inst = info.instance;
      if(inst.closed) { return; }

      const result = {
        status: "started",
        messages: inst.RAVELogs,
        get message() {
          return this.messages.join("");
        }
      };

      
      const checkResult = () => {
        
        try {
          const closed = inst.closed;
          result.status = closed ? "success" : "started";

          evt.sender.send('terminalConsole:setJobStatus', {
            jobId : args.jobId,
            results: result
          });
          if( !closed ) {
            setTimeout(checkResult, 1000);
          } else {
            return result;
          }
        } catch (error) {
          throw error;
        }
        
      }
      checkResult();
      
      return {
        host: info.host,
        port: info.port
      };
    }
  });

  

  
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {

  try {
    console.log("Shutting down R socket server...");
    rcmd.shutdownServer();
  } catch (error) {
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
