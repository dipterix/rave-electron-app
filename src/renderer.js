
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function makeid(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() *
          charactersLength));
  }
  return result;
}

class Notification {
  constructor() {}

  showNotification(body, args = {}) {
    const title = args.title || "RAVE Notification"
    const useSystem = args.useSystem;
    const ntype = args.type;

    if( useSystem ) {
      raveElectronAPI.showNotification(body, title);

      return;
    } else {
      const toastId = `toast-notification-${makeid(10)}`;

      let toastClass = "bg-default";
      if( typeof ntype === "string" ) {
        switch (ntype) {
          case "info":
            toastClass = "bg-info";
            break;
          case "success":
            toastClass = "bg-success";
            break;
          case "warning":
            toastClass = "bg-warning";
            break;
          case "error":
          case "danger":
            toastClass = "bg-danger";
            break;
          case "fatal":
            toastClass = "bg-maroon";
            break;
          default:
            break;
        }
      }

      const toastArgs = {
        position: typeof args.position === "string" ? args.position : "topRight",
        fixed: args.fixed === false ? false : true,
        autohide: args.autohide === false ? false : true,
        delay : args.delay || 2000,
        autoremove: true,
        fade: args.fade === false ? false : true,
        title : title,
        subtitle: args.subtitle || null,
        close: true,
        body: body,
        class: `${toastId} ${toastClass} fill-width ${args.class || ""}`,
      }
      
      $(document).Toasts("create", toastArgs );

      return toastId;
      
    }
    
  }

  hideNotification(toastId) {
    if( typeof toastId !== "string" || toastId.length == 0 ) {
      // hide all
      $(`.toast`).toast('hide');
    } else {
      $(`.toast.${toastId}`).toast('hide');
    }
    
  }

}

class TerminalConsole {
  constructor (element, inputElement, maxItems=1000){
    this._el = document.createElement("div");
    this._jobs = {};
    this.maxItems = maxItems;
    this.element = element;
    this.inputElement = inputElement;
    this.items = [];
    this.scripts = [];
    this.scriptIdx = -1;

    this.inputElement.addEventListener('keyup', (evt) => {
      if ( (evt.key === 'Enter' || evt.keyCode === 13) && this.inputElement.value.length > 0 ) {
        this.scripts.push( this.inputElement.value );
        this.scriptIdx = -1;
        this.evalR( this.inputElement.value );
        this.inputElement.value = "";
      } else if ( (evt.key === 'ArrowUp' || evt.keyCode === 38) && this.scripts.length > 0 ) {
        this.scriptIdx--;
        if( this.scriptIdx < 0 ) {
          this.scriptIdx = this.scripts.length - 1;
        }
        this.inputElement.value = this.scripts[this.scriptIdx];
      } else if( (evt.key === 'ArrowDown' || evt.keyCode === 40) && this.scripts.length > 0 ) {
        this.scriptIdx++;
        if( this.scriptIdx >= this.scripts.length ) {
          this.scriptIdx = -1;
          this.inputElement.value = "";
        } else {
          this.inputElement.value = this.scripts[this.scriptIdx];
        }
      }
    });

    this._el.addEventListener("setJobStatus", (evt) => {
      const msg = evt.detail;
      if( ! msg ) { return; }
      this.setJobStatus(msg.jobId, msg.results);
    })
    raveElectronAPI.registerConsole(this);

  }
  
