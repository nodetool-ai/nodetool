import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, get } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { configureCertificateTrust } from "../certificateTrust";
import { isString } from "../typePredicates";

it("trusts an explicit desktop CA while preserving certificate verification", async () => {
  const dir = mkdtempSync(join(tmpdir(), "desktop-ca-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  const roots = getCACertificates("default");
  const original = process.env.NODETOOL_EXTRA_CA_CERTS;
  const generated = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  expect(generated.status).toBe(0);
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (_req, res) => res.end("trusted"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || isString(address)) throw new Error("missing test address");
  const request = (): Promise<number | undefined> => new Promise((resolve, reject) => {
    get(`https://127.0.0.1:${address.port}`, { agent: false }, (response) => { response.resume(); resolve(response.statusCode); }).on("error", reject);
  });
  try {
    await expect(request()).rejects.toThrow();
    process.env.NODETOOL_EXTRA_CA_CERTS = cert;
    configureCertificateTrust();
    await expect(request()).resolves.toBe(200);
  } finally {
    if (original === undefined) delete process.env.NODETOOL_EXTRA_CA_CERTS;
    else process.env.NODETOOL_EXTRA_CA_CERTS = original;
    setDefaultCACertificates(roots);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
