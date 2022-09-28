const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require("node:child_process");
const { setAppSettings, getAppSettings } = require("./app-settings");

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

function debug(msg) {
    console.debug(`[RAVE-DEBUG]: ${msg}`);
}

function ensureDirectory(directory, recursive = true) {
    if (typeof directory !== "string" || directory.length === 0) {
        throw new TypeError("ensureDirectory: directory must be a non-empty string.");
    }
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: recursive });
    }
    return path.resolve(directory).replace(/\\/g, '/');
}

function runTerminal(command, args = [], block = true) {
    const results = {
        process: undefined,
        status: "started",
        messages: [],
        get message() {
            return this.messages
                .map((v) => { return (v.data); })
                .join("");
        }
    };
    const MAX_MESSAGES = 5000; 
    const promise = new Promise( (resolve) => {
        const defaultEnv = process.env;
        
        const env = Object.assign(defaultEnv, {
            PATH: `${defaultEnv.HOME}/abin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/gfortran/bin:${defaultEnv.PATH}`
        })
        const subProcess = spawn(command, args, { env: env });
        
        results.process = subProcess;

        subProcess.stdout.on('data', (data) => {
            results.messages.push({
                data: data,
                type: "stdout"
            });
            if( results.messages.length > MAX_MESSAGES ) {
                results.messages.splice(0, results.messages.length - MAX_MESSAGES);
            }
            
        });
        subProcess.stderr.on('data', (data) => {
            results.messages.push({
                data: data,
                type: "stderr"
            });
            if( results.messages.length > MAX_MESSAGES ) {
                results.messages.splice(0, results.messages.length - MAX_MESSAGES);
            }
        });
        subProcess.on('error', (err) => {
            results.messages.push({
                data: err,
                type: "stderr"
            });
            if( results.messages.length > MAX_MESSAGES ) {
                results.messages.splice(0, results.messages.length - MAX_MESSAGES);
            }
            results.status = "error";
        })
        subProcess.on('close', (code) => {
            if (code === 0) {
                results.status = "success"
            } else {
                results.status = "error"
            }
            results.process = undefined;
            if (block) {
                resolve(results);
            }
        });
        if (!block) {
            resolve(results);
        }
    })
    return promise;
}

function getSystemPath() {
    return runTerminal("sh", ["-c", "echo $PATH"]);
}

function where(program) {

    let promise;
    if (process.platform !== "win32") {
        promise = runTerminal("which", [program], true);
    } else {
        // TODO
        promise = runTerminal("where", [program], true);
    }

    return promise;
}

async function find_rscript() {
    let rscript = await getAppSettings("path-cmd-Rscript");
    if (typeof rscript === 'string' && fs.existsSync(rscript)) {
        // debug(`Found Rscript via settings key: 'path-cmd-Rscript' (${rscript})`);
        return rscript;
    }
    const result = await where("Rscript");
    if (result.status === "success") {
        rscript = result.message.trim();
        if (typeof rscript === 'string' && fs.existsSync(rscript)) {
            debug(`Found Rscript via system path: ${rscript}`);
            setAppSettings("path-cmd-Rscript", rscript);
            return rscript;
        }
    }
    return;
}

async function run_r(scripts, block = true) {
    const rscript = await find_rscript();
    if (rscript === "undefined") {
        throw new Error("RScript not found!");
    }
    // save the script to a temporary file
    tmppath = path.join(ensureDirectory(os.tmpdir()), `rave-electron-${makeid(6)}.R`).replace(/\\/g, '/');

    let results;
    try {
        fs.writeFileSync(tmppath, scripts.replace(/\\/g, '\\\\'));

        // run script
        results = await runTerminal(
            rscript, ['--no-save', '--no-restore', tmppath], block
        );
    } catch (error) {
        throw error;
    } finally {
        const cleanUp = () => {
            if (fs.existsSync(tmppath)) {
                fs.unlink(tmppath, () => { });
            }
        }
        if( block ) {
            cleanUp();
        } else {
            
            new Promise((resolve) => {
                const checkResult = () => {
                    if(!results) { 
                        resolve(null);
                        return;
                    }
                    if(results.status !== "started") {
                        resolve(null);
                        return;
                    }
                    setTimeout(checkResult, 1000);
                    return;
                };
                checkResult();
            }).then (cleanUp).catch(cleanUp);
        }
        
    }
    return results;
}

function rVersionSingleton() {
    let rVersionCache;
    const r_version = async () => {
        if (rVersionCache) {
            if (typeof rVersionCache !== "string") {
                throw new Error("Unable to get R version.");
            }
            return rVersionCache;
        }
        const res = await run_r("cat(R.version$version.string)");
        if (res.status === "success") {
            rVersionCache = res.message;
            return res.message;
        }
        throw new Error("Unable to get R version.");
    }
    return r_version;
}
const r_version = rVersionSingleton();