  addItem (text, textType, renderNow=true, dryRun=false) {
    let msg = text;
    let cls = "hljs-comment";
    let ty = textType;
    if(ty === "command") {
      cls = "hljs-literal";
      msg = `>> ${text}`
    } else if (ty === "error") {
      cls = "hljs-keyword";
    } else if (ty === "info") {
      cls = "hljs-number";
    } else {
      ty = "normal"
    }

    let wrapper, el;
    if(ty === "command") {
      el = document.createElement("span");
      el.className = `pl-2 pr-2 pt-0 pb-0 m-0 code ${cls}`;
      el.innerText = msg.split("\n").join("\n  >> ");
      wrapper = document.createElement("details");
      wrapper.className=`p-0 m-0`
      wrapper.setAttribute("open", "");
      const summary = document.createElement("summary");
      summary.style="white-space: pre;";
      summary.className="code p-0 m-0";
      summary.appendChild(el);
      wrapper.appendChild(summary);
    } else {
      el = document.createElement("code");
      el.className = `p-0 m-0`;
      el.innerText = msg;

      wrapper = document.createElement("pre");
      wrapper.className = `pl-2 pr-2 pt-0 pb-0 m-0 ${cls}`;
      wrapper.appendChild(el);
    }

    const re = {
      textType  : ty,
      className : cls,
      text      : text,
      wrapper   : wrapper,
      element   : el
    };
    if( !dryRun ) {
      this.items.push(re);
      if( this.items.length > this.maxItems ) {
        this.items.shift();
      }
      if( renderNow ) {
        this.render()
      }
    }
    return re;
  }

  addItems (items, renderNow = true) {
    if(!items) { return; }
    if(!Array.isArray(items)) {
      throw new TypeError("TerminalConsole: addItems(items): items must be an array");
    }
    items.forEach((item) => {
      if( typeof item === "string" ) {
        this.addItem( item, "normal", false );
      } else if (Array.isArray(item)) {
        this.addItem( item[0], item.length > 1 ? item[1] : "normal" , false );
      } else {
        this.addItem( item.text, item.textType, false )
      }
    })
    if( renderNow ) {
      this.render()
    }
  }

  render() {
    this.element.textContent = '';
    this.items.forEach((item) => {
      this.element.appendChild(item.wrapper);
    })
  }


  async evalR(script, args = {
    isolate : false,
    block : true,
    jobId : undefined
  }) {

    const args2 = Object.assign({ resultPlaceholder: args.resultPlaceholder || "# Running..." }, args);
    const block = args2.block === false ? false : true;
    const item = this.addNoneBlockingStatus(script, args2);
    
    let result;
    if( args2.isolate ) {
      result = await raveElectronAPI.evalRIsolate(script, block, args2.jobId);
    } else {
      result = await raveElectronAPI.evalRServer(script, block, args2.jobId);
    }
    item.result = result;
    return item;
  }

  addNoneBlockingStatus(comment, args = {}) {
    const leaveOpen = args.leaveOpen !== true ? false : true;
    const opened = this.isOpen();
    const jobId = args.jobId;

    const item = this.addItem(comment, "command");
    const itemResults = this.addItem( args.resultPlaceholder || "# (No results captured)", "normal", false, true );
    item.wrapper.appendChild( itemResults.wrapper );

    const onFinish = () => {
      console.log("finalizing")
      if( !(leaveOpen || opened) ) {
        this.close();
      }
      if( typeof jobId === "string" && this._jobs[jobId] === this ) {
        delete this._jobs[jobId];
      }
      if( typeof args.onFinish === "function" ) {
        args.onFinish();
      }
    }

    const re = {
      outputElement: itemResults.element,
      _finished: false,
      _caveat : args.caveat,
      _result: {},

      get finished () {
        return this._finished;
      },
      set finished (v) {
        if( this._finished ) {
          return true;
        }
        this._finished = v;
        if( this._finished ) {
          onFinish();
        }
        return v
      },

      get result () {
        return this._result;
      },
      set result (v) {
        let msg = this.outputElement.innerText;
        if( v && v.status ) {
          this._result = v;
          msg = v.message;
          switch (v.status) {
            case "inited":
            case "started":
              msg = `${msg}\nStill running...`;
              break;
            case "success":
              this.finished = true;
              break;
            default:
              this.finished = true;
              break;
          }
        }
        if( this.finished ) {
          const s = this.caveat;
          if( s ) {
            msg = `${msg}\n${s}`;
          }
        }
        this.outputElement.innerText = msg;
        if( this.resultStatus === "error" ) {
          this.outputElement.className = "p-0 m-0 hljs-keyword";
        }
        
        return v;
      }, 

      get resultStatus () {
        return this._result.status || "inited";
      },
      
      get caveat () {
        if( !this._caveat || !this._result ) { return }
        let s = `== ${this._result.status}: ${this._caveat}`;
        const rem = 79 - s.length;
        if(rem > 0) {
          s = `${s} ${"=".repeat(rem)}`;
        }
        return s;
      }

    };

    if( typeof jobId === "string" ) {
      this._jobs[jobId] = re;
    }

    return re;
  }

