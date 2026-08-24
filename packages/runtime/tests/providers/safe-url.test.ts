import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isBlockedIpLiteral,
  isSafePublicHttpsUrl,
  assertSafePublicHttpsUrl,
  safeFetch
} from "../../src/providers/safe-url.js";

describe("isSafePublicHttpsUrl", () => {
  it("accepts https URLs to public hosts", () => {
    expect(isSafePublicHttpsUrl("https://fal.media/files/result.png")).toBe(
      true
    );
    expect(isSafePublicHttpsUrl("https://example.com/a.mp4")).toBe(true);
    expect(isSafePublicHttpsUrl("https://8.8.8.8/x")).toBe(true);
  });

  it("rejects non-https schemes", () => {
    expect(isSafePublicHttpsUrl("http://fal.media/a.png")).toBe(false);
    expect(isSafePublicHttpsUrl("ftp://example.com/a.png")).toBe(false);
    expect(isSafePublicHttpsUrl("file:///etc/passwd")).toBe(false);
    expect(
      isSafePublicHttpsUrl("data:image/png;base64,AAAA")
    ).toBe(false);
  });

  it("rejects unparseable URLs", () => {
    expect(isSafePublicHttpsUrl("not a url")).toBe(false);
    expect(isSafePublicHttpsUrl("")).toBe(false);
  });

  it("rejects localhost and internal hostnames", () => {
    expect(isSafePublicHttpsUrl("https://localhost/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://foo.localhost/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://api.internal/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://db.local/x")).toBe(false);
  });

  it("rejects trailing-dot hostname bypasses", () => {
    expect(isSafePublicHttpsUrl("https://localhost./x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://db.local./x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://api.internal./x")).toBe(false);
  });

  it("rejects RFC1918 and loopback IPv4 literals", () => {
    expect(isSafePublicHttpsUrl("https://127.0.0.1/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://10.0.0.5/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://172.16.0.1/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://172.31.255.255/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://192.168.1.1/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://0.0.0.0/x")).toBe(false);
  });

  it("rejects link-local and CGNAT IPv4 literals", () => {
    expect(isSafePublicHttpsUrl("https://169.254.169.254/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://100.64.0.1/x")).toBe(false);
  });

  it("rejects loopback / ULA / link-local IPv6 literals", () => {
    expect(isSafePublicHttpsUrl("https://[::1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[fc00::1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[fd12::1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[fe80::1]/x")).toBe(false);
  });

  it("rejects link-local IPv6 across the whole fe80::/10 range", () => {
    expect(isSafePublicHttpsUrl("https://[fe90::1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[fea0::1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[febf::1]/x")).toBe(false);
  });

  it("rejects IPv4-mapped/-compatible IPv6 literals to private ranges", () => {
    // ::ffff:127.0.0.1 normalises to ::ffff:7f00:1
    expect(isSafePublicHttpsUrl("https://[::ffff:127.0.0.1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[::ffff:10.0.0.1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[::ffff:169.254.0.1]/x")).toBe(false);
    // IPv4-compatible ::127.0.0.1 normalises to ::7f00:1
    expect(isSafePublicHttpsUrl("https://[::127.0.0.1]/x")).toBe(false);
  });

  it("still accepts IPv4-mapped IPv6 to public addresses", () => {
    expect(isSafePublicHttpsUrl("https://[::ffff:8.8.8.8]/x")).toBe(true);
  });

  it("rejects private IPv4 embedded in 6to4 (2002::) addresses", () => {
    // 2002:WWXX:YYZZ:: encodes a.b.c.d in the second/third hextets.
    // 127.0.0.1 -> 7f00:0001
    expect(isSafePublicHttpsUrl("https://[2002:7f00:1::]/x")).toBe(false);
    // 10.0.0.5 -> 0a00:0005
    expect(isSafePublicHttpsUrl("https://[2002:a00:5::]/x")).toBe(false);
    // 169.254.169.254 -> a9fe:a9fe
    expect(isSafePublicHttpsUrl("https://[2002:a9fe:a9fe::]/x")).toBe(false);
  });

  it("rejects private IPv4 embedded in NAT64 (64:ff9b::) addresses", () => {
    // 64:ff9b::a.b.c.d / 64:ff9b::WWXX:YYZZ embeds IPv4 in the low 32 bits.
    expect(isSafePublicHttpsUrl("https://[64:ff9b::127.0.0.1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[64:ff9b::7f00:1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[64:ff9b::192.168.1.1]/x")).toBe(false);
  });

  it("rejects the metadata address through every IPv4-embedding prefix", () => {
    // The URL parser hex-serialises the trailing 32 bits, so these are the
    // forms the table actually sees.
    for (const url of [
      "https://[::ffff:169.254.169.254]/latest/meta-data/",
      "https://[::169.254.169.254]/latest/meta-data/",
      "https://[::ffff:0:169.254.169.254]/latest/meta-data/",
      "https://[64:ff9b::169.254.169.254]/latest/meta-data/",
      "https://[64:ff9b:1::169.254.169.254]/latest/meta-data/",
      "https://[2002:a9fe:a9fe::1]/latest/meta-data/"
    ]) {
      expect([url, isSafePublicHttpsUrl(url)]).toEqual([url, false]);
    }
  });

  it("still accepts 6to4 / NAT64 wrapping public IPv4", () => {
    // 8.8.8.8 -> 0808:0808
    expect(isSafePublicHttpsUrl("https://[2002:808:808::]/x")).toBe(true);
    expect(isSafePublicHttpsUrl("https://[64:ff9b::8.8.8.8]/x")).toBe(true);
  });

  it("rejects alternate IPv4 spellings of loopback", () => {
    // inet_aton forms: decimal, hex, octal, and the short 2-part form. The
    // WHATWG parser normalises each to 127.0.0.1 before the table sees it —
    // pinned here because that normalisation is what the table relies on, and
    // a hand-rolled host check would have to do it itself.
    expect(isSafePublicHttpsUrl("https://2130706433/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://0x7f000001/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://0177.0.0.1/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://127.1/x")).toBe(false);
  });

  it("rejects the benchmarking range 198.18.0.0/15", () => {
    // Came from the sandbox fetch guard's table when the two were merged.
    expect(isSafePublicHttpsUrl("https://198.18.0.1/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://198.19.255.255/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://198.20.0.1/x")).toBe(true);
  });
});

