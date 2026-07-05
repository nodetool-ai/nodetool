/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React from "react";

import HomeIcon from "@mui/icons-material/Home";
import SearchIcon from "@mui/icons-material/Search";
import ExtensionIcon from "@mui/icons-material/Extension";
import MemoryIcon from "@mui/icons-material/Memory";
import HubIcon from "@mui/icons-material/Hub";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import ChatIcon from "@mui/icons-material/Chat";
import BoltIcon from "@mui/icons-material/Bolt";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import ApiIcon from "@mui/icons-material/Api";

import openaiIcon from "@lobehub/icons-static-svg/icons/openai.svg";
import anthropicIcon from "@lobehub/icons-static-svg/icons/anthropic.svg";
import claudeColorIcon from "@lobehub/icons-static-svg/icons/claude-color.svg";
import geminiColorIcon from "@lobehub/icons-static-svg/icons/gemini-color.svg";
import huggingfaceColorIcon from "@lobehub/icons-static-svg/icons/huggingface-color.svg";
import ollamaIcon from "@lobehub/icons-static-svg/icons/ollama.svg";
import replicateIcon from "@lobehub/icons-static-svg/icons/replicate.svg";
import falColorIcon from "@lobehub/icons-static-svg/icons/fal-color.svg";
import mistralColorIcon from "@lobehub/icons-static-svg/icons/mistral-color.svg";
import groqIcon from "@lobehub/icons-static-svg/icons/groq.svg";
import deepseekColorIcon from "@lobehub/icons-static-svg/icons/deepseek-color.svg";
import xaiIcon from "@lobehub/icons-static-svg/icons/xai.svg";
import elevenlabsIcon from "@lobehub/icons-static-svg/icons/elevenlabs.svg";

import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import { MOTION, BORDER_RADIUS } from "../ui_primitives";

type SvgEntry = {
  kind: "svg";
  src: string;
  // When true, the icon is colored on a transparent background and looks fine
  // in dark mode. When false, we invert the icon in dark mode for visibility.
  preserveInDark?: boolean;
};

type MuiEntry = {
  kind: "mui";
  Component: React.ComponentType<{ fontSize?: "inherit" | "small" }>;
};

type IconEntry = SvgEntry | MuiEntry;

const NAMESPACE_ICONS: Record<string, IconEntry> = {
  // Local / abstract
  huggingface: { kind: "svg", src: huggingfaceColorIcon, preserveInDark: true },
  lib: { kind: "mui", Component: ExtensionIcon },
  mlx: { kind: "mui", Component: MemoryIcon },
  nodetool: { kind: "mui", Component: HubIcon },
  search: { kind: "mui", Component: SearchIcon },
  transformers: { kind: "mui", Component: AutoAwesomeIcon },
  vector: { kind: "mui", Component: ScatterPlotIcon },

  // Providers
  anthropic: { kind: "svg", src: anthropicIcon },
  claude: { kind: "svg", src: claudeColorIcon, preserveInDark: true },
  apify: { kind: "mui", Component: BoltIcon },
  elevenlabs: { kind: "svg", src: elevenlabsIcon },
  fal: { kind: "svg", src: falColorIcon, preserveInDark: true },
  gemini: { kind: "svg", src: geminiColorIcon, preserveInDark: true },
  google: { kind: "svg", src: geminiColorIcon, preserveInDark: true },
  kie: { kind: "mui", Component: MovieFilterIcon },
  messaging: { kind: "mui", Component: ChatIcon },
  mistral: { kind: "svg", src: mistralColorIcon, preserveInDark: true },
  openai: { kind: "svg", src: openaiIcon },
  ollama: { kind: "svg", src: ollamaIcon },
  replicate: { kind: "svg", src: replicateIcon },
  groq: { kind: "svg", src: groqIcon },
  deepseek: { kind: "svg", src: deepseekColorIcon, preserveInDark: true },
  xai: { kind: "svg", src: xaiIcon }
};

const FALLBACK_ENTRY: MuiEntry = { kind: "mui", Component: ApiIcon };

const HOME_ENTRY: MuiEntry = { kind: "mui", Component: HomeIcon };

const iconBoxStyles = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  flexShrink: 0,
  lineHeight: 0,
  "& img": {
    width: "100%",
    height: "100%",
    objectFit: "contain"
  },
  "& .MuiSvgIcon-root": {
    fontSize: 16
  }
});

// Rounded badge that frames the real provider/namespace icon, giving the
// sidebar a consistent app-launcher look regardless of icon shape.
const badgeStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    flexShrink: 0,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: theme.vars.palette.action.hover,
    border: `1px solid ${theme.vars.palette.divider}`,
    transition: `${MOTION.background}, border-color ${MOTION.fast}`
  });

interface NamespaceIconProps {
  namespace: string;
}

const renderEntry = (entry: IconEntry, isDarkMode: boolean) => {
  if (entry.kind === "mui") {
    const { Component } = entry;
    return <Component fontSize="inherit" />;
  }
  const filter =
    isDarkMode && !entry.preserveInDark
      ? "invert(1) brightness(1.1) contrast(0.9)"
      : undefined;
  return <img src={entry.src} alt="" style={filter ? { filter } : undefined} />;
};

const NamespaceBadge: React.FC<{ entry: IconEntry }> = ({ entry }) => {
  const isDarkMode = useIsDarkMode();
  const theme = useTheme();
  return (
    <span css={badgeStyles(theme)} className="namespace-icon">
      <span css={iconBoxStyles} className="namespace-icon-glyph">
        {renderEntry(entry, isDarkMode)}
      </span>
    </span>
  );
};

const NamespaceIcon: React.FC<NamespaceIconProps> = ({ namespace }) => {
  const key = namespace.toLowerCase();
  const entry = NAMESPACE_ICONS[key] ?? FALLBACK_ENTRY;
  return <NamespaceBadge entry={entry} />;
};

export const HomeNamespaceIcon: React.FC = () => (
  <NamespaceBadge entry={HOME_ENTRY} />
);

export default React.memo(NamespaceIcon);
