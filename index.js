"use strict";

const { spawn } = require('child_process');
const fs = require('fs-extra')
const fsP = require('fs/promises')
const { EventEmitter } = require('events')
const burrutil = require('./burrutil')
const pidusage = require('pidusage')
const { cpus } = require('os')

class Burrito extends EventEmitter {
    constructor(pathToExecutable) {
        super()
        this.executablePath = pathToExecutable || "./bedrock_server";
        this.process = null;
        this.serverDir = this.executablePath.replace(/\/[^\/\\]*$/, "");
        this.logFile = null;
        this.running = false;
    }
    start(detached = false) {
        if (this.running && this.process && !this.process.killed) {
            throw new Error("Server already running!");
        }
        this.process = spawn(this.executablePath.replace(/^.*(\/|\\)/, "./"), [], { cwd: this.serverDir, env: { "LD_LIBRARY_PATH": "." }, stdio: ["pipe", "pipe", "pipe"], detached: detached });
        this.running = true;
        this.initLog().then((file, err) => {
            if (err) {
                console.log(err);
            }
            this.process.stdout.on("data", (data) => {
                this.log(data);
            });
        })
        this.process.on("exit", () => {
            this.running = false;
            if (this.process.killed) {
                this.log("[burrito] Server killed!\n");
            } else {
                this.log("[burrito] Server stopped!\n");
            }
            this.emit("stopped");
        });
    }
    async initLog() {
        var logPath = this.serverDir + "/logs/log-" + new Date().getTime() + ".txt";
        fs.ensureFileSync(logPath);
        fs.open(logPath, "w", (err, file) => {
            if (err)
                throw err;
            this.logFile = file;
            return file;
        })
    }
    async performBackup(timeout = 30) {
        let backupPath = `${this.serverDir}/backups/backup-${new Date().getTime()}`
        await fs.mkdirp(backupPath)
        this.log("[burrito] Starting backup\n")
        if(this.running) {
            this.log("[burrito] Sending backup preparation command\n")
            this.send("save hold")
            let saving = false
            let backedUp = false
            let backupMatcher = /(\w[\w\s/.-]*):(\d+)/g
            this.on('log', async(log) => {
                if(!saving && !backedUp && log.toString().startsWith("Data saved. Files are now ready to be copied.")) {
                    saving = true
                    let m;
                    let files = [];
                    while(m = backupMatcher.exec(log.toString().split('\n')[1])) {
                        files.push({
                            path: m[1],
                            bytes: m[2]
                        })
                    }
                    let levelName = files[0].path.split('/')[0]                  
                    await fs.ensureDir(`${backupPath}/${levelName}`)
                    await fs.ensureDir(`${backupPath}/${levelName}/db/`)
                    await Promise.all(files.map(file => {
                        return fs.copyFile(`${this.serverDir}/worlds/${file.path}`, `${backupPath}/${file.path}`)
                    }))
                    this.log('[burrito] (1/2) Files backed up.\n')
                    await Promise.all(files.map(file => {
                        return fsP.truncate(`${backupPath}/${file.path}`, Number(file.bytes))
                    }))
                    this.log('[burrito] (2/2) Files truncated.\n')
                    backedUp = true
                }
            })
            while(true) { // TODO Handle Timeout
                await burrutil.delay(2000);
                if(!saving) {
                    this.log("[burrito] Querying the server for backup status\n")
                    this.send("save query")
                } else if(backedUp) {
                    this.log("[burrito] Backup complete!\n")
                    this.send("save resume")
                    return backupPath
                }
            }
        }
    }
    async log(data) {
        this.emit("log", data)
        //TODO Process different logtypes
        this.writeLog(data)
    }
    writeLog(data) {
        if(this.logFile) {
            fs.write(this.logFile, data)
        }
    }
    async stop(gentle = false) {
        this.log("[burrito] Server stopping..\n")
        if (!this.running) {
            return "NOT STARTED";
        }
        if (gentle) {
            this.send("say Shutting down in 30 Seconds..");
            await burrutil.delay(20000);
            this.send("say Shutting down in 10 Seconds..");
            await burrutil.delay(5000);
            for (var i = 5; i > 0; i--) {
                this.send("say Shutting down in " + i + " Seconds..");
                await burrutil.delay(1000);
            }
            this.send("say Shutting down!");
        }
        return new Promise((resolve, reject) => {
            this.process.stdin.write("stop\n");
            var stopReason = "STOPPED"
            var timer = setTimeout(() => {
                this.log("[burrito] Killing unresponsive server..\n")
                stopReason = "KILLED"
                this.kill()
            }, 30000);
            this.on("stopped", () => {
                clearTimeout(timer)
                return resolve(stopReason);
            });
        })
    }
    async kill() {
        if (this.running) {
            await burrutil.delay(10)
            this.process.kill()
            await burrutil.delay(10)            
        }
    }
    async getStats() {
        return new Promise((resolve, reject) => {
            if (!this.running) {
                return reject(new Error("Server not started!"))
            } else {
                pidusage(this.process.pid).then(stat => {
                    resolve({
                        cpu: stat.cpu,
                        mem: stat.memory,
                        threads: cpus().length,
                        pid: stat.pid,
                        uptime: stat.elapsed
                    })
                }).catch(err => reject(err))
            }
        })
    }
    send(command) {
        if (this.process) {
            this.log("[burrito command] " + command + "\n")
            this.process.stdin.write(command + "\n")
        }
    }
    reload() {
        this.send("reload")
    }
    async restart(gentle = false) {
        this.log("[burrito] Server restarting..\n")
        if (this.running) {
            await this.stop(gentle)
        }
        await this.start()
    }
}

module.exports = Burrito