// Runs in native QuickJS with the real memfs dependency and guest process module.
import process, * as identity from "../guest/host/process.mjs";
import { memfs } from "memfs";

const check = (value, label) => { if (!value) throw new Error(label); };
const { fs, vol } = memfs();
const root = vol._core.root;
check(!root.getChild("virtual.txt"), "fresh virtual filesystem");
const file = root.createChild("virtual.txt").getNode();
file.setString("guest only");
check(root.getChild("virtual.txt").getNode().getString() === "guest only", "virtual read");
check(file.uid === 1000 && file.gid === 1000, "virtual ownership");
fs.writeFileSync("/path.txt", "virtual");
check(fs.readFileSync("/path.txt", "utf8") === "virtual", "virtual pathname cwd");
check(process.cwd() === "/", "virtual root cwd");
check(identity.getuid() === 1000 && identity.getgid() === 1000, "named identity");
check(process.getuid() === identity.getuid() && process.getgid() === identity.getgid(), "default identity");
check(Object.keys(process.env).length === 0, "empty environment");
const cpu = process.threadCpuUsage();
check(cpu.user >= 0 && cpu.system === 0 && process.cpuUsage(cpu).user >= 0, "monotonic cpu usage");
const [seconds, nanos] = process.hrtime();
check(seconds >= 0 && nanos >= 0 && nanos < 1e9 && typeof process.hrtime.bigint() === "bigint", "hrtime");
check(process.getBuiltinModule("node:path").join("a", "b") === "a/b" && process.getBuiltinModule("module") === undefined, "guest builtins");
check(process.uptime() >= 0 && process.memoryUsage().heapUsed === 0, "uptime and memory usage");
check(typeof globalThis.process === "undefined", "no global process");
for (const member of ["setuid", "setgid", "seteuid", "setegid", "geteuid", "getegid", "exit"]) {
  let denied = false;
  try { process[member](0); } catch (error) {
    denied = error.message.includes(`process.${member} is unavailable`);
  }
  check(denied, `unsupported ${member}`);
}
globalThis.__nodetool = {};
