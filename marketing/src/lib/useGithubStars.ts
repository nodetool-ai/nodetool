"use client";
import { useEffect, useState } from "react";

const REPO_API = "https://api.github.com/repos/nodetool-ai/nodetool";
const CACHE_KEY = "nt-gh-stars";
const CACHE_TTL_MS = 60 * 60 * 1000;

let inflight: Promise<number | null> | null = null;

function readCache(): number | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { count, ts } = JSON.parse(raw) as { count: number; ts: number };
    if (typeof count !== "number" || Date.now() - ts > CACHE_TTL_MS)
      return null;
    return count;
  } catch {
    return null;
  }
}

function fetchStars(): Promise<number | null> {
  if (!inflight) {
    inflight = fetch(REPO_API)
      .then((r) => r.json())
      .then((j) => {
        if (typeof j.stargazers_count !== "number") return null;
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ count: j.stargazers_count, ts: Date.now() })
          );
        } catch {
          // sessionStorage unavailable (private mode) — count still returned
        }
        return j.stargazers_count as number;
      })
      .catch(() => null);
  }
  return inflight;
}

/**
 * GitHub star count for the NodeTool repo, deduped across components
 * (one request per page view) and cached per session.
 */
export function useGithubStars(): number | null {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const cached = readCache();
    if (cached !== null) {
      setStars(cached);
      return;
    }
    let alive = true;
    fetchStars().then((n) => {
      if (alive && n !== null) setStars(n);
    });
    return () => {
      alive = false;
    };
  }, []);

  return stars;
}

/** Compact "12.3k" formatting used by the star badges. */
export function formatStars(stars: number): string {
  return stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars);
}
