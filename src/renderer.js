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


  async evalR(script, isolate = false, block = true, jobId = makeid(4)) {
    const item = this.addItem(script, "command");
    const itemResults = this.addItem( "# Running...", "normal", false, true );
    item.wrapper.appendChild( itemResults.wrapper );

    let result;
    if( isolate ) {
      result = await raveElectronAPI.evalRIsolate(script, block, jobId);
    } else {
      result = await raveElectronAPI.evalRServer(script, block, jobId);
    }
     
    if( result ) {
      itemResults.element.innerText = result.message;
      switch (result.status) {
        case "started":
          break;
        case "success":
          break;
        default:
          itemResults.wrapper.className = `pl-2 pr-2 pt-0 pb-0 m-0 hljs-keyword`;
          break;
      }
    } else {
      itemResults.element.innerText = "# (No results captured)"
    }
    return {
      result: result,
      outputElement: itemResults.element
    };
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
    if( !resultObj ) {
      const s = jobDetails.getCaveat("NoResults");
      if( typeof s === "string" ) {
        jobDetails.outputElement.innerText = s;
        jobDetails.outputElement.className = "hljs-keyword";
      }
      jobDetails.finished = true;
      delete this._jobs[jobId];
      return;
    }
    
    if( resultObj.messages.length > 0 ) {
      let msg = resultObj.message;

      if( resultObj.status === "started" ) {
        msg = `${msg}\nStill running...`;
      } else {
        const s = jobDetails.getCaveat(resultObj.status);
        if( typeof s === "string" ) {
          msg = `${msg}\n${s}`;
        }

        if( resultObj.status === "error" ) {
          jobDetails.outputElement.className = "hljs-keyword";
        }
      }

      // string.charAt(0).toUpperCase() + string.slice(1)

      jobDetails.outputElement.innerText = msg;
    }
    
    if( resultObj.status !== "started" ) {
      jobDetails.finished = true;
      try {
        jobDetails.finalize();
      } catch (error) {
        
      }
      delete this._jobs[jobId];
    }

  }

  async addJob(script, onFinish, args = {}) {

    const isolate = args.isolate ? true : false;
    const shutdownServer = (isolate && args.shutdownServer) ? true : false;
    const leaveOpen = args.leaveOpen !== true ? false : true;
    const caveat = typeof args.caveat === "string" ? args.caveat : undefined;
    const block = args.block !== true ? false : true;
    

    const opened = this.isOpen();
    this.open();

    const jobId = makeid(10);

    if( shutdownServer ) {
      try {
        await raveElectronAPI.shutdownRServer();
      } catch (error) {
        console.log("Unable to shutdown R socket server... Start isolated job anyway.")
      }
    }

    const container = await this.evalR(script, isolate, block, jobId);
    this._jobs[jobId] = {
      finished: false,
      caveat : caveat,
      outputElement : container.outputElement,
      getCaveat: function(status, width = 80) {
        if( !this.caveat ) { return }
        let s = `== ${status}: ${this.caveat}`;
        const rem = width - 1 - s.length;
        if(rem > 0) {
          s = `${s} ${"=".repeat(rem)}`;
        }
        return s;
      },
      finalize: () => {
        if( !(leaveOpen || opened) ) {
          this.close();
        }
        if( typeof onFinish === "function" ) {
          onFinish();
        }
      }
    };


    return container;
  }
}

async function updateSystemStatus () {
  try {

    // Rscript path & version
    const rscript = await raveElectronAPI.getPathRscript();
    const rver = await raveElectronAPI.getRVersion();

    raveElectronAPI.replaceTextById("output-rscript-path", rscript);
    // raveElectronAPI.replaceHtmlById("output-rscript-path", "(Not found) Please download R from <a href='https://cran.r-project.org/' target='_blank'>https://cran.r-project.org/</a>");
    raveElectronAPI.replaceHtmlById("output-rscript-path-status", `<span class="badge bg-success">${rver}</span>`);

    appInfo.rscript_path = rscript;
    appInfo.r_version = rver;

  } catch (error) {
    raveElectronAPI.replaceHtmlById("output-rscript-path", "(Not found) Please download R from <a href='https://cran.r-project.org/'>https://cran.r-project.org/</a>");
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
}

async function launchRAVESession (session_id, args = {}) {

  const externalBrowser = args.externalBrowser === true ? true : false;
  let port = args.port;
  if(!port) {
    const tmp = await raveElectronAPI.evalRIsolate("cat(httpuv::randomPort())", true);
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
  terminalConsole.addJob(`
  ravedash::start_session(
    session = "${session_id2}", port = ${port}, jupyter = FALSE, as_job = FALSE, 
    launch_browser = FALSE, single_session = ${externalBrowser ? "FALSE" : "TRUE"}
  )
  `, ()=>{}, {
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
  

  document.getElementById("toggle-terminal").addEventListener("click", () => {
    if( document.body.classList.contains("terminal-open") ) {
      document.body.classList.remove("terminal-open");
    } else {
      document.body.classList.add("terminal-open");
    }
  })

  document.getElementById("input-install-rave").addEventListener("click", () => {
    terminalConsole.addJob(
      `utils::install.packages('ravemanager', repos = 'https://beauchamplab.r-universe.dev')`, 
      () => {
        terminalConsole.addJob(
          "ravemanager::install()",
          () => {},
          args = {
            isolate: true, 
            shutdownServer: true,
            caveat: "Installing RAVE & dependencies"
          }
        )
      }, 
      args = {
        isolate: true, 
        shutdownServer: true,
        caveat: "Preparing: install/update ravemanager"
      });
  });

  $("[electron-external-link]").click(function(evt) {
    evt.preventDefault();
    const link = $(this).attr("electron-external-link");
    raveElectronAPI.openExternalURL(link);
  });


  // Update UI components
  updateSystemStatus();

  
  raveElectronAPI.evalRIsolate(`cat(sapply(ravedash::list_session(order = "ascend"), "[[", "session_id"), sep = "\n")`)
    .then((results) => {
      results.message.split("\n")
        .filter((session_id) => {
          return( session_id.trim() !== "" );
        })
        .forEach((session_id) => {
          const session_id2 = session_id.trim();
          postRAVESession(session_id2, false);
        })
    })

    document.getElementById("input-new-session").addEventListener("click", () => {
      launchRAVESession();
    })
  
  
});