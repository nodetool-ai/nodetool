/**
 * A localized hero cut for 9:16 feeds (Bilibili, Xiaohongshu and Douyin for
 * Chinese; TikTok, Reels and X for Japanese): the 16:9 reel at full width,
 * with the language page's headline above and what it runs on below. Every
 * line here is copy the /zh or /ja page already makes, so the post and the
 * page agree.
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { HeroFlow } from "./HeroFlow";
import { COPY, type HeroLocale } from "./locale";
import { ACCENT_GRADIENT, C } from "./theme";

const REEL_W = 1080;
const REEL_H = (REEL_W * 9) / 16;
const REEL_TOP = 640;

type VerticalLocale = Extract<HeroLocale, "zh" | "ja">;

type VerticalText = {
  badge: string;
  /** The headline in two lines; the second takes the accent gradient. */
  headline: [string, string];
  /** Sized so the longer line fits the frame on one line. */
  headlineSize: number;
  lead: [string, string];
  runsOn: [string, string];
  platforms: string;
  url: string;
};

const TEXT: Record<VerticalLocale, VerticalText> = {
  zh: {
    badge: "开源 AI 电影工作室",
    headline: ["逐个镜头，", "导演你的 AI 电影。"],
    headlineSize: 92,
    lead: ["从一句话开始。", "智能体写故事、画静帧、剪成片。"],
    runsOn: ["智能体可以用 DeepSeek、通义千问，", "也可以用本地运行的开放权重模型。"],
    platforms: "免费开源 · macOS、Windows、Linux",
    url: "nodetool.ai/zh"
  },
  ja: {
    badge: "オープンソースのAI映画スタジオ",
    headline: ["AI映画を、", "ショットごとに演出する。"],
    headlineSize: 74,
    lead: ["一文から始めましょう。", "エージェントが書き、描き、編集します。"],
    runsOn: ["ChatGPTやClaudeのプラン、", "自分のAPIキー、ローカルモデルで動きます。"],
    platforms: "無料のオープンソース · macOS、Windows、Linux",
    url: "nodetool.ai/ja"
  }
};

export const VerticalCut: React.FC<{ locale: VerticalLocale }> = ({
  locale
}) => {
  const text = TEXT[locale];
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp"
  });
  return (
    <AbsoluteFill
      style={{
        background: C.stage,
        color: C.text,
        fontFamily: COPY[locale].font ?? undefined
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(70% 40% at 50% 18%, rgba(232,121,249,0.10), transparent 70%), radial-gradient(60% 30% at 50% 88%, rgba(91,134,196,0.12), transparent 70%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 210,
          left: 72,
          right: 72,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 34,
          opacity: fadeIn
        }}
      >
        <div
          style={{
            padding: "10px 26px",
            borderRadius: 999,
            border: `1px solid ${C.lineStrong}`,
            background: "rgba(255,255,255,0.05)",
            fontSize: 32,
            fontWeight: 500,
            color: C.dim
          }}
        >
          {text.badge}
        </div>
        <div
          style={{
            fontSize: text.headlineSize,
            fontWeight: 800,
            lineHeight: 1.18,
            letterSpacing: -1
          }}
        >
          {text.headline[0]}
          <br />
          <span
            style={{
              backgroundImage: ACCENT_GRADIENT,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent"
            }}
          >
            {text.headline[1]}
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: REEL_TOP,
          left: 0,
          width: REEL_W,
          height: REEL_H,
          overflow: "hidden",
          borderTop: `1px solid ${C.line}`,
          borderBottom: `1px solid ${C.line}`
        }}
      >
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${REEL_W / 1920})`,
            transformOrigin: "top left",
            position: "relative"
          }}
        >
          <HeroFlow locale={locale} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: REEL_TOP + REEL_H + 90,
          left: 80,
          right: 80,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 30,
          opacity: fadeIn
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.4 }}>
          {text.lead[0]}
          <br />
          {text.lead[1]}
        </div>
        <div style={{ fontSize: 34, lineHeight: 1.5, color: C.dim }}>
          {text.runsOn[0]}
          <br />
          {text.runsOn[1]}
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 34,
            fontWeight: 500,
            color: C.text
          }}
        >
          {text.platforms}
        </div>
        <div style={{ fontSize: 40, fontWeight: 600, color: C.fuchsia }}>
          {text.url}
        </div>
      </div>
    </AbsoluteFill>
  );
};