describe("isBlockedIpLiteral", () => {
  // The shared address table: `packages/agents/src/network-guard.ts` imports
  // this exact function, so the sandbox fetch bridge and NodeTool's default
  // egress policy cannot disagree about which addresses are internal.
  it("blocks every internal literal form", () => {
    for (const host of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "198.18.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "[::1]",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "febf::1",
      "fe80::1%eth0",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "2002:a9fe:a9fe::",
      "64:ff9b::169.254.169.254"
    ]) {
      expect([host, isBlockedIpLiteral(host)]).toEqual([host, true]);
    }
  });

  it("passes public literals and every hostname", () => {
    for (const host of [
      "8.8.8.8",
      "198.20.0.1",
      "2001:4860:4860::8888",
      "::ffff:8.8.8.8",
      "example.com",
      "metadata.example.com"
    ]) {
      expect([host, isBlockedIpLiteral(host)]).toEqual([host, false]);
    }
  });

  // An IPv6 literal's trailing 32 bits may be written dotted (`::ffff:127.0.0.1`)
  // or hex (`::ffff:7f00:1`). Both name one address, and the WHATWG URL parser
  // emits the hex form, so a table that answers them differently protects only
  // the spelling nobody sends.
  it("answers both spellings of one address the same way", () => {
    for (const [dotted, hexSerialized, blocked] of [
      // IPv4-mapped ::ffff:0:0/96
      ["::ffff:127.0.0.1", "::ffff:7f00:1", true],
      ["::ffff:8.8.8.8", "::ffff:808:808", false],
      // IPv4-compatible ::/96 (deprecated)
      ["::127.0.0.1", "::7f00:1", true],
      // IPv4-translated ::ffff:0:0:0/96
      ["::ffff:0:169.254.169.254", "::ffff:0:a9fe:a9fe", true],
      ["::ffff:0:8.8.8.8", "::ffff:0:808:808", false],
      // NAT64 64:ff9b::/96 and its local-use sibling 64:ff9b:1::/48
      ["64:ff9b::169.254.169.254", "64:ff9b::a9fe:a9fe", true],
      ["64:ff9b:1::169.254.169.254", "64:ff9b:1::a9fe:a9fe", true],
      ["64:ff9b:1::8.8.8.8", "64:ff9b:1::808:808", false]
    ] as const) {
      expect([dotted, isBlockedIpLiteral(dotted)]).toEqual([dotted, blocked]);
      expect([hexSerialized, isBlockedIpLiteral(hexSerialized)]).toEqual([
        hexSerialized,
        blocked
      ]);
    }
  });

  // 6to4 puts the routable IPv4 in the second and third hextets; the low 32
  // bits are an interface identifier the host picks and routing ignores.
  it("judges a 6to4 literal by its prefix, not its interface identifier", () => {
    // 2002:7f00:0203:: is 127.0.2.3 — internal whatever the tail says.
    expect(isBlockedIpLiteral("2002:7f00:203::102:304")).toBe(true);
    expect(isBlockedIpLiteral("2002:7f00:203::1.2.3.4")).toBe(true);
    // 2002:0808:0808:: is 8.8.8.8 — public whatever the tail says.
    expect(isBlockedIpLiteral("2002:808:808::7f00:304")).toBe(false);
    expect(isBlockedIpLiteral("2002:808:808::127.0.3.4")).toBe(false);
  });
});

