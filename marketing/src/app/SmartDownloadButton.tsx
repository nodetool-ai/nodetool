"use client";
import React, { useEffect, useState } from "react";
import { track } from "../lib/analytics";

type SmartDownloadButtonProps = {
  classNameOverride?: string;
  icon?: React.ReactNode;
  labelPrefix?: string;
};

/**
 * The download CTA every page carries.
 *
 * It names the reader's system and lands on /download, where that system's
 * installer is the first thing on the page along with what the app needs and
 * how to open it. It used to link to the GitHub releases page, which answered
 * an OS-specific label with a list of build artifacts.
 *
 * Apple silicon and Intel are not separated here: both report "MacIntel" and
 * telling them apart costs a WebGL context, which /download pays for once
 * rather than every page paying for it in a header CTA.
 */
export const SmartDownloadButton = ({
  classNameOverride,
  icon,
  labelPrefix = "Download NodeTool",
}: SmartDownloadButtonProps) => {
  const [osName, setOsName] = useState("");

  useEffect(() => {
    const ua = `${navigator.userAgent} ${navigator.platform || ""}`;
    if (/win/i.test(ua)) setOsName("Windows");
    else if (/mac/i.test(ua)) setOsName("macOS");
    else if (/linux|x11/i.test(ua)) setOsName("Linux");
  }, []);

  return (
    <a
      href="/download"
      onClick={() => track("Download CTA", { os: osName || "unknown" })}
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
