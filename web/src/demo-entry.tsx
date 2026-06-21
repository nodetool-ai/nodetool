/**
 * Standalone demo player page (web/demo.html).
 *
 * Loads a cast and renders it with a scrubber + play/pause for previewing and
 * authoring casts. Cast source:
 *   ?cast=<url>          fetch the cast JSON from a URL
 *   ?castData=<base64>   inline base64-encoded cast JSON
 *   (none)               the built-in sample cast
 *
 * Pinned assets resolve to `${assetsBase}/${file}` where assetsBase comes from
 * ?assets=<base> (default `/demo-assets/<castId>`).
 *
 * A `window.nodetoolDemo` API (seek/play/pause/duration/ready) lets a headless
 * driver scrub frames. The Remotion harness does NOT use this page — it embeds
 * <DemoPlayer> directly — but it is handy for quick visual checks.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";

import { DemoPlayer } from "./demo/DemoPlayer";
import { sampleCast } from "./demo/sampleCast";
import { isDemoCast, type DemoCast } from "./demo/castTypes";

interface NodetoolDemoApi {
  ready: boolean;
  durationMs: number;
  fps: number;
  seek: (ms: number) => void;
  play: () => void;
  pause: () => void;
}

declare global {
  interface Window {
    nodetoolDemo?: NodetoolDemoApi;
  }
}

async function loadCast(): Promise<DemoCast> {
  const params = new URLSearchParams(window.location.search);
  const inline = params.get("castData");
  if (inline) {
    const parsed: unknown = JSON.parse(atob(inline));
    if (!isDemoCast(parsed)) throw new Error("castData is not a valid cast");
    return parsed;
  }
  const url = params.get("cast");
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch cast: ${res.status}`);
    const parsed: unknown = await res.json();
    if (!isDemoCast(parsed)) throw new Error("Fetched cast is not valid");
    return parsed;
  }
  return sampleCast;
}

function assetsBaseFor(cast: DemoCast): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("assets") ?? `/demo-assets/${cast.id}`;
}

function App(): React.JSX.Element {
  const [cast, setCast] = useState<DemoCast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    loadCast().then(setCast).catch((e) => setError(String(e)));
  }, []);

  const assetsBase = cast ? assetsBaseFor(cast) : "";
  const resolveAssetUrl = useMemo(
    () => (file: string) => `${assetsBase}/${file}`,
    [assetsBase]
  );

  // Wall-clock playback when "playing".
  const rafRef = useRef(0);
  useEffect(() => {
    if (!cast || !playing) return;
    const start = performance.now() - timeMs;
    const tick = (now: number) => {
      const next = now - start;
      if (next >= cast.durationMs) {
        setTimeMs(cast.durationMs);
        setPlaying(false);
        return;
      }
      setTimeMs(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cast, playing]);

  // Expose the headless driver API.
  useEffect(() => {
    if (!cast) return;
    window.nodetoolDemo = {
      ready: true,
      durationMs: cast.durationMs,
      fps: cast.fps ?? 30,
      seek: (ms) => {
        setPlaying(false);
        setTimeMs(Math.max(0, Math.min(ms, cast.durationMs)));
      },
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
    };
    return () => {
      delete window.nodetoolDemo;
    };
  }, [cast]);

  if (error) {
    return (
      <div style={styles.center} data-ready="error">
        <pre style={{ color: "#f87171" }}>{error}</pre>
      </div>
    );
  }
  if (!cast) {
    return (
      <div style={styles.center} data-ready="false">
        Loading…
      </div>
    );
  }

  return (
    <div style={styles.root} data-ready="true">
      <div style={styles.stage}>
        <DemoPlayer cast={cast} timeMs={timeMs} resolveAssetUrl={resolveAssetUrl} />
      </div>
      <div style={styles.controls}>
        <button
          type="button"
          style={styles.button}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={cast.durationMs}
          step={10}
          value={timeMs}
          onChange={(e) => {
            setPlaying(false);
            setTimeMs(Number(e.target.value));
          }}
          style={styles.scrubber}
        />
        <span style={styles.time}>
          {(timeMs / 1000).toFixed(2)}s / {(cast.durationMs / 1000).toFixed(2)}s
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "#0f0f17" },
  stage: { flex: 1, minHeight: 0, position: "relative" },
  controls: { display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", background: "#15151f", borderTop: "1px solid #262633" },
  button: { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontSize: 13 },
  scrubber: { flex: 1, accentColor: "#7c3aed" },
  time: { color: "#94a3b8", fontFamily: "monospace", fontSize: 12, minWidth: 120, textAlign: "right" },
  center: { width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f0f17", color: "#64748b", fontFamily: "monospace" },
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);