  isOpen() {
    return document.body.classList.contains("terminal-open") ? true : false;
  }
  open() {
    if( !this.isOpen() ) {
      document.body.classList.add("terminal-open");
    }
  }
  close() {
    if( this.isOpen() ) {
      document.body.classList.remove("terminal-open");
    }
  }

  setJobStatus(jobId, resultObj) {
    
    const jobDetails = this._jobs[jobId];
    if(!jobDetails || typeof jobDetails !== "object" ) { return; }
    if( jobDetails.finished ) {
      delete this._jobs[jobId];
      return;
    }
    jobDetails.result = resultObj;
  }

  addRJob(script, args = {}) {

    const shutdownServer = (args.isolate && args.shutdownServer) ? true : false;
    this.open();
    

    const p1 = new Promise((resolve, reject) => {
      if( shutdownServer ) {
        raveElectronAPI.shutdownRServer()
          .then(resolve)
          .catch((e) => {
            console.log("Unable to shutdown R socket server... Start isolated job anyway.");
            resolve();
          })
      } else {
        resolve()
      }
    })
    
    return new Promise((resolve, reject) => {
      p1.then(() => {
        const args2 = Object.assign({ jobId : makeid(10) }, args);
        this.evalR(script, args2).then(resolve);
      })
    });
  }

  async addSSHJob(config) {
    // {host: "127.0.0.1", username: "tester", password: "#Matrix9191"}
    const jobId = makeid(11);
    const args2 = Object.assign({
      resultPlaceholder: config.resultPlaceholder || "# Launching RAVE from remove server...",
      jobId: jobId
    }, config);
    const item = this.addNoneBlockingStatus(`# Connecting to remote server at: ${config.host}`, args2);
    this.open();
    try {
      const info = await raveElectronAPI.launchSSHRAVE(args2);
      if( info && info.host && info.port ) {
        const url = `http://${info.host}:${info.port}`;
        raveElectronAPI.openExternalURL(url);
        notification.showNotification(
          `Instance launched at <a href="${url}" target="_blank">${url}</a>`,
          {
            title: "Launching RAVE from remote server",
            type: "success",
          }
        )
      } else {
        throw new Error("Unable to obtain the session information from the server.")
      }
      
    } catch (error) {
      notification.showNotification(
        `Unable to launch RAVE on the remote server. <br />${error.message}`,
        {
          title: "Launching RAVE from remote server",
          type: "error",
          delay: 5000
        }
      )
      this.setJobStatus(jobId, {
        status: "error",
        message: error.toString()
      });
      this.close();
      
    }
    
    
    return item;
  }
}

class ModalDialog {
  constructor() {
    this.primaryCallback = null;
    this.displayCallback = null;
  }

  ensureModal() {
    if(this.$wrapper) { return true; }
    const $wrapper = $("#globalModal.modal");
    if( $wrapper.length === 0 ) { return false; }
    this.$wrapper = $wrapper;

    this.$title = this.$wrapper.find("#modal-title");
    this.$body = this.$wrapper.find("#modal-body");
    this.$secondaryBtn = this.$wrapper.find("#modal-close-button");
    this.$primaryBtn = this.$wrapper.find("#modal-confirm-button");

    this.$primaryBtn.on("click", (evt) => {
      evt.preventDefault();
      if( typeof this.primaryCallback === "function" ) {
        this.primaryCallback();
      }
      // this.$wrapper.modal("hide");
    })

    this.$wrapper.on("shown.bs.modal", () => {
      if( typeof this.displayCallback === "function" ) {
        this.displayCallback();
      }
    })
    

    return true;
  }

  removeModal() {
    if(!this.ensureModal()) { return; }
    this.$wrapper.modal("hide");
    this.primaryCallback = null;
  }

  setPrimaryCallback(callback) {
    if( typeof callback === "function" ) {
      this.primaryCallback = callback;
    } else {
      this.primaryCallback = null;
    }
  }


