const { Client } = require('ssh2');

class RemoteSSH {

  _getRAVEPort () {
    return new Promise((resolve, reject) => {
      if(this.RAVEPort != undefined) {
        resolve(this.RAVEPort);
        return;
      }
      let streamData = [];

      // Try to get random port
      this.conn.exec('/usr/local/bin/Rscript --no-save --no-restore -e "cat(httpuv::randomPort())"', (err, stream) => {
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
/usr/local/bin/Rscript --no-save --no-restore -e '
ravedash::start_session(
  new = ${this.useNewSession ? "TRUE" : "NA"}, host = "${host}", port = ${port}, 
  jupyter = FALSE, as_job = FALSE, launch_browser = FALSE, single_session = TRUE
)
'`.split("\n").join("").trim();

    console.log(`SSH Server :: Running :: ${cmd}`);

    return new Promise((resolve, reject) => {

      this.conn.exec(cmd, (err, stream) => {
        if(err) {
          reject(err);
          return;
        }

        this.__stream = stream;
        stream.on('close', (code, signal) => {
          console.log('SSH Client :: Disconnecting remote server...');
          
          resolve();
          stream.end();
          this.disconnect()
        })
        stream.on('data', (data) => {
          const buff = data.toString()
          console.log(`SSH STDOUT :: ${buff}`);
          this.RAVELogs.push( buff );
          if(this.RAVELogs.length > 5000) {
            this.RAVELogs.shift();
          }
        });
        stream.stderr.on('data', (data) => {
          const buff = data.toString()
          console.log(`SSH STDERR :: ${buff}`);
          this.RAVELogs.push( buff );
          if(this.RAVELogs.length > 5000) {
            this.RAVELogs.shift();
          }
        })

        

      });
    });

  }

  constructor(RAVEPort, useNewSession = false){
    this.conn = new Client();
    this.RAVEPort = RAVEPort;
    this.RAVELogs = [];
    this.useNewSession = useNewSession;
    this.closed = false;

    this.conn
      .on('ready', async () => {

        // Connected to server
        console.log('SSH Client :: ready');

        const port = await this._getRAVEPort();
        const host = this.conn.config.host;
        
        this._startSession(host, port, false);
      })

  }

  connect(config) {
    /*
    config = {
      host: '127.0.0.1',
      port: 22,
      username: '???',
      password: '???'
    }
    */
    
    return new Promise((resolve, reject) => {

      this.conn.on("error", (err) => {
        this.disconnect();
        reject(err);
        this.errored = true;
      })

      this.conn.connect(config);

      const check = () => {
        if( this.errored || this.closed ) { return; }
        if ( this.RAVEPort === undefined ) {
          setTimeout(check, 1000);
        } else {
          resolve({
            host: this.conn.config.host,
            port: this.RAVEPort
          })
          return;
        }
      }
      check();
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