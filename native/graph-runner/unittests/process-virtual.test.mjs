import process, * as virtual from "../guest/host/process.mjs";
import { memfs } from "memfs";
const check = (value, label) => { if (!value) throw new Error(label); };
check(process.cwd() === "/", "virtual cwd");
virtual.installProcess();
check(globalThis.process === process, "same global and module");
check(Object.keys(process.env).length === 0, "no inherited environment");
check(process.versions.node === undefined, "no Node runtime claim");
process.env.G6_LOCAL = "guest";
check(globalThis.process.env.G6_LOCAL === "guest", "local environment writes");
delete process.env.G6_LOCAL;
const { fs } = memfs();
fs.writeFileSync("relative.txt", "virtual only");
check(fs.readFileSync("/relative.txt", "utf8") === "virtual only", "real memfs pathname");
const stat = fs.statSync("/relative.txt");
check(stat.uid === 1000 && stat.gid === 1000, "fixed virtual ownership");
for (const member of ["exit", "chdir", "setuid", "setgid", "geteuid", "getegid", "kill", "binding"]) {
  let denied = false;
  try { process[member](0); } catch (e) { denied = e.message.includes(`process.${member} is unavailable`); }
  check(denied, `deny ${member}`);
}
let fileDenied = false;
try { globalThis.__host.files.readFile("/etc/passwd"); } catch (error) { fileDenied = String(error).includes("EACCES"); }
check(fileDenied, "virtual process grants no host file read");
globalThis.__nodetool = {};
globalThis.G6_RESULTS = JSON.stringify({ cwd: process.cwd(), uid: stat.uid, gid: stat.gid, fileDenied });
