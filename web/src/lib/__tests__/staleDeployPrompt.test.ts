/**
 * @jest-environment jsdom
 */
/**
 * staleDeployPrompt must never reload on its own. It opens the stale-deploy
 * dialog when the tab returns to view or a chunk fails, and only when
 * index.html no longer references this tab's entry script. Transient
 * chunk/CSS failures must not prompt.
 */
const GUARD_KEY = "nodetool:preload-error-reload";
const ENTRY_SRC = "/assets/index-abc123.js";

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Import once — the module registers listeners at import time, and
// re-importing per test would stack duplicate listeners.
import "../staleDeployPrompt";
import { useStaleDeployStore } from "../../stores/StaleDeployStore";
import { stub } from "../../test-utils/doubles";

const htmlResponse = (body: string, ok = true): Response =>
  stub<Response>({
    ok,
    status: ok ? 200 : 500,
    text: async () => body
  });

const STALE_HTML = '<script type="module" src="/assets/index-NEW.js"></script>';
const CURRENT_HTML = `<script type="module" src="${ENTRY_SRC}"></script>`;

const preloadErrorEvent = (payload: Error): Event => {
  const event = new Event("vite:preloadError", { cancelable: true });
  (event as Event & { payload: Error }).payload = payload;
  return event;
};

const firePreloadError = (): void => {
  window.dispatchEvent(
    preloadErrorEvent(new Error("Importing a module script failed."))
  );
};

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibility
});

const fireVisibility = (state: DocumentVisibilityState): void => {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
};

const flushAsync = async (): Promise<void> => {
  // Enough microtask turns for fetch → res.text() → store update.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

// The tab-return check is throttled to once a minute; move the clock past
// that window for every test.
let clock = 1_000_000_000;

describe("staleDeployPrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clock += 10 * 60_000;
    jest.spyOn(Date, "now").mockImplementation(() => clock);
    sessionStorage.clear();
    useStaleDeployStore.setState({
      open: false,
      reason: "update",
      dismissed: false
    });
    document.head.innerHTML = "";
    const script = document.createElement("script");
    script.type = "module";
    script.src = ENTRY_SRC;
    document.head.appendChild(script);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("chunk load failure", () => {
    it("opens the dialog instead of reloading when the deploy is stale", async () => {
      mockFetch.mockResolvedValue(htmlResponse(STALE_HTML));

      firePreloadError();
      await flushAsync();

      expect(useStaleDeployStore.getState()).toMatchObject({
        open: true,
        reason: "chunk-error"
      });
      expect(sessionStorage.getItem(GUARD_KEY)).toBeNull();
    });

    it("does not prompt when index.html still references the running entry", async () => {
      mockFetch.mockResolvedValue(htmlResponse(CURRENT_HTML));

      firePreloadError();
      await flushAsync();

      expect(mockFetch).toHaveBeenCalledWith(
        "/",
        expect.objectContaining({ cache: "no-store" })
      );
      expect(useStaleDeployStore.getState().open).toBe(false);
    });

    it("does not prompt when index.html cannot be fetched", async () => {
      mockFetch.mockRejectedValue(new Error("offline"));

      firePreloadError();
      await flushAsync();

      expect(useStaleDeployStore.getState().open).toBe(false);
    });

    it("prompts even after the user chose Later", async () => {
      useStaleDeployStore.setState({ dismissed: true });
      mockFetch.mockResolvedValue(htmlResponse(STALE_HTML));

      firePreloadError();
      await flushAsync();

      expect(useStaleDeployStore.getState().open).toBe(true);
    });

    it("does not re-check right after a reload", async () => {
      sessionStorage.setItem(GUARD_KEY, String(clock));

      firePreloadError();
      await flushAsync();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("suppresses Vite's rethrow for a failed CSS preload", async () => {
      mockFetch.mockResolvedValue(htmlResponse(""));
      const event = preloadErrorEvent(
        new Error("Unable to preload CSS for /assets/Widget-abc.css")
      );
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      await flushAsync();
    });

    // Suppressing a failed JS chunk makes Vite resolve the `import()` to
    // `undefined`, and React.lazy then crashes with "Cannot read properties of
    // undefined (reading 'default')" instead of surfacing the load failure.
    it("lets a failed JS chunk import reject", async () => {
      mockFetch.mockResolvedValue(htmlResponse(""));
      const event = preloadErrorEvent(
        new TypeError("Failed to fetch dynamically imported module")
      );
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      await flushAsync();
    });
  });

  describe("tab return", () => {
    it("opens the dialog when the tab becomes visible and the deploy is stale", async () => {
      mockFetch.mockResolvedValue(htmlResponse(STALE_HTML));

      fireVisibility("visible");
      await flushAsync();

      expect(useStaleDeployStore.getState()).toMatchObject({
        open: true,
        reason: "update"
      });
    });

    it("does not check when the tab is hidden", async () => {
      fireVisibility("hidden");
      await flushAsync();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does not prompt when the deploy is current", async () => {
      mockFetch.mockResolvedValue(htmlResponse(CURRENT_HTML));

      fireVisibility("visible");
      await flushAsync();

      expect(useStaleDeployStore.getState().open).toBe(false);
    });

    it("stays quiet after the user chose Later", async () => {
      useStaleDeployStore.getState().dismiss();
      mockFetch.mockResolvedValue(htmlResponse(STALE_HTML));

      fireVisibility("visible");
      await flushAsync();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(useStaleDeployStore.getState().open).toBe(false);
    });

    it("checks at most once a minute", async () => {
      mockFetch.mockResolvedValue(htmlResponse(CURRENT_HTML));

      fireVisibility("visible");
      await flushAsync();
      clock += 30_000;
      fireVisibility("visible");
      await flushAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
