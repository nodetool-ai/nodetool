"use client";
import React, { useEffect, useState } from "react";
import { Apple, Download, Monitor, Terminal } from "lucide-react";
import { track } from "../lib/analytics";

/**
 * The installer picker on /download.
 *
 * Artifact URLs come from the release the GitHub API reports, matched by
 * filename against the targets electron-builder writes — never composed from a
 * version string. A composed URL 404s the moment a target is renamed, and a
 * 404 on the one button the whole site points at is the worst failure this
 * page has. When the API is unreachable every card falls back to the releases
 * page, which is always valid.
 */

const REPO = "nodetool-ai/nodetool";
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

type PlatformId = "mac-arm" | "mac-intel" | "windows" | "linux";

interface Platform {
  id: PlatformId;
  /** Card heading. */
  name: string;
  /** What the reader checks themselves to know this is their build. */
  note: string;
  icon: typeof Apple;
  /** Matches the artifact electron-builder writes for this target. */
  match: RegExp;
}

const PLATFORMS: Platform[] = [
  {
    id: "mac-arm",
    name: "macOS · Apple silicon",
    note: "M1 and later. macOS 12 or newer.",
    icon: Apple,
    match: /arm64\.dmg$/i,
  },
  {
    id: "mac-intel",
    name: "macOS · Intel",
    note: "Intel Macs. macOS 12 or newer.",
    icon: Apple,
    match: /x64\.dmg$/i,
  },
  {
    id: "windows",
    name: "Windows",
    note: "64-bit Windows 10 or 11.",
    icon: Monitor,
    match: /Setup-.*\.exe$/i,
  },
  {
    id: "linux",
    name: "Linux",
    note: "AppImage, 64-bit. A Flatpak ships with each release too.",
    icon: Terminal,
    match: /\.AppImage$/i,
  },
];

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name?: string;
  assets?: ReleaseAsset[];
}

function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/**
 * Apple silicon and Intel both report "MacIntel" in `navigator.platform`, so
 * the GPU renderer string is the signal that separates them.
 */
function isAppleSilicon(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (!gl || !ext) return false;
    return /apple/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ""));
  } catch {
    return false;
  }
}

function detectPlatform(): PlatformId | null {
  if (typeof navigator === "undefined") return null;
  const ua = `${navigator.userAgent} ${navigator.platform || ""}`;
  if (/win/i.test(ua)) return "windows";
  if (/mac/i.test(ua)) return isAppleSilicon() ? "mac-arm" : "mac-intel";
  if (/linux|x11/i.test(ua)) return "linux";
  return null;
}

export default function DownloadPanel() {
  const [release, setRelease] = useState<Release | null>(null);
  const [current, setCurrent] = useState<PlatformId | null>(null);

  useEffect(() => {
    setCurrent(detectPlatform());
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((r) => r.json())
      .then(setRelease)
      .catch(() => {
        // Unreachable or rate-limited: every card links to the releases page.
      });
  }, []);

  const version = release?.tag_name?.replace(/^v/, "") ?? null;
  const assetFor = (platform: Platform) =>
    release?.assets?.find((a) => platform.match.test(a.name)) ?? null;

  const recommended = PLATFORMS.find((p) => p.id === current) ?? null;
  const others = PLATFORMS.filter((p) => p.id !== recommended?.id);

  const card = (platform: Platform, primary: boolean) => {
    const asset = assetFor(platform);
    const href = asset?.browser_download_url ?? RELEASES_URL;
    const Icon = platform.icon;
    return (
      <a
        key={platform.id}
        href={href}
        onClick={() => track("Download", { os: platform.id })}
        className={
          primary
            ? "flex items-center gap-4 rounded-2xl border border-blue-500/40 bg-blue-500/10 px-6 py-5 transition-colors hover:border-blue-400 hover:bg-blue-500/15 focus-ring"
            : "flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/40 px-5 py-4 transition-colors hover:border-slate-600 hover:bg-slate-900/70 focus-ring"
        }
      >
        <Icon
          className={primary ? "h-7 w-7 text-blue-300" : "h-5 w-5 text-slate-400"}
          aria-hidden
        />
        <span className="min-w-0">
          <span className="block font-semibold text-white">
            {primary ? `Download for ${platform.name}` : platform.name}
          </span>
          <span className="mt-0.5 block text-xs text-slate-400">
            {platform.note}
            {asset ? ` · ${formatSize(asset.size)}` : ""}
            {version ? ` · ${version}` : ""}
          </span>
        </span>
        <Download
          className="ml-auto h-4 w-4 shrink-0 text-slate-400"
          aria-hidden
        />
      </a>
    );
  };

  return (
    <div className="space-y-4">
      {recommended ? (
        card(recommended, true)
      ) : (
        <p className="rounded-2xl border border-white/10 bg-slate-900/40 px-6 py-5 text-sm text-slate-300">
          Pick the build for your machine.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {others.map((platform) => card(platform, false))}
      </div>

      <p className="text-xs text-slate-500">
        Every build, its release notes, and the checksums are on{" "}
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 underline underline-offset-2 hover:text-slate-200"
        >
          the GitHub releases page
        </a>
        .
      </p>
    </div>
  );
}