  showModal(title, body, primaryBtn, secondaryBtn, onConfirmed, onShown) {
    if(!this.ensureModal()) { return; }

    this.$title.text(title);
    this.$body.html(body);

    let primaryBtnText = "OK";
    let primaryBtnShow = true;
    let primaryBtnClass = "btn-primary";
    if( !primaryBtn ) {
      primaryBtnShow = false;
    } else if( typeof primaryBtn === "string" ) {
      primaryBtnText = primaryBtn;
    } else {
      primaryBtnText = primaryBtn.text || primaryBtn.label || "OK";
      primaryBtnShow = primaryBtn.show === false ? false : true;
      primaryBtnClass = primaryBtn.class || primaryBtnClass;
    }

    this.$primaryBtn[0].className = `btn ${primaryBtnShow ? " " : "hidden "}${primaryBtnClass}`;
    this.$primaryBtn.html(primaryBtnText);

    let secondaryBtnText = "OK";
    let secondaryBtnShow = true;
    let secondaryBtnClass = "btn-secondary";
    if( !secondaryBtn ) {
      secondaryBtnShow = false;
    } else if( typeof secondaryBtn === "string" ) {
      secondaryBtnText = secondaryBtn;
    } else {
      secondaryBtnText = secondaryBtn.text || secondaryBtn.label || "OK";
      secondaryBtnShow = secondaryBtn.show === false ? false : true;
      secondaryBtnClass = secondaryBtn.class || secondaryBtnClass;
    }

    this.$secondaryBtn[0].className = `btn ${secondaryBtnShow ? " " : "hidden "}${secondaryBtnClass}`;
    this.$secondaryBtn.html(secondaryBtnText);

    this.setPrimaryCallback(onConfirmed);
    if( typeof onShown === "function" ) {
      this.displayCallback = onShown;
    } else {
      this.displayCallback = null;
    }

    this.$wrapper.modal("show");

  }
}

