const { Client } = require('ssh2');

const MAX_MESSAGES = 5000;

class RemoteSSH {

  _getRscript() {
    return new Promise((resolve, reject) => {
      let streamData = [];

      // Try to get random port
      this.conn.shell((err, stream) => {
        if( err ) {
          reject(err);
          return; 
        }

        stream.on('close', (code, signal) => {
          console.log('SSH Stream :: close :: code: ' + code + ', signal: ' + signal);

          const response = streamData.join("").split(/[^a-zA-Z0-9\\/\.\ +\-\(\)]+/g).map((v) => {
            return(v.trim())
          }).filter((v) => {
            return(v.includes("Rscript"))
          })
          if(response.length === 0) {
            reject(new Error("Cannot find Rscript binary file from the server. Make sure it's available in the path"));
          }
          this.rscript = response[response.length - 1];
          console.log(`Found Rscript path: ${this.rscript}`);
          resolve(this.rscript)

        }).on('data', (data) => {
          if( data ) {
            const buf = data.toString();
            streamData.push( buf );
          }
          
        }).end('which Rscript\nexit\n');


      })
    })
  }

  _getRAVEPort () {
    return new Promise((resolve, reject) => {
      if(this.RAVEPort != undefined) {
        resolve(this.RAVEPort);
        return;
      }
      let streamData = [];

      // Try to get random port
      this.conn.exec('"${this.rscript}" --no-save --no-restore -e "cat(httpuv::randomPort())"', (err, stream) => {
        if( err ) {
          reject(err);
          return; 
        }

        stream.on('close', (code, signal) => {
          console.log('SSH Stream :: close :: code: ' + code + ', signal: ' + signal);

          console.log(streamData);
          const msg = (/[0-9]+$/g).exec(streamData.join("").trim());
          const port = parseInt(msg);
          if(isNaN(port)) {
            reject(new Error("Unable to get free port on the server"));
            return;
          }
          console.log(`Launching RAVE instance on remote port: ${port}`);
          this.RAVEPort = port;
          resolve(port);
          return; 

        }).on('data', (data) => {
          if( data ) {
            console.log(data)
            streamData.push( data );
          }
          
        })

      })
    })
  }

  _startSession(host, port) {

    console.log(`Launching RAVE instance on remote server: http://${host}:${port}`);

    const cmd = `
"${this.rscript}" --no-save --no-restore -e '
ravedash::start_session(
  new = ${this.useNewSession ? "TRUE" : "NA"}, host = "${host}", port = ${port}, 
  jupyter = FALSE, as_job = FALSE, launch_browser = FALSE, single_session = FALSE
)
'`.split("\n").join("").trim();

    console.log(`SSH Server :: Running :: ${cmd}`);

    return new Promise((resolve, reject) => {

      this.conn.exec(cmd, (err, stream) => {
        if(err) { reject(err) }
        const processSSHStream = (data) => {
          const buff = data.toString();
          console.log(`SSH STDERR :: ${buff}`);
          this.RAVELogs.push( buff );
          if(this.RAVELogs.length > MAX_MESSAGES) {
            this.RAVELogs.shift();
          }
          if( this.RAVEPort !== undefined ) {
            // debug!!!
            resolve({
              host: this.conn.config.host,
              port: this.RAVEPort
            })
            this.resolved = true;
  /*
            buff.split("\n").forEach((buf) => {
              if( buf.trim().startsWith("createTcpServer: address already in use") ) {
                resolve({
                  host: this.conn.config.host,
                  port: this.RAVEPort
                })
                this.resolved = true;
              }
            });*/
          }
        };
  
        stream.on('close', () => {
          console.log('Stream :: close');
          if(!this.resolved) {
            reject("Remote program closed, but no RAVE instance was able to launch.")
          }
          this.disconnect();
        })
        .on('data', processSSHStream)
        .stderr.on('data', processSSHStream);
        
      });
    });

  }

  constructor(RAVEPort, useNewSession = false){
    this.conn = new Client();
    this.RAVEPort = RAVEPort;
    this.RAVELogs = [];
    this.useNewSession = useNewSession;
    this.closed = false;

    
    this.conn.on("close", () => {
      this.disconnect();
    });
  }

  connect(config) {
    /*
    config = {host: '127.0.0.1', port: 22, username: '???', password: '???' }
    */
    
    return new Promise((resolve, reject) => {

      this.conn.on('ready', async () => {

        // Connected to server
        console.log('SSH Client :: ready');

        
        try {
          const rscript = await this._getRscript();
          const port = await this._getRAVEPort();
          const host = this.conn.config.host;
          const re = await this._startSession(host, port, false)
          console.log(re)
          resolve(re);
        } catch (error) {
          reject(error);
        }
        return;
      })

      this.conn.on('error', (err) => {
        reject(err);
      });

      this.conn.connect(config);

    });
  }

  disconnect(destroy = true) {

    this.closed = true;

    if( this.RAVEPort ) {
      console.log(`Shutting down remote instance at port ${this.RAVEPort}`);
    }
    this.conn.end();

    if( destroy ) {
      this.conn.destroy();
    }
  }
}

async function launchRAVERemotely (config) {
  if( typeof config.host !== "string" ) {
    throw new TypeError("SSH host must be a string");
  }
  const sshConfig = {
    host: config.host,
    port: config.port || 22,
    username: config.username,
    password: config.password,
  };
  const inst = new RemoteSSH(
    config.RAVEPort, 
    config.newSession ? true : false
  );
  const info = await inst.connect(sshConfig);
  info.instance = inst;
  return info;
}

exports.remote = {
  launchRAVERemotely: launchRAVERemotely
};