import { ogImage, ogSize, ogContentType } from "../../../lib/og";

export const alt = "@nodetool-ai/sandbox-compiler";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Will this npm package run in QuickJS?",
    "Bundle with esbuild, scan the AST, probe in an empty guest. MIT licensed.",
    { accent: "emerald", eyebrow: "@nodetool-ai/sandbox-compiler" }
  );
}