async function updateSystemStatus () {

  
  try {

    // System path
    const sysPath = await raveElectronAPI.getSystemPath();

    raveElectronAPI.replaceTextById("output-system-path", sysPath.split(/[;\:]/g).join("\n"));
    
  } catch (error) {
    raveElectronAPI.replaceHtmlById("output-system-path", error);
  }

  try {

    // Rscript path & version
    const rscript = await raveElectronAPI.getPathRscript();
    const rver = await raveElectronAPI.getRVersion();

    raveElectronAPI.replaceTextById("output-rscript-path", rscript);
    // raveElectronAPI.replaceHtmlById("output-rscript-path", "(Not found) Please download R from https://cran.r-project.org/");
    raveElectronAPI.replaceHtmlById("output-rscript-path-status", `<span class="badge bg-success">${rver}</span>`);

    appInfo.rscript_path = rscript;
    appInfo.r_version = rver;

  } catch (error) {
    raveElectronAPI.replaceHtmlById("output-rscript-path", "(Not found) Please download R from https://cran.r-project.org/");
    raveElectronAPI.replaceHtmlById("output-rscript-path-status", `<span class="badge bg-danger">Unknown</span>`);
  }

  const check_package = async (package, elementId) => {

    try {
      if( appInfo.r_version === undefined ) {
        throw new Error("Cannot find R executable");
      }
      const ver = await raveElectronAPI.getPackageVersion( package );
      appInfo.library[package] = {
        version: ver
      };
      raveElectronAPI.replaceHtmlById(elementId, `<span class="badge bg-info">${package} (${ver})</span>`);
    } catch (error) {
      raveElectronAPI.replaceHtmlById(elementId, `<span class="badge bg-danger">${package} (Not found!)</span>`);
      throw error;
    }
  }
  // check ravemanager
  check_package( 'rave', "output-rave-version" );
  check_package( 'ravemanager', "output-ravemanager-version" );
  check_package( 'raveio', "output-raveio-version" );
  check_package( 'ravedash', "output-ravedash-version" );
  check_package( 'ravetools', "output-ravetools-version" );
  check_package( 'ravebuiltins', "output-ravebuiltins-version" );
  check_package( 'threeBrain', "output-threeBrain-version" );
  check_package( 'dipsaus', "output-dipsaus-version" );
  check_package( 'filearray', "output-filearray-version" );
  check_package( 'shidashi', "output-shidashi-version" );
  check_package( 'rpymat', "output-rpymat-version" );

  const rave_updateopt = (opt, isInput = false) => {
    const elementId = `output-raveopt-${opt}`
    return new Promise((resolve, reject) => {
      if( appInfo.r_version === undefined ) {
        reject(new Error("Cannot find R executable"));
      }
      raveElectronAPI.evalRIsolate(`cat(raveio::raveio_getopt("${opt}"))`)
        .then((res) => {
          if( isInput ) {
            document.getElementById(elementId).value = res.message;
          } else {
            raveElectronAPI.replaceHtmlById(elementId, res.message);
          }
          resolve(res.message);
        })
        .catch((err) => {
          if( isInput ) {
            document.getElementById(elementId).value = "";
          } else {
            raveElectronAPI.replaceHtmlById(elementId, "");
          }
          reject(err);
        })
    });
  }
  const rave_setopt = (opt, readableName, callback = () => {}) => {
    const elementId = `output-raveopt-${opt}`
    const $elementId = document.getElementById(elementId);
    if($elementId) {
      $elementId.addEventListener("click", () => {
        raveElectronAPI.selectDirectory({
          title: `Choose a directory for ${readableName}`,
          defaultPath: $elementId.innerText || "~/",
          properties: ["createDirectory", "openDirectory"],
        }).then((v) => {
          if(!Array.isArray(v) || v.length === 0) { return; }
          const p = v[0];
          // check if this is a legit path
          if( raveElectronAPI.pathExists({ path: p, type: "directory" }) ) {
            // set raveoptions
            raveElectronAPI.evalRIsolate(`raveio::raveio_setopt("${opt}", "${p}")`)
              .then(() => {
                rave_updateopt(opt).then((p2) => {
                  notification.showNotification(
                    `[${readableName}] is set to [${p2}].`,
                    {
                      title: "RAVE Settings",
                      type: "success",
                      delay: 2000
                    }
                  )
                  callback()
                })
              })
            
          } else {
            notification.showNotification(
              `Cannot set [${readableName}]. Reason: path [${p}] does not exists as a directory`,
              {
                title: "RAVE Settings",
                type: "error"
              }
            )
          }
        });
      })
    }
  }
  rave_updateopt("data_dir");
  rave_setopt("data_dir", "Main data repository");
  rave_updateopt("raw_data_dir");
  rave_setopt("raw_data_dir", "Raw data repository");
  rave_updateopt("tensor_temp_path");
  rave_setopt("tensor_temp_path", "Session path", updateSessionList);

  let nWorkers = 1;
  rave_updateopt("max_worker", true)
    .then((v) => {
      nWorkers = parseInt(v)
    });
  const workerNumberElement = document.getElementById("output-raveopt-max_worker");
  const workerNumberBtn = document.getElementById("output-raveopt-max_worker-btn");
  raveElectronAPI.getNCPUs().then((ncores) => {
    if( typeof(ncores) === "number" ) {
      workerNumberElement.setAttribute("max", ncores)
    }
  })
  workerNumberElement.addEventListener("input", () => {
    if( workerNumberElement.value == nWorkers ) {
      workerNumberBtn.innerText = "Change";
      workerNumberBtn.disabled = true;
    } else {
      workerNumberBtn.disabled = false;
      workerNumberBtn.innerHTML = `Change [${workerNumberElement.value}]`
    }
  });
  workerNumberBtn.addEventListener("click", (evt) => {
    evt.preventDefault();
    let newWorkers = workerNumberElement.value;
    newWorkers = parseInt(newWorkers);
    if( typeof newWorkers !== "number" || isNaN(newWorkers) || newWorkers <= 0 ) { return; }
    raveElectronAPI.evalRIsolate(`raveio::raveio_setopt("max_worker", ${newWorkers})`)
      .then(() => {
        rave_updateopt("max_worker", true)
          .then((v) => {
            nWorkers = parseInt(v);
            notification.showNotification(
              `Max number of parallel workers is set to: ${v}`,
              {
                title: "RAVE settings",
                type: "success",
                delay: 2000
              }
            );
            workerNumberBtn.innerText = "Change";
            workerNumberBtn.disabled = true;
          });
      })
  });
  
}

