import { useEffect, useState, type ReactElement } from "react";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import WallpaperOutlinedIcon from "@mui/icons-material/WallpaperOutlined";
import { useTheme } from "@mui/material/styles";
import type { GameAssetMediaKind } from "@nodetool-ai/protocol";

import { BORDER_RADIUS, Box, Caption, FlexRow, ResponsiveImage, getSpacingPx } from "../../../ui_primitives";
import { asResolvedMediaUrl } from "../../../../utils/resolveMediaUri";
import type { GameAssetSource } from "./gameAssetBrowserModel";
import { audioWaveform, gameAssetLocator, gameFontFamily, modelThumbnail } from "./gameAssetMedia";

export interface GameAssetThumbnailProps {
  readonly source: GameAssetSource;
  readonly mediaKind: GameAssetMediaKind;
  readonly digest: string;
  readonly label: string;
  readonly bounds?: { readonly min: { x: number; y: number; z: number }; readonly max: { x: number; y: number; z: number } };
  readonly size?: "row" | "detail";
}

const SIZE_UNITS = { row: 10, detail: 24 } as const;

interface Preview {
  readonly key: string;
  readonly peaks?: readonly number[] | null;
  readonly family?: string | null;
  readonly url?: string | null;
}

function Waveform({ peaks }: { readonly peaks: readonly number[] }): ReactElement {
  return <svg viewBox={`0 0 ${peaks.length} 20`} preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">
    {peaks.map((peak, index) => {
      const height = Math.max(0.5, peak * 18);
      return <rect key={index} x={index + 0.15} width={0.7} y={10 - height / 2} height={height} fill="currentColor" />;
    })}
  </svg>;
}

/**
 * The browser's preview of one asset. Images use the stored thumbnail, audio
 * is drawn as its decoded waveform, models are rendered by the game
 * renderer, and fonts show a sample set in the font itself.
 */
export default function GameAssetThumbnail({ source, mediaKind, digest, label, bounds, size = "row" }: GameAssetThumbnailProps): ReactElement {
  const theme = useTheme();
  const background = theme.palette.background.default;
  const light = theme.palette.common.white;
  const key = `${mediaKind}:${digest}`;
  const [preview, setPreview] = useState<Preview | null>(null);
  // Built-in assets are drawn by the runtime and have no stored bytes to preview.
  const builtin = source.kind === "asset" && source.assetId.startsWith("builtin:");
  useEffect(() => {
    let live = true;
    const pending: Promise<Omit<Preview, "key">> | null = builtin ? null : mediaKind === "audio" ? audioWaveform(source).then((peaks) => ({ peaks }))
      : mediaKind === "font" ? gameFontFamily(source).then((family) => ({ family }))
      : mediaKind === "model" && bounds ? modelThumbnail(source, digest, bounds, { background, light }).then((url) => ({ url }))
      : null;
    void pending?.then((loaded) => { if (live) { setPreview({ key, ...loaded }); } });
    return () => { live = false; };
  }, [key, builtin, source, mediaKind, digest, bounds, background, light]);
  const current = preview?.key === key ? preview : null;
  const peaks = current?.peaks ?? null;
  const family = current?.family ?? null;
  const rendered = current?.url ?? null;
  const side = getSpacingPx(SIZE_UNITS[size]);
  const frame = { width: side, height: side, flexShrink: 0, borderRadius: BORDER_RADIUS.sm, overflow: "hidden",
    bgcolor: "action.hover", color: "text.secondary" } as const;
  if (mediaKind === "image" && !builtin) {
    return <ResponsiveImage locator={gameAssetLocator(source)} alt={label} preferThumbnail loading="lazy" fit="contain" sx={frame} />;
  }
  const modelUrl = asResolvedMediaUrl(rendered);
  if (mediaKind === "model" && modelUrl) {
    return <ResponsiveImage src={modelUrl} alt={label} fit="contain" sx={frame} />;
  }
  return <FlexRow align="center" justify="center" sx={frame} role="img" aria-label={label}>
    {mediaKind === "audio" && peaks ? <Box sx={{ width: "100%", height: "50%" }}><Waveform peaks={peaks} /></Box>
      : mediaKind === "audio" ? <AudiotrackOutlinedIcon fontSize="small" />
      : mediaKind === "image" ? <ImageOutlinedIcon fontSize="small" />
      : mediaKind === "font" ? <Caption sx={family ? { fontFamily: family } : undefined}>Aa</Caption>
      : mediaKind === "hdri" ? <WallpaperOutlinedIcon fontSize="small" />
      : <ViewInArOutlinedIcon fontSize="small" />}
  </FlexRow>;
}