describe("safeFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an unsafe initial URL without fetching", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(safeFetch("http://169.254.169.254/x")).rejects.toThrow(
      /unsafe URL/
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns the response for a safe non-redirect URL", async () => {
    const ok = new Response("body", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok);
    const res = await safeFetch("https://fal.media/a.png");
    expect(res.status).toBe(200);
  });

  it("validates redirect hops and refuses redirect to an internal host", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1:6379/" }
      })
    );
    await expect(safeFetch("https://fal.media/a.png")).rejects.toThrow(
      /unsafe URL/
    );
  });

  it("refuses a redirect to the metadata address over https", async () => {
    // The internal-host case above redirects to plain http, which the scheme
    // check alone would catch. This one keeps https, so only the address table
    // can refuse it.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://169.254.169.254/latest/meta-data/" }
      })
    );
    await expect(safeFetch("https://fal.media/a.png")).rejects.toThrow(
      /unsafe URL/
    );
  });

  it("follows a redirect to another safe host", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.fal.media/final.png" }
        })
      )
      .mockResolvedValueOnce(new Response("bytes", { status: 200 }));
    const res = await safeFetch("https://fal.media/a.png");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("strips auth headers and body on a cross-origin redirect", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: "https://cdn.other.com/final.png" }
        })
      )
      .mockResolvedValueOnce(new Response("bytes", { status: 200 }));
    await safeFetch("https://fal.media/a.png", {
      method: "POST",
      body: "secret-payload",
      headers: {
        Authorization: "Bearer token",
        "X-Goog-Api-Key": "gemini-secret",
        "X-Trace": "keep-me"
      }
    });
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = new Headers(secondInit.headers ?? undefined);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-goog-api-key")).toBeNull();
    expect(headers.get("x-trace")).toBe("keep-me");
    expect(secondInit.body).toBeUndefined();
  });

  it("preserves auth headers and body on a same-origin redirect", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: "https://fal.media/final.png" }
        })
      )
      .mockResolvedValueOnce(new Response("bytes", { status: 200 }));
    await safeFetch("https://fal.media/a.png", {
      method: "POST",
      body: "payload",
      headers: { Authorization: "Bearer token" }
    });
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = new Headers(secondInit.headers ?? undefined);
    expect(headers.get("authorization")).toBe("Bearer token");
    expect(secondInit.body).toBe("payload");
  });

  it("throws on a redirect loop exceeding the limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://other.fal.media/loop.png" }
      })
    );
    await expect(safeFetch("https://fal.media/a.png")).rejects.toThrow(
      /Too many redirects/
    );
  });
});

describe("assertSafePublicHttpsUrl", () => {
  it("does not throw for safe URLs", () => {
    expect(() =>
      assertSafePublicHttpsUrl("https://fal.media/a.png")
    ).not.toThrow();
  });

  it("throws for unsafe URLs", () => {
    expect(() =>
      assertSafePublicHttpsUrl("http://169.254.169.254/latest/meta-data/")
    ).toThrow(/unsafe URL/);
    expect(() => assertSafePublicHttpsUrl("https://localhost/x")).toThrow(
      /unsafe URL/
    );
  });
});
