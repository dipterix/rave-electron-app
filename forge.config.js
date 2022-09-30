const fs = require('fs');
const path = require('path');

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
      switch (options.platform) {
        case "darwin":
          const appName = "rave-2.0.app";
          const targetPath = path.join("/Applications/RAVE/", appName);
          if(!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath)
          }
          
          fs.cpSync(
            path.join(options.outputPaths[0], appName), 
            targetPath,
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
    }
  }
}
