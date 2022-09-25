const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const contextMenu = require('electron-context-menu');
const { rcmd } = require("./utils/system-command");
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line global-require
if (require('electron-squirrel-startup')) {
  app.quit();
}



function createWindow () {
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
      enableRemoteModule: true,
    },
  });
  mainWindow.setWindowButtonVisibility(true);
  mainWindow.setMinimumSize(minWidth, minHeight);
  mainWindow.setBackgroundColor('#ccff99')

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'welcome.html'));
  mainWindow.webContents.openDevTools();

  mainWindow.on('close', function() {
    console.log("Shutting down R socket server...");
    rcmd.shutdownServer();
  });

  

  /*
  rcmd.run(`shidashi::adminlte_sidebar('/Users/dipterix/Dropbox (PENN Neurotrauma)/dipterix/projects/rave-pipelines')`)
    .then((results) => {
      console.log(results);
    })
  


  /*
  const view = new BrowserView({
    webPreferences: {
      spellcheck: true,
    },
  });

  /*
  // Add an item to the context menu that appears only when you click on an image
  contextMenu({
    window: view,
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
  */

  // mainWindow.addBrowserView(view);
  // const yPos = 0; // 27;
  // view.setBounds({ x: 0, y: yPos, width: width, height: height - yPos });

  // mainWindow.on('resize', (evt) => {

  //   // the setTimeout is necessary because it runs after the event listener is handled
  //   lastHandle = setTimeout(() => {
  //     if (lastHandle != null) clearTimeout(lastHandle);
  //     // view.setBounds(view.getBounds());
  //     const dimensions = mainWindow.getSize();
  //     view.setBounds({ x: 0, y: yPos, width: dimensions[0], height: dimensions[1] - yPos });
  //   });
  // });



  // view.webContents.loadURL('http://127.0.0.1:17283');
  // view.webContents.loadFile(path.join(__dirname, 'index.html'));
  // Open the DevTools.
  // view.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  ipcMain.handle('R:getPathRscript', rcmd.find_rscript);
  ipcMain.handle('R:getVersion', rcmd.version);
  ipcMain.handle('R:getPackageVersion', async (_, arg) => {
    return await rcmd.package_version(arg);
  });
  
  ipcMain.handle('R:evalRIsolate', async (evt, args) => {
    const results = await rcmd.evalRIsolate(args.script, args.block);
    if( results && typeof results === "object" ) {
        results.process = undefined;
    }
    if( !args.block && typeof args.jobId === "string" ) {
      const sender = evt.sender;

      new Promise((r) => {
        const checkResult = () => {
          sender.send('terminalConsole:setJobStatus', {
            jobId : args.jobId,
            results: results
          });
          if( results && results.status === "started" ) {
            setTimeout(checkResult, 1000);
          } else {
            r(null);
          }
        }
        checkResult()
      }).catch(console.log);
      
    }

    return results;
  });

  ipcMain.handle('R:evalServer', async (_, args) => {
    const results = await rcmd.evalServer(args.script, args.block);
    if( results && typeof results === "object" ) {
      results.process = undefined;
    }
    return results;
  });

  ipcMain.handle('R:shutdownServer', async () => {
    return await rcmd.shutdownServer();
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