async function package_version(package) {
    if (typeof package !== "string") {
        throw new TypeError("package_version: package must be a string");
    }
    const m = package.match(/^[a-zA-Z0-9]+$/g);
    if (!Array.isArray(m) || m.length === 0) {
        throw new Error(`package_version: package [${package}] is invalid`);
    }
    const res = await run_r(`cat(as.character(utils::packageVersion('${package}')))`);
    if (res.status === "success") {
        return res.message;
    }
    throw new Error("Unable to get package version.");
}

function ensureRSocketServerSingleton() {
    let port;
    let serverProcess;
    const initRScript = path.join(__dirname, '..', 'R', 'socket.R').replace(/\\/g, "/");

    const ensurePort = () => {
        const promise = new Promise((resolve, error) => {

            if (port !== undefined) {
                resolve(port);
                return;
            };

            r_version()
                .then(() => {

                    const script = `
                        cat(local({
                            source("${initRScript}", local = TRUE, echo = FALSE)
                            server <- createSockerServer()
                            cat(server$port)
                            server$finalize()
                        }))
                    `;

                    run_r(script)
                        .then((result) => {
                            if (result.status === "success") {
                                const p = parseInt(result.message);
                                if (!isNaN(p)) {
                                    port = p;
                                    resolve(port);
                                    return;
                                }
                                error(new Error("Cannot find a proper port for R socket server"));
                            } else {
                                error(new Error(result.message));
                            }

                        })
                        .catch((err) => {
                            error(err);
                        });
                })
                .catch((err) => { error(err) });
        });
        return promise;
    }

    const ensureRSocketServer = () => {

        const promise = ensurePort()
            .then((p) => {
                
                if( serverProcess && serverProcess.connected ){
                    
                    return p;
                }
                serverProcess = undefined;
                run_r(
                    `
                    local({
                        .debugEnabled <- TRUE
                        source("${initRScript}", local = TRUE, echo = FALSE)
                        server <- createSockerServer(port=${p})
                        server$listen()
                    })
                    `,
                    false)
                    .then((results) => {
                        const serverStdout = () => {
                            if( results.messages.length > 0 ){
                                console.log(`#> ${results.message.split("\n").join("\n#> ")}`);
                                results.messages.length = 0;
                            }
                            if(results.status === "started") {
                                setTimeout(serverStdout, 500);
                            }
                        }
                        
                        if(!results || !results.process) { return; }
                        serverProcess = results.process;
                        serverStdout();
                    });
                return p;
            })
            .catch((err) => {
                console.log(`Unable to launch R socket server. Reason: ${err}`);
                throw err;
            });
        return promise;

    }

    const executeRSocketServer = (script, block = true) => {
        return new Promise((resolve, error) => {
            ensureRSocketServer()
                .then((p) => {
                    // console.log(`Dry-run:\n${script}`);
                    run_r(
                        `
                        local({
                            source("${initRScript}", local = TRUE, echo = FALSE)
                            re <- runSocket(port = ${p}, script = {
                                ${script}
                            })
                            cat(re)
                        })
                        `,
                        block
                    )
                        .then(resolve)
                        .catch(error)
                })
                .catch(error)
        });
    }

    const shutdownRSocketServer = async () => {
        if (port !== undefined) {
            executeRSocketServer(`q(save = "no")`)
            await sleep(3000);
            port = undefined;
        }
        let killed = true;
        if( serverProcess && serverProcess.connected ) {
            setTimeout(() => {
                
                killed = serverProcess.kill();
                serverProcess = undefined;
                
            }, 0);
        } else {
            serverProcess = undefined;
        }
        await sleep(500);
        return killed;

    }
    return {
        ensureRSocketServer: ensureRSocketServer,
        executeRSocketServer: executeRSocketServer,
        shutdownRSocketServer: shutdownRSocketServer
    };
}
const sockerServerFunctions = ensureRSocketServerSingleton();



//where("Rscript")

//setAppSettings()

//const dataPath = storage.getDataPath();

exports.rcmd = {
    getSystemPath: getSystemPath,
    find_rscript: find_rscript,
    version: r_version,
    RSocketServer: ensureRSocketServerSingleton,
    evalRIsolate: async (script, block = true) => {
        const results = await run_r(script, block);
        return(results)
    },
    package_version: package_version,
    setAppSettings: setAppSettings,
    getAppSettings: getAppSettings,
};
