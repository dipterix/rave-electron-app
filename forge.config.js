const os = require('os');
const fs = require('fs');
const path = require('path');

const uinfo = os.userInfo();

module.exports = {
  packagerConfig: {
    icon: "src/www/favicon.ico",
    osxSign: {
      "identity": "Developer ID Application: Zhengjia Wang (9D3246MZK8)",
      "hardened-runtime": true,
      "entitlements": "entitlements.plist",
      "entitlements-inherit": "entitlements.plist",
      "signature-flags": "library"
    }
  },
  makers: [
    {
      "name": "@electron-forge/maker-squirrel",
      "config": {
        "name": "rave_2.0"
      }
    },
    {
      "name": "@electron-forge/maker-zip",
      "platforms": [
        "darwin"
      ] 
    },
    {
      "name": "@electron-forge/maker-deb",
      "config": {}
    },
    {
      "name": "@electron-forge/maker-rpm",
      "config": {}
    }
  ],
  hooks: {
    postPackage: async (forgeConfig, options) => {
      if (options.spinner) {
        options.spinner.info(`Completed packaging for ${options.platform} / ${options.arch} at ${options.outputPaths[0]}`);
      }
      try {
        switch (options.platform) {
          case "darwin":
            const appName = "rave-2.0.app";
  
            const targetPath = path.join(uinfo.homedir, "Downloads", "RAVE");
            
            
            if(!fs.existsSync(targetPath)) {
              fs.mkdirSync(targetPath)
            }
            const appDir = path.join(targetPath, appName);
            if(fs.existsSync(appDir)) {
              fs.rmSync(appDir, { recursive: true, force: true });
            }
            fs.mkdirSync(appDir)
            
            fs.cpSync(
              path.join(options.outputPaths[0], appName), 
              appDir,
              {
                force: true,
                recursive: true,
                verbatimSymlinks: false,
                dereference: false
              }
            );
            break;
        
          default:
            break;
        }
      } catch (error) {
        
      }
      
    }
  }
}
