"use client";
import React, { useEffect, useState } from "react";
import { track } from "../lib/analytics";

type SmartDownloadButtonProps = {
  classNameOverride?: string;
  icon?: React.ReactNode;
  labelPrefix?: string;
};

const RELEASES_URL = "https://github.com/nodetool-ai/nodetool/releases/latest";

/**
 * Apple Silicon vs Intel can't be read from `navigator.platform` (both report
 * "MacIntel"). The WebGL renderer string is the reliable browser-side signal:
 * Apple Silicon reports an "Apple" GPU, Intel Macs report Intel/AMD.
 */
function isAppleSilicon(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return false;
    const renderer = String(
      gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ""
    );
    return /apple/i.test(renderer);
  } catch {
    return false;
  }
}

export const SmartDownloadButton = ({
  classNameOverride,
  icon,
  labelPrefix = "Download NodeTool",
}: SmartDownloadButtonProps) => {
  // Default to the releases page — always a valid link, never a 404 from a
  // stale hardcoded version (P4). A direct per-OS link replaces it once we
  // know the latest release tag and can build a real artifact URL.
  const [downloadUrl, setDownloadUrl] = useState(RELEASES_URL);
  const [osName, setOsName] = useState("");

  useEffect(() => {
    const detect = async () => {
      let version = "";
      try {
        const response = await fetch(
          "https://api.github.com/repos/nodetool-ai/nodetool/releases/latest"
        );
        const data = await response.json();
        if (typeof data?.tag_name === "string") {
          version = data.tag_name.replace(/^v/, "");
        }
      } catch {
        // Leave version empty — we fall back to the releases page below.
      }

      const ua = navigator.userAgent;
      const platform = navigator.platform || "";
      const isWin = ua.includes("Win") || platform.includes("Win");
      const isMac =
        ua.includes("Mac") || platform.includes("Mac");
      const isLinux = ua.includes("Linux") || platform.includes("Linux");

      const direct = (file: string) =>
        `https://github.com/nodetool-ai/nodetool/releases/download/v${version}/${file}`;

      if (isWin) {
        setOsName("Windows");
        setDownloadUrl(version ? direct(`Nodetool-Setup-${version}.exe`) : RELEASES_URL);
      } else if (isMac) {
        setOsName("macOS");
        // Only Apple Silicon has a known direct artifact. Intel Macs (and any
        // uncertainty) go to the releases page so they pick a working build
        // instead of a broken arm64 link.
        setDownloadUrl(
          version && isAppleSilicon()
            ? direct(`Nodetool-${version}-arm64.dmg`)
            : RELEASES_URL
        );
      } else if (isLinux) {
        setOsName("Linux");
        setDownloadUrl(
          version ? direct(`Nodetool-${version}-x86_64.AppImage`) : RELEASES_URL
        );
      } else {
        setOsName("");
        setDownloadUrl(RELEASES_URL);
      }
    };

    detect();
  }, []);

  return (
    <a
      href={downloadUrl}
      onClick={() => track("Download", { os: osName || "unknown" })}
      className={
        classNameOverride ??
        "inline-flex items-center bg-white hover:bg-gray-100 text-black px-8 py-4 rounded-full text-lg font-medium transition-all duration-300 shadow-lg"
      }
    >
      {icon ? (
        <span className="mr-3 inline-flex items-center" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span>
        {labelPrefix}
        {osName ? ` for ${osName}` : ""}
      </span>
    </a>
  );
};