async function launchRAVESession (session_id, args = {}) {

  const notifId = notification.showNotification(
    `Starting RAVE session...`,
    {
      title: "RAVE Session Launcher",
      type: "default",
      autohide: false
    }
  );

  const externalBrowser = args.externalBrowser === true ? true : false;
  let port = args.port;
  if(!port) {
    const tmp = await raveElectronAPI.evalRIsolate("cat(httpuv::randomPort())", true);
    // console.log(tmp)
    port = parseInt(tmp.message);
  }

  let session_id2 = session_id;
  if( typeof session_id !== "string" ) {
    const tmp = await raveElectronAPI.evalRIsolate(
      `
      sess <- ravedash::new_session()
      cat("\n", sess$session_id)
      `,
      true
    );
    
    session_id2 = tmp.message.trim().split("\n");
    session_id2 = session_id2[session_id2.length - 1].trim();

    postRAVESession(session_id2, false);
  }
  terminalConsole.addRJob(`
  ravedash::start_session(
    session = "${session_id2}", port = ${port}, jupyter = FALSE, as_job = FALSE, 
    launch_browser = FALSE, single_session = ${externalBrowser ? "FALSE" : "TRUE"}
  )
  `, {
    shutdownServer : false, 
    isolate : true, 
    block : false
  });

  /*
  raveElectronAPI.evalRIsolate(
    `
    ravedash::start_session(
      session = "${session_id2}", port = ${port}, jupyter = FALSE, as_job = FALSE, 
      launch_browser = FALSE, single_session = ${externalBrowser ? "FALSE" : "TRUE"}
    )
    `,
    false
  );
  */

  const url = `http://127.0.0.1:${port}`;

  await sleep(2000);

  if( externalBrowser ) {
    raveElectronAPI.openExternalURL(url);
  } else {
    window.open(url, "_blank");
  }

  notification.hideNotification(notifId);
  
  notification.showNotification(
    `RAVE session [${session_id2}] has been started at port [${port}].`,
    {
      title: "RAVE Session Launcher",
      type: "info",
      delay: 5000
    }
  );

}

function postRAVESession (session_id, append = false) {
  if(typeof session_id !== "string") { return; }

  const a = document.createElement("a");
  a.setAttribute("href", "#");
  a.innerText = session_id;
  a.addEventListener("click", () => {
    launchRAVESession(session_id);
  })

  const li = document.createElement("li");
  li.appendChild(a);
  const sessionList = document.getElementById("output-session-list");

  if( append ) {
    sessionList.appendChild(li);
  } else {
    sessionList.insertBefore(li, sessionList.firstChild);
  }

  return a;
}

function updateSessionList(add = false) {
  if(!add) {
    const sessionList = document.getElementById("output-session-list");
    sessionList.textContent = "";
  }
  
  raveElectronAPI.evalRIsolate(`cat(sapply(ravedash::list_session(order = "ascend"), "[[", "session_id"), sep = "\n")`)
  .then((results) => {
    if(!results || typeof results !== "object") { return; }
    const message = results.message;
    if( !message || typeof message !== "string" ){ return; }
    results.message.split("\n")
      .map((session_id) => {
        return( session_id.trim() );
      })
      .filter((session_id) => {
        return( session_id !== "" && session_id.startsWith("session") );
      })
      .forEach((session_id) => {
        postRAVESession(session_id, false);
      })
  });
}

