"use client";
import React, { useEffect, useState } from "react";

type SmartDownloadButtonProps = {
  classNameOverride?: string;
  icon?: React.ReactNode;
  labelPrefix?: string;
};

const FALLBACK_VERSION = "0.6.3-rc.11";

export const SmartDownloadButton = ({
  classNameOverride,
  icon,
  labelPrefix = "Download Nodetool",
}: SmartDownloadButtonProps) => {
  const [downloadUrl, setDownloadUrl] = useState("");
  const [osName, setOsName] = useState("");

  useEffect(() => {
    const fetchVersionAndDetectOS = async () => {
      let version = FALLBACK_VERSION;
      try {
        const response = await fetch(
          "https://api.github.com/repos/nodetool-ai/nodetool/releases/latest"
        );
        const data = await response.json();
        version = data.tag_name.replace("v", "");
      } catch (error) {
        console.error("Failed to fetch latest version:", error);
      }

      const userAgent = navigator.userAgent;
      const platform = navigator.platform;

      if (userAgent.includes("Win") || platform.includes("Win")) {
        setOsName("Windows");
        setDownloadUrl(
          `https://github.com/nodetool-ai/nodetool/releases/download/v${version}/Nodetool-Setup-${version}.exe`
        );
      } else if (userAgent.includes("Mac") || platform.includes("Mac")) {
        setOsName("macOS");
        setDownloadUrl(
          `https://github.com/nodetool-ai/nodetool/releases/download/v${version}/Nodetool-${version}-arm64.dmg`
        );
      } else if (userAgent.includes("Linux") || platform.includes("Linux")) {
        setOsName("Linux");
        setDownloadUrl(
          `https://github.com/nodetool-ai/nodetool/releases/download/v${version}/Nodetool-${version}-x86_64.AppImage`
        );
      } else {
        setOsName("");
        setDownloadUrl(
          "https://github.com/nodetool-ai/nodetool/releases/latest"
        );
      }
    };

    fetchVersionAndDetectOS();
  }, []);

  return (
    <a
      href={downloadUrl}
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
