// Process tests of nodetool-account-helper-test, the helper built with a
// credential store in a folder: two helper processes stand in for two apps
// on one computer, and this file stands in for Electron's main process and
// the cloud server. Run by electron/scripts/build-account-helper.mjs --test:
//
//   node --test native/account-helper/tests/process.test.mjs
//
// NODETOOL_ACCOUNT_HELPER_TEST_BINARY names the test helper.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { after, test } from "node:test";
import assert from "node:assert/strict";

const SERVER = "https://cloud.example.com";
const BINARY = process.env.NODETOOL_ACCOUNT_HELPER_TEST_BINARY;
if (!BINARY) {
  throw new Error("Set NODETOOL_ACCOUNT_HELPER_TEST_BINARY to the test helper");
}

const root = mkdtempSync(path.join(tmpdir(), "nodetool-account-helper-"));
const children = new Set();
after(() => {
  for (const child of children) {
    child.kill("SIGKILL");
  }
  rmSync(root, { recursive: true, force: true });
});

let counter = 0;
function computer() {
  const dir = path.join(root, `pc${++counter}`);
  return { data: path.join(dir, "data"), store: path.join(dir, "store") };
}

/** The fake cloud server's token endpoint, shared by every helper of a test. */
function fakeServer() {
  let next = 1;
  const ended = new Set();
  return {
    ended,
    /** How the next code exchange answers. */
    exchange: "ok",
    answer(message) {
      const url = new URL(message.url);
      const form = new URLSearchParams(message.body);
      if (url.pathname === "/oauth/token" && form.get("grant_type") === "authorization_code") {
        if (this.exchange === "redirect") {
          return { status: 302, body: "" };
        }
        const n = next++;
        return {
          status: 200,
          body: JSON.stringify({
            access_token: `ntd_access${n}`,
            refresh_token: `ntr_refresh${n}`,
            expires_in: 900,
            session_id: `grant${n}`,
            user_id: "u1",
            display_name: "Ada",
            revocation_handle: `nth_handle${n}`,
          }),
        };
      }
      if (url.pathname === "/oauth/session/end") {
        ended.add(form.get("handle"));
        return { status: 200, body: "{}" };
      }
      return { status: 404, body: "" };
    },
  };
}

/** One helper process and the main-process side of its protocol. */
function startHelper(pc, server, env = {}) {
  const child = spawn(BINARY, ["--server", SERVER, "--data-dir", pc.data], {
    env: {
      ...process.env,
      NODETOOL_ACCOUNT_HELPER_TEST_STORE: pc.store,
      NODETOOL_ACCOUNT_HELPER_TEST_TICK_MS: "100",
      NODETOOL_ACCOUNT_HELPER_TEST_POLICY: path.join(pc.data, "no-policy.json"),
      ...env,
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  // A helper killed by a test closes its stdin under us.
  child.stdin.on("error", () => {});
  const helper = {
    child,
    messages: [],
    state: null,
    waiters: [],
    exited: new Promise((resolve) => child.on("exit", (code) => resolve(code))),
    send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    },
    waitFor(predicate, timeoutMs = 5000) {
      if (helper.state && predicate(helper.state)) {
        return Promise.resolve(helper.state);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`timed out, last state ${JSON.stringify(helper.state)}`)),
          timeoutMs,
        );
        helper.waiters.push({ predicate, resolve, timer });
      });
    },
    stop() {
      child.stdin.end();
      return helper.exited;
    },
  };
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    helper.messages.push(message);
    if (message.type === "http") {
      const { status, body } = server.answer(message);
      helper.send({ type: "httpResponse", id: message.id, status, body });
    } else if (message.type === "openBrowser") {
      // The browser: the user allows, and the server redirects to the
      // loopback listener with a code.
      const authorize = new URL(message.url);
      const callback = new URL(authorize.searchParams.get("redirect_uri"));
      callback.searchParams.set("code", "code1");
      callback.searchParams.set("state", authorize.searchParams.get("state"));
      http.get(callback, (res) => res.resume()).on("error", () => {});
    } else if (message.type === "state") {
      helper.state = message;
      helper.waiters = helper.waiters.filter((waiter) => {
        if (waiter.predicate(message)) {
          clearTimeout(waiter.timer);
          waiter.resolve(message);
          return false;
        }
        return true;
      });
    }
  });
  return helper;
}