function installRAVE () {
  let notifId = notification.showNotification(
    `Installing RAVE: Upgrading package manager...`,
    {
      title: "RAVE Installer",
      type: "default",
      autohide: false
    }
  );

  terminalConsole.addRJob(
    `
    if(system.file(package="ravemanager") == "") {
      lib_path <- Sys.getenv("R_LIBS_USER", unset = NA)
      if( "windows" %in% tolower(.Platform$OS.type) || 
          startsWith(tolower(R.version$os), "win")) {
        lib_path <- strsplit(lib_path, ";")[[1]]
      } else {
        lib_path <- strsplit(lib_path, ":")[[1]]
      }
      if(!dir.exists(lib_path)) {
        dir.create(lib_path, recursive = TRUE)
      }
      utils::install.packages('ravemanager', repos = 'https://beauchamplab.r-universe.dev', lib = lib_path)
    } else {
      ravemanager::upgrade_installer()
    }
    `, 
    args = {
      isolate: true, 
      shutdownServer: true,
      caveat: "Install/update ravemanager",
      onFinish: () => {
        notification.hideNotification(notifId);
        notifId = notification.showNotification(
          `Installing RAVE & core dependencies... It will take a while if this is the first time that you install RAVE`,
          {
            title: "RAVE Installer",
            type: "default",
            autohide: false
          }
        );

        terminalConsole.addRJob(
          "ravemanager::install(finalize = FALSE)",
          args = {
            isolate: true, 
            shutdownServer: true,
            caveat: "Install RAVE & dependencies",
            onFinish: () => {
              notification.hideNotification(notifId);
              notifId = notification.showNotification(
                `Installing built-in pipelines... (template brain, Notch filter, Morelet wavelet, Electrode localization, ...)`,
                {
                  title: "RAVE Installer",
                  type: "default",
                  autohide: false
                }
              );
              terminalConsole.addRJob(
                'ravemanager::finalize_installation(packages = c("raveio", "threeBrain"))',
                {
                  isolate: true, 
                  shutdownServer: true,
                  caveat: "Install built-in pipelines",
                  onFinish : () => {
                    notification.hideNotification(notifId);
                    notifId = notification.showNotification(
                      `The RAVE core has been successfully installed. You can start RAVE sessions now while the finalizing script is running...`,
                      {
                        title: "RAVE Installer",
                        type: "success",
                        autohide: false
                      }
                    );
                    terminalConsole.addRJob(
                      `
                      allPackages <- unique(utils::installed.packages()[,1])
                      allPackages <- allPackages[!allPackages %in% c("raveio", "threeBrain")]
                      ravemanager::finalize_installation(packages = allPackages)
                      `,
                      {
                        isolate: true, 
                        shutdownServer: true,
                        caveat: "Finalize installations",
                        onFinish: () => {
                          notification.hideNotification(notifId);
                          notifId = notification.showNotification(
                            `Congratulations, RAVE has been upgraded! <strong>Please restart this application (RAVE control center).</strong>`,
                            {
                              title: "RAVE Installer",
                              type: "success",
                              autohide: false
                            }
                          );
                        }
                      }
                    )
                  }
                }
              )
            }
          }
        )
      }
    }
  )
}


const notification = new Notification();
const modal = new ModalDialog();

