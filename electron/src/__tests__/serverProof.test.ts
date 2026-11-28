import fs from "fs";
import os from "os";
import path from "path";

const electronMock = jest.requireActual("../__mocks__/electron");
jest.mock("electron", () => electronMock);

type ProofModule = typeof import("../serverProof");
type StateModule = typeof import("../state");

let userData: string;

function load(): { proof: ProofModule; state: StateModule } {
  return { proof: require("../serverProof"), state: require("../state") };
}

beforeEach(() => {
  jest.resetModules();
  userData = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-proof-"));
  jest.mocked(electronMock.app.getPath).mockImplementation(() => userData);
});

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true });
});

test("the secret is written once to a file only this user can read, and reused by the next launch", () => {
  const first = load().proof.getServerProofSecret();
  expect(first).toMatch(/^[0-9a-f]{64}$/);
  const file = path.join(userData, "server-proof.key");
  expect(fs.readFileSync(file, "utf8")).toBe(first);
  if (process.platform !== "win32") {
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  }
  jest.resetModules();
  expect(load().proof.getServerProofSecret()).toBe(first);
});

test("a proof matches only for the same secret, port and nonce", () => {
  const { proof } = load();
  const nonce = "0123456789abcdef0123456789abcdef";
  const good = proof.serverProofFor(proof.getServerProofSecret(), 7777, nonce);
  expect(proof.serverProofMatches(7777, nonce, good)).toBe(true);
  expect(proof.serverProofMatches(7778, nonce, good)).toBe(false);
  expect(proof.serverProofMatches(7777, `${nonce}0`, good)).toBe(false);
  expect(proof.serverProofMatches(7777, nonce, proof.serverProofFor("b".repeat(64), 7777, nonce))).toBe(false);
  expect(proof.serverProofMatches(7777, nonce, good.slice(1))).toBe(false);
  expect(proof.serverProofMatches(7777, nonce, null)).toBe(false);
});

test("probeServerProof sends a nonce and checks the answer", async () => {
  const { proof } = load();
  const honest = jest.fn(async (_url: string, init: RequestInit) => {
    const nonce = (init.headers as Record<string, string>)[proof.SERVER_PROOF_NONCE_HEADER];
    const value = proof.serverProofFor(proof.getServerProofSecret(), 7777, nonce);
    return { ok: true, headers: { get: () => value } } as unknown as Response;
  });
  expect(await proof.probeServerProof(7777, 1000, honest as unknown as typeof fetch)).toEqual({ ok: true, verified: true });
  const silent = jest.fn(async () => ({ ok: true, headers: { get: () => null } }) as unknown as Response);
  expect(await proof.probeServerProof(7777, 1000, silent as unknown as typeof fetch)).toEqual({ ok: true, verified: false });
});

test("the local origin is offered only for the trusted port while the server is started", () => {
  const { proof, state } = load();
  state.serverState.serverPort = 7777;
  state.serverState.isStarted = true;
  expect(proof.trustedLocalOrigin()).toBeNull();
  proof.setTrustedServerPort(7778);
  expect(proof.trustedLocalOrigin()).toBeNull();
  proof.setTrustedServerPort(7777);
  expect(proof.trustedLocalOrigin()).toBe("http://127.0.0.1:7777");
  state.serverState.isStarted = false;
  expect(proof.trustedLocalOrigin()).toBeNull();
});
