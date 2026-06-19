import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import {
  getHttpRateLimitConfig,
  rateLimitKey,
  isRateLimitExempt
} from "../src/lib/http-rate-limit.js";

const RATE_ENV_VARS = [
  "NODETOOL_RATE_LIMIT_DISABLED",
  "NODETOOL_RATE_LIMIT_MAX",
  "NODETOOL_RATE_LIMIT_WINDOW_MS",
  "NODETOOL_RATE_LIMIT_TRUST_PROXY"
] as const;

function clearRateEnv(): void {
  for (const key of RATE_ENV_VARS) delete process.env[key];
}

describe("getHttpRateLimitConfig", () => {
  afterEach(clearRateEnv);

  it("returns sane defaults", () => {
    clearRateEnv();
    expect(getHttpRateLimitConfig()).toEqual({
      enabled: true,
      max: 1000,
      timeWindow: 60_000,
      trustProxy: false
    });
  });

  it("reads overrides from the environment", () => {
    process.env.NODETOOL_RATE_LIMIT_DISABLED = "true";
    process.env.NODETOOL_RATE_LIMIT_MAX = "50";
    process.env.NODETOOL_RATE_LIMIT_WINDOW_MS = "5000";
    process.env.NODETOOL_RATE_LIMIT_TRUST_PROXY = "1";
    expect(getHttpRateLimitConfig()).toEqual({
      enabled: false,
      max: 50,
      timeWindow: 5000,
      trustProxy: true
    });
  });

  it("ignores invalid numeric overrides", () => {
    process.env.NODETOOL_RATE_LIMIT_MAX = "-5";
    process.env.NODETOOL_RATE_LIMIT_WINDOW_MS = "not-a-number";
    const config = getHttpRateLimitConfig();
    expect(config.max).toBe(1000);
    expect(config.timeWindow).toBe(60_000);
  });
});

describe("rateLimitKey", () => {
  it("uses the raw socket address by default (spoof-resistant)", () => {
    const req = { ip: "1.2.3.4", socket: { remoteAddress: "10.0.0.9" } };
    expect(rateLimitKey(req, false)).toBe("10.0.0.9");
  });

  it("uses req.ip when trustProxy is enabled", () => {
    const req = { ip: "1.2.3.4", socket: { remoteAddress: "10.0.0.9" } };
    expect(rateLimitKey(req, true)).toBe("1.2.3.4");
  });

  it("falls back to 'unknown' when no address is available", () => {
    expect(rateLimitKey({}, false)).toBe("unknown");
  });
});

describe("isRateLimitExempt", () => {
  it("exempts localhost addresses", () => {
    expect(isRateLimitExempt("127.0.0.1")).toBe(true);
    expect(isRateLimitExempt("::1")).toBe(true);
    expect(isRateLimitExempt("::ffff:127.0.0.1")).toBe(true);
  });

  it("does not exempt remote addresses", () => {
    expect(isRateLimitExempt("203.0.113.7")).toBe(false);
  });
});

describe("@fastify/rate-limit integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  async function buildApp(max: number) {
    const instance = Fastify({ trustProxy: true, logger: false });
    await instance.register(fastifyRateLimit, {
      global: true,
      max,
      timeWindow: 60_000,
      keyGenerator: (req) => rateLimitKey(req, false),
      allowList: (req) => isRateLimitExempt(rateLimitKey(req, false))
    });
    instance.get("/api/thing", async () => ({ ok: true }));
    await instance.ready();
    return instance;
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 429 once the per-IP limit is exceeded", async () => {
    app = await buildApp(2);
    const headers = { "x-forwarded-for": "203.0.113.7" };
    // fastify.inject reports remoteAddress as 127.0.0.1, which is exempt — so
    // exercise the limiter against a non-local socket address.
    const inject = (h: Record<string, string>) =>
      app!.inject({
        method: "GET",
        url: "/api/thing",
        headers: h,
        remoteAddress: "203.0.113.7"
      });

    expect((await inject(headers)).statusCode).toBe(200);
    expect((await inject(headers)).statusCode).toBe(200);
    const third = await inject(headers);
    expect(third.statusCode).toBe(429);
  });

  it("never throttles localhost", async () => {
    app = await buildApp(1);
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: "/api/thing" });
      expect(res.statusCode).toBe(200);
    }
  });
});