const signedIn = (s) => s.state === "signedIn" && s.displayName === "Ada";
const signedOut = (s) => s.state === "signedOut";
const ended = (s) => s.state === "signedOut" && !s.serverEndPending;

function storedItems(pc) {
  let names = [];
  try {
    names = readdirSync(pc.store);
  } catch {
    return [];
  }
  return names.map((name) => readFileSync(path.join(pc.store, name), "utf8"));
}

test("TC109: a sign-in and a sign-out in one app show in the other", async () => {
  const pc = computer();
  const server = fakeServer();
  const a = startHelper(pc, server);
  const b = startHelper(pc, server);
  await a.waitFor(signedOut);
  await b.waitFor(signedOut);

  a.send({ type: "signIn" });
  await a.waitFor(signedIn);
  await b.waitFor(signedIn, 2000);

  b.send({ type: "signOut" });
  await b.waitFor(ended);
  await a.waitFor(signedOut, 2000);
  assert.ok(server.ended.has("nth_handle1"));
  for (const item of storedItems(pc)) {
    assert.doesNotMatch(item, /ntr_|ntd_/);
  }

  // The reverse.
  b.send({ type: "signIn" });
  await b.waitFor(signedIn);
  await a.waitFor(signedIn, 2000);
  a.send({ type: "signOut" });
  await b.waitFor(signedOut, 2000);
  await a.waitFor(ended);
  assert.ok(server.ended.has("nth_handle2"));
  await Promise.all([a.stop(), b.stop()]);
});

test("TC110: a redirect from the token endpoint stores nothing", async () => {
  const pc = computer();
  const server = fakeServer();
  server.exchange = "redirect";
  const a = startHelper(pc, server);
  a.send({ type: "signIn" });
  await a.waitFor((s) => s.state === "signedOut" && s.message !== "");
  assert.deepEqual(storedItems(pc), []);
  await a.stop();
});

test("TC113: a helper killed mid-sign-in or mid-sign-out is repaired at the next start", async () => {
  const pc = computer();
  const server = fakeServer();
  const dying = startHelper(pc, server, { NODETOOL_ACCOUNT_HELPER_TEST_FAULT: "AfterRecordWrite" });
  dying.send({ type: "signIn" });
  assert.equal(await dying.exited, 70);

  const restarted = startHelper(pc, server);
  await restarted.waitFor(signedIn);
  await restarted.stop();

  const dyingAgain = startHelper(pc, server, { NODETOOL_ACCOUNT_HELPER_TEST_FAULT: "AfterGenerationWrite" });
  await dyingAgain.waitFor(signedIn);
  dyingAgain.send({ type: "signOut" });
  assert.equal(await dyingAgain.exited, 70);

  const last = startHelper(pc, server);
  await last.waitFor(signedOut);
  // The handle survived the kill, so the session still ends on the server.
  await last.waitFor(ended, 10_000);
  assert.ok(server.ended.has("nth_handle1"));
  await last.stop();
});

test("TC114: no message to the main process outside http carries a secret", async () => {
  const pc = computer();
  const server = fakeServer();
  const a = startHelper(pc, server);
  a.send({ type: "signIn" });
  await a.waitFor(signedIn);
  a.send({ type: "signOut" });
  await a.waitFor(ended);
  await a.stop();
  for (const message of a.messages) {
    if (message.type === "http") {
      continue;
    }
    assert.doesNotMatch(JSON.stringify(message), /ntr_|ntd_|nth_/);
  }
});
