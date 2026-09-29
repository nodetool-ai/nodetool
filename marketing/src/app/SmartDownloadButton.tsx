"use client";
import React, { useEffect, useState } from "react";
import { track, type LandingPage } from "../lib/analytics";
import type { SearchStarter } from "../data/searchStarters";
import { detectBrowserPlatform, type BrowserPlatform } from "../lib/browserPlatform";

interface SmartDownloadButtonProps {
  classNameOverride?: string;
  icon?: React.ReactNode;
  labelPrefix?: string;
  source?: LandingPage;
  starter?: SearchStarter;
  placement?: "hero" | "closing" | "starter" | "other";
}

/**
 * The download CTA every page carries.
 *
 * Desktop labels name the system. Mobile readers get a desktop handoff on
 * /download, where they can choose the build for their computer.
 *
 * Apple silicon and Intel are not separated here: both report "MacIntel" and
 * telling them apart costs a WebGL context, which /download pays for once
 * rather than every page paying for it in a header CTA.
 */
export const SmartDownloadButton = ({
  classNameOverride,
  icon,
  labelPrefix = "Download NodeTool",
  source,
  starter,
  placement = "other",
}: SmartDownloadButtonProps): React.ReactElement => {
  const [platform, setPlatform] = useState<BrowserPlatform>("unknown");

  useEffect(() => {
    setPlatform(detectBrowserPlatform(navigator));
  }, []);

  const params = new URLSearchParams();
  if (source) {
    params.set("from", source);
  }
  if (starter) {
    params.set("starter", starter);
  }
  const query = params.toString();

  return (
    <a
      href={query ? `/download?${query}` : "/download"}
      onClick={() => track("Download CTA", {
        os: platform,
        placement,
        ...(source ? { landing_page: source } : {}),
        ...(starter ? { starter } : {}),
      })}
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
        {platform === "mobile" ? "Get the desktop app" : labelPrefix}
        {platform !== "mobile" && platform !== "unknown" ? ` for ${platform}` : ""}
      </span>
    </a>
  );
};
