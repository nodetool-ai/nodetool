/**
 * @jest-environment jsdom
 */
/**
 * preloadErrorReload must reload only for stale deploys (index.html no longer
 * references this tab's entry script), never for transient chunk/CSS failures
 * — those reloads masked errors and turned every affected click into a page
 * reload in production.
 *
 * jsdom's `location.reload` can't be mocked, so the reload itself is observed
 * via its precondition: the sessionStorage guard timestamp is written
 * immediately before `reload()` and only then.
 */
const GUARD_KEY = "nodetool:preload-error-reload";
const ENTRY_SRC = "/assets/index-abc123.js";

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Import once — the module registers a window listener at import time, and
// re-importing per test would stack duplicate listeners on the shared window.
import "../preloadErrorReload";

const htmlResponse = (body: string, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 500,
    text: async () => body
  }) as unknown as Response;

const firePreloadError = (): void => {
  window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
};

const flushAsync = async (): Promise<void> => {
  // Enough microtask turns for fetch → res.text() → guard write.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("preloadErrorReload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    document.head.innerHTML = "";
    const script = document.createElement("script");
    script.type = "module";
    script.src = ENTRY_SRC;
    document.head.appendChild(script);
  });

  it("does not reload when index.html still references the running entry", async () => {
    mockFetch.mockResolvedValue(
      htmlResponse(`<script type="module" src="${ENTRY_SRC}"></script>`)
    );

    firePreloadError();
    await flushAsync();

    expect(mockFetch).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(sessionStorage.getItem(GUARD_KEY)).toBeNull();
  });

  it("does not reload when index.html cannot be fetched", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));

    firePreloadError();
    await flushAsync();

    expect(sessionStorage.getItem(GUARD_KEY)).toBeNull();
  });

  it("does not re-check within the reload guard window", async () => {
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));

    firePreloadError();
    await flushAsync();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("suppresses Vite's default rethrow", async () => {
    mockFetch.mockResolvedValue(htmlResponse(""));
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await flushAsync();
  });

  // Last: jsdom's un-mockable location.reload logs a "Not implemented:
  // navigation" error once this path actually reloads.
  it("reloads when index.html no longer references the running entry", async () => {
    mockFetch.mockResolvedValue(
      htmlResponse('<script type="module" src="/assets/index-NEW.js"></script>')
    );

    firePreloadError();
    await flushAsync();

    expect(sessionStorage.getItem(GUARD_KEY)).not.toBeNull();
  });
});