$(document).ready(async function() {

  // get basic information from the main process

  appInfo = {
    rscript_path: undefined,
    r_version   : undefined,
    library     : {}
  };
  
  const terminalConsole = new TerminalConsole(
    document.getElementById("output-terminal"),
    document.getElementById("input-r-command")
  );
  window.terminalConsole = terminalConsole;
  
  $('[data-toggle="popover"]').popover();
  $('a[target="_blank"][href^="http"]').click(function(evt) {
    evt.preventDefault();
    const href = evt.target.getAttribute("href");
    raveElectronAPI.openExternalURL(href);
  });

  document.getElementById("toggle-terminal").addEventListener("click", () => {
    if( document.body.classList.contains("terminal-open") ) {
      document.body.classList.remove("terminal-open");
    } else {
      document.body.classList.add("terminal-open");
    }
  })

  document.getElementById("input-install-rave").addEventListener("click", installRAVE);

  $("[electron-external-link]").click(function(evt) {
    evt.preventDefault();
    const link = $(this).attr("electron-external-link");
    raveElectronAPI.openExternalURL(link);
  });

  document.getElementById("input-new-session").addEventListener("click", () => {
    launchRAVESession();
  })

  const remoteForm = document.getElementById("input-remote-form")
  const elementHost = document.getElementById("input-remote-host");
  const elementPort = document.getElementById("input-remote-port");
  const elementRAVEPort = document.getElementById("input-remote-rave-port");
  const elementUsername = document.getElementById("input-remote-username");
  const elementRememberUsername = document.getElementById("input-remote-remember-username");
  const elementPassword = document.getElementById("input-remote-password");
  const elementSubmit = document.getElementById("input-remote-submit");
  
  remoteForm.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    
    // validate form
    let host = elementHost.value.trim();
    if( host === "" ) { host = "127.0.0.1" }
    let sshPort = parseInt(elementPort.value);
    if( isNaN(sshPort) ) {
      sshPort = 22;
    } else if (sshPort < 0 || sshPort > 65535) {
      notification.showNotification(
        "Invalid SSH port: port must be an integer from 1-65535",
        args = {
          type: "error"
        }
      )
      return;
    }
    let ravePort = parseInt(elementRAVEPort.value);
    if( isNaN(ravePort) ) {
      ravePort = undefined;
    } else if (ravePort < 0 || ravePort > 65535) {
      notification.showNotification(
        "Invalid RAVE port: port must be an integer from 1-65535. Using random port instead",
        args = {
          type: "warning"
        }
      )
      ravePort = undefined;
    }

    const username = elementUsername.value;
    const password = elementPassword.value;
    const rememberUsername = elementRememberUsername.checked;

    // elementPassword.value = "";

    const settings = {
      sshHost: host,
      sshPort: sshPort,
      sshRAVEPort: ravePort,
      username: rememberUsername ? username : "",
      rememberUsername: rememberUsername
    }

    raveElectronAPI.setAppSettings(settings);

    elementHost.disabled = true;
    elementPort.disabled = true;
    elementRAVEPort.disabled = true;
    elementUsername.disabled = true;
    elementRememberUsername.disabled = true;
    elementPassword.disabled = true;
    elementSubmit.disabled = true;

    try {
      await terminalConsole.addSSHJob({
        host: host, port: sshPort, username: username, password: password, 
        RAVEPort: ravePort, newSession: false, leaveOpen: true
      });
    } catch (error) {
      notification.showNotification(
        `Unable to SSH & open the server. Reasons: <br><code>${error.toString()}</code>`,
        {
          type: "error"
        }
      );
      terminalConsole.close();
    }
    elementHost.disabled = false;
    elementPort.disabled = false;
    elementRAVEPort.disabled = false;
    elementUsername.disabled = false;
    elementRememberUsername.disabled = false;
    elementPassword.disabled = false;
    elementSubmit.disabled = false;

    
  })

  raveElectronAPI.getAppSettings(["sshHost", "sshPort", "sshRAVEPort", "username", "rememberUsername"])
    .then((settings) => {
      elementHost.value = settings.sshHost || "";
      elementPort.value = settings.sshPort || "";
      elementRAVEPort.value = settings.sshRAVEPort || "";
      const rem = settings.rememberUsername === false ? false : true;
      elementRememberUsername.checked = rem;
      if( rem ) {
        elementUsername.value = settings.username || "";
      } else if (typeof settings.username === "string" && settings.username.length > 0) {
        raveElectronAPI.setAppSettings({username: undefined});
      }
    });


  // Update UI components
  updateSystemStatus();

  updateSessionList();

  document.getElementById("input-clear-cache").addEventListener("click", () => {

    

    modal.showModal(
      title = "Confirmation", body = "This will clean all the RAVE sessions and cached data on the local machine only. If you have running RAVE sessions. Please close them prior to confirmation", 
      primaryBtn = { label: "Confirm" }, 
      secondaryBtn = {label: "Cancel"}, 
      onConfirmed = () => {

        const notifId = notification.showNotification(
          "Clearing cache files in progress... Please wait...",
          args = {
            autohide: false
          }
        )

        terminalConsole.addJob(
          `
          raveio::clear_cached_files()
          cat("Done.")
          `, 
          () => {
            notification.hideNotification(notifId);
            updateSessionList();
            modal.removeModal();
          },
          {
            isolate: true
          }
        )
      })

  });
  
});