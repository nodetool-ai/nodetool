/**
 * The Comfy "Open Source Higgsfield" challenge film: a coffee ad made in
 * NodeTool, from brief to export, in at most two minutes.
 *
 * Every beat draws a look-alike of the product surface in the hero reel's
 * style. A screen recording at `casts/comfy-challenge/beat-NN.mp4` replaces
 * the drawn surface for that beat, and the caption stays on top.
 *
 * Drawn surfaces carry a "Reconstructed UI" tag until `draftTags` is false.
 * The three flags select the beat sheet's fallbacks for features with no
 * browser verification (docs/comfy-challenge/evidence.md).
 */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  getStaticFiles,
  interpolate,
  staticFile,
  useCurrentFrame
} from "remotion";

import { useInterFont } from "../promo/fonts";
import { C, FONT, R } from "../heroflow/theme";
import { Icon, MetaChip, Panel, PanelHeader, Stage } from "../heroflow/ui";

export const FPS = 30;

export type ComfyChallengeProps = {
  /** The Director agent writes the shots from a brief. */
  director: boolean;
  /** The timeline clip follows the picked take. */
  timelineFollows: boolean;
  /** The export button produces the final file. */
  exportWorks: boolean;
  /** Marks surfaces that are drawn rather than recorded. */
  draftTags: boolean;
};

export const DEFAULT_FLAGS: ComfyChallengeProps = {
  director: false,
  timelineFollows: true,
  exportWorks: false,
  draftTags: true
};

const asset = (file: string): string => staticFile(`casts/comfy-challenge/${file}`);
const hasFile = (file: string): boolean =>
  getStaticFiles().some((f) => f.name === `casts/comfy-challenge/${file}`);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, a: number, b: number): number => {
  const x = interpolate(t, [a, b], [0, 1], clamp);
  return x * x * (3 - 2 * x);
};
const useT = (): number => useCurrentFrame() / FPS;

// ─── The ad's three shots ───────────────────────────────────────────────────

const SHOTS = [
  { label: "Wide of the table", move: "orbit", clip: "shot-1.mp4", zoom: 1, origin: "50% 50%" },
  { label: "Dolly in on the cup", move: "dolly in", clip: "shot-2.mp4", zoom: 1.25, origin: "50% 55%" },
  { label: "Close-up of steam", move: "crane up", clip: "shot-3.mp4", zoom: 1.7, origin: "50% 45%" }
] as const;

const Still: React.FC<{ zoom?: number; origin?: string }> = ({ zoom = 1, origin = "50% 50%" }) => (
  <Img
    src={asset("coffee.jpg")}
    style={{
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transform: `scale(${zoom})`,
      transformOrigin: origin
    }}
  />
);

/** Renders drift from the still in their last second, so clips loop short of it. */
const CLEAN_FRAMES = 100;

const video = (file: string, muted: boolean, rate?: number): React.ReactElement => (
  <OffthreadVideo
    src={asset(file)}
    muted={muted}
    playbackRate={rate}
    style={{ width: "100%", height: "100%", objectFit: "cover" }}
  />
);

const Clip: React.FC<{ file: string; muted?: boolean }> = ({ file, muted = true }) => (
  <Loop durationInFrames={CLEAN_FRAMES} layout="none">
    {video(file, muted)}
  </Loop>
);

/** A shot's rendered clip, or its still until the clip exists. */
const ShotMedia: React.FC<{ index: number; muted?: boolean }> = ({ index, muted }) => {
  const s = SHOTS[index];
  return hasFile(s.clip) ? <Clip file={s.clip} muted={muted} /> : <Still zoom={s.zoom} origin={s.origin} />;
};

// ─── Shared surface pieces ──────────────────────────────────────────────────

const Cursor: React.FC<{ t: number; path: ReadonlyArray<readonly [number, number, number]> }> = ({ t, path }) => {
  let x = path[0][1];
  let y = path[0][2];
  for (let i = 1; i < path.length; i++) {
    const p = ease(t, path[i - 1][0], path[i][0]);
    x += (path[i][1] - path[i - 1][1]) * p;
    y += (path[i][2] - path[i - 1][2]) * p;
  }
  return (
    <svg width={34} height={34} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, zIndex: 20 }}>
      <path d="M5 3l14 7-6 2-2 6z" fill={C.text} stroke={C.stage} strokeWidth={1.2} />
    </svg>
  );
};

const Button: React.FC<{ label: string; color?: string; active?: boolean }> = ({ label, color = C.video, active }) => (
  <div
    style={{
      padding: "10px 18px",
      borderRadius: R.pill,
      fontSize: 18,
      fontWeight: 600,
      background: active ? `${color}88` : `${color}33`,
      border: `1px solid ${color}88`,
      whiteSpace: "nowrap"
    }}
  >
    {label}
  </div>
);

const Progress: React.FC<{ p: number }> = ({ p }) => (
  <div style={{ height: 8, borderRadius: R.pill, background: C.line, overflow: "hidden" }}>
    <div style={{ width: `${p * 100}%`, height: "100%", background: C.video }} />
  </div>
);

const Centered: React.FC<{ children: React.ReactNode; top?: number }> = ({ children, top = 110 }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: top }}>{children}</AbsoluteFill>
);

const ShotCard: React.FC<{ index: number; t: number; at: number; playing?: boolean; active?: boolean }> = ({
  index,
  t,
  at,
  playing,
  active
}) => {
  const s = SHOTS[index];
  const p = ease(t, at, at + 0.6);
  return (
    <div
      style={{
        width: 520,
        opacity: p,
        transform: `translateY(${(1 - p) * 30}px)`,
        background: C.overlay,
        borderRadius: R.md,
        overflow: "hidden",
        border: `1px solid ${active ? C.video : C.line}`
      }}
    >
      <div style={{ height: 292, overflow: "hidden", position: "relative" }}>
        {playing ? <ShotMedia index={index} /> : <Still zoom={s.zoom} origin={s.origin} />}
      </div>
      <div style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>
          {index + 1}. {s.label}
        </div>
        <MetaChip icon="camera" label={s.move} color={C.video} />
      </div>
    </div>
  );
};

// ─── Beats ──────────────────────────────────────────────────────────────────

/** The whole ad, one H3 Max generation with its native audio. */
const Hook: React.FC = () => (
  <AbsoluteFill style={{ background: C.stage }}>
    {video("h3-ad.mp4", false)}
    <Sequence durationInFrames={6 * FPS} layout="none">
      <Caption text="This ad was generated in NodeTool with MiniMax H3 Max through Comfy Router." />
    </Sequence>
  </AbsoluteFill>
);

const Title: React.FC<{ card?: "title" | "end" }> = ({ card = "title" }) => {
  const t = useT();
  const p = ease(t, 0.1, 0.9);
  return (
    <Stage>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 30,
          opacity: p,
          transform: `translateY(${(1 - p) * 24}px)`
        }}
      >
        <Img src={staticFile("casts/promo/logo.png")} style={{ height: 120 }} />
        {card === "title" ? (
          <>
            <div style={{ fontSize: 76, fontWeight: 800, maxWidth: 1500, lineHeight: 1.1 }}>
              NodeTool: The Open-Source AI Filmmaking Studio
            </div>
            <div style={{ fontSize: 40, color: C.dim }}>powered by ComfyUI</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 76, fontWeight: 800 }}>Open source. Powered by ComfyUI.</div>
            <div style={{ fontSize: 44 }}>github.com/nodetool-ai/nodetool</div>
            <div style={{ fontSize: 36, color: C.dim }}>#OpenSourceHiggsfield</div>
          </>
        )}
      </AbsoluteFill>
    </Stage>
  );
};

const BRIEF = "A 15-second coffee ad: a café table, the cup, the steam.";

const Brief: React.FC<{ director: boolean }> = ({ director }) => {
  const t = useT();
  const typed = BRIEF.slice(0, Math.floor(interpolate(t, [0.5, 4.5], [0, BRIEF.length], clamp)));
  return (
    <Stage>
      <Centered>
        <Panel style={{ width: 1720 }}>
          <PanelHeader icon="grid" title="Coffee ad — Storyboard" accent={C.fuchsia} />
          {director ? (
            <div style={{ padding: "22px 28px 0", fontSize: 26, display: "flex", gap: 12 }}>
              <Icon name="pointer" size={24} color={C.dim} />
              {typed}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 20, padding: 28, justifyContent: "center" }}>
            {SHOTS.map((_, i) => (
              <ShotCard key={i} index={i} t={t} at={director ? 5.5 + i * 1.4 : 0.6 + i * 0.8} />
            ))}
          </div>
        </Panel>
      </Centered>
    </Stage>
  );
};

const Board: React.FC = () => {
  const t = useT();
  return (
    <Stage>
      <Centered>
        <Panel style={{ width: 1720 }}>
          <PanelHeader
            icon="grid"
            title="Coffee ad — Storyboard"
            accent={C.fuchsia}
            meta={<MetaChip label="Camera presets" icon="camera" color={C.video} />}
          />
          <div style={{ display: "flex", gap: 20, padding: 28, justifyContent: "center" }}>
            {SHOTS.map((_, i) => (
              <ShotCard key={i} index={i} t={t + 1} at={0} active={Math.floor(t / 5) === i} />
            ))}
          </div>
        </Panel>
      </Centered>
    </Stage>
  );
};

/** The models the beat sheet names. MiniMax H3 stays off screen. */
const MODELS = ["Wan 2.2 5B", "Wan 2.2 14B", "LTX-2.3 (with audio)"];

const Render: React.FC = () => {
  const t = useT();
  const picked = t > 6;
  const rendering = t > 8;
  const p = interpolate(t, [8, 15], [0, 1], clamp);
  return (
    <Stage>
      <Centered>
        <Panel style={{ width: 1200 }}>
          <PanelHeader icon="film" title="Render clip — Shot 2" accent={C.video} />
          <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
            {p < 1 ? (
              <>
                <div style={{ display: "flex", gap: 14 }}>
                  {MODELS.map((m, i) => (
                    <Button key={m} label={m} color={i === 2 && picked ? C.video : C.dim} active={i === 2 && picked} />
                  ))}
                </div>
                <div style={{ fontSize: 20, color: C.dim, lineHeight: 1.4 }}>
                  Runs a pinned ComfyUI workflow on Comfy Cloud with core ComfyUI nodes. Camera presets guide the
                  prompt. They are not geometric camera control.
                </div>
                <div style={{ height: 380, borderRadius: R.md, overflow: "hidden" }}>
                  <Still zoom={1.25} origin="50% 55%" />
                </div>
                {rendering ? <Progress p={p} /> : <div style={{ alignSelf: "flex-end" }}><Button label="Render clip" /></div>}
              </>
            ) : (
              <div style={{ height: 640, borderRadius: R.md, overflow: "hidden" }}>
                <Sequence from={15 * FPS} layout="none">
                  <ShotMedia index={1} muted={false} />
                </Sequence>
              </div>
            )}
          </div>
        </Panel>
        {rendering && p < 1 ? (
          <div style={{ position: "absolute", top: 90, right: 90, fontSize: 28, fontWeight: 600, color: C.warning }}>
            Sped up: real render ≈ 40 s
          </div>
        ) : null}
        {p < 1 ? <Cursor t={t} path={[[2, 1400, 900], [5.5, 1210, 225], [7.5, 1370, 870], [9, 1500, 950]]} /> : null}
      </Centered>
    </Stage>
  );
};

const Takes: React.FC = () => {
  const t = useT();
  const second = t > 6;
  const pick = t > 10;
  return (
    <Stage>
      <Centered>
        <Panel style={{ width: 1500 }}>
          <PanelHeader icon="layers" title="Shot 2 — Takes" accent={C.video} />
          <div style={{ display: "flex", gap: 24, padding: 28, justifyContent: "center" }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ width: 680, opacity: i === 0 || second ? 1 : 0.25 }}>
                <div
                  style={{
                    height: 382,
                    borderRadius: R.md,
                    overflow: "hidden",
                    border: `3px solid ${(i === 1) === pick && second ? C.video : C.line}`
                  }}
                >
                  {i === 0 ? <ShotMedia index={1} /> : second && hasFile("shot-2b.mp4") ? <Clip file="shot-2b.mp4" /> : <Still zoom={1.25} />}
                </div>
                <div style={{ fontSize: 24, marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
                  Clip {i + 1}
                  {(i === 1) === pick && second ? <Icon name="check" size={24} color={C.success} /> : null}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </Centered>
    </Stage>
  );
};

const TimelineFollow: React.FC = () => {
  const t = useT();
  const swap = ease(t, 3, 4);
  return (
    <Stage>
      <Centered>
        <Panel style={{ width: 1600 }}>
          <PanelHeader icon="cut" title="Coffee ad — Timeline" accent={C.video} />
          <div style={{ padding: 30, display: "flex", gap: 8 }}>
            {SHOTS.map((s, i) => (
              <div key={i} style={{ flex: 1, height: 240, borderRadius: R.sm, overflow: "hidden", position: "relative" }}>
                <Still zoom={s.zoom} origin={s.origin} />
                {i === 1 ? (
                  <AbsoluteFill style={{ border: `4px solid ${C.video}`, opacity: swap, background: `${C.video}22` }} />
                ) : null}
              </div>
            ))}
          </div>
          <div style={{ padding: "0 30px 30px", fontSize: 24, color: C.dim }}>
            Shot 2 · {swap > 0.5 ? "Clip 2" : "Clip 1"}
          </div>
        </Panel>
      </Centered>
    </Stage>
  );
};

const NODES = [
  { name: "Source still", x: 120, y: 380, color: C.image },
  { name: "Camera preset", x: 120, y: 620, color: C.video },
  { name: "Compose prompt", x: 560, y: 500, color: C.textual },
  { name: "Run ComfyUI Workflow (Comfy Cloud)", x: 1000, y: 440, color: C.info },
  { name: "Take", x: 1480, y: 440, color: C.video }
];
const EDGES: ReadonlyArray<readonly [number, number]> = [[0, 2], [1, 2], [2, 3], [3, 4]];
const NODE_W = 340;

const Graph: React.FC = () => {
  const t = useT();
  const running = t > 5;
  const p = interpolate(t, [5, 12], [0, 1], clamp);
  return (
    <Stage>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {EDGES.map(([a, b]) => {
          const x1 = NODES[a].x + NODE_W;
          const y1 = NODES[a].y + 50;
          const x2 = NODES[b].x;
          const y2 = NODES[b].y + 50;
          return (
            <path
              key={`${a}-${b}`}
              d={`M${x1} ${y1} C${x1 + 80} ${y1} ${x2 - 80} ${y2} ${x2} ${y2}`}
              stroke={C.lineStrong}
              strokeWidth={3}
              fill="none"
            />
          );
        })}
      </svg>
      {NODES.map((n, i) => (
        <div
          key={n.name}
          style={{
            position: "absolute",
            left: n.x,
            top: n.y,
            width: NODE_W,
            background: C.overlay,
            borderRadius: R.md,
            border: `1px solid ${i === 3 && running && p < 1 ? C.info : C.line}`,
            padding: 18,
            fontSize: 21,
            fontWeight: 600
          }}
        >
          <div style={{ width: 40, height: 4, background: n.color, marginBottom: 12 }} />
          {n.name}
          {i === 3 && running ? (
            <div style={{ marginTop: 14 }}>
              <Progress p={p} />
            </div>
          ) : null}
          {i === 4 && p >= 1 ? (
            <div style={{ marginTop: 12, height: 170, borderRadius: R.sm, overflow: "hidden" }}>
              <Sequence from={12 * FPS} layout="none">
                <ShotMedia index={1} />
              </Sequence>
            </div>
          ) : null}
        </div>
      ))}
      <div style={{ position: "absolute", top: 170, left: 120, fontSize: 44, fontWeight: 800 }}>
        The exact graph behind the shot
      </div>
      {running && p < 1 ? (
        <div style={{ position: "absolute", top: 90, right: 90, fontSize: 28, fontWeight: 600, color: C.warning }}>
          Sped up
        </div>
      ) : null}
    </Stage>
  );
};

/** Real ids from packages/runtime/src/providers/comfy-router-catalog.ts. */
const ROUTER = [
  "bfl/flux-3-video",
  "bria/image-edit-remove-background",
  "byteplus/seedance-1-0-pro-fast-251015",
  "kling/kling-v2-5-turbo",
  "luma/photon-flash-1",
  "moonvalley/image-to-video",
  "recraft/recraftv2",
  "veo/veo-3.1-lite-generate-001",
  "wan/happyhorse-1.1-t2v",
  "wavespeed/wavespeed-gpt-image-2.5-flare"
];

const Router: React.FC = () => {
  const t = useT();
  return (
    <Stage>
      <Centered>
        <Panel style={{ width: 1100, height: 780 }}>
          <PanelHeader icon="grid" title="Comfy Router models" accent={C.info} />
          <div style={{ height: 720, overflow: "hidden" }}>
            <div style={{ transform: `translateY(${-t * 30}px)` }}>
              {ROUTER.map((id) => (
                <div key={id} style={{ padding: "22px 28px", fontSize: 28, borderBottom: `1px solid ${C.line}` }}>
                  {id}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </Centered>
    </Stage>
  );
};

const ExportClose: React.FC<{ exportWorks: boolean }> = ({ exportWorks }) => {
  const t = useT();
  if (exportWorks && t < 2.5) {
    return (
      <Stage>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Button label={t < 1.2 ? "Export" : "coffee-ad.mp4"} active={t > 1} />
        </AbsoluteFill>
      </Stage>
    );
  }
  return <Title card="end" />;
};

// ─── Schedule ───────────────────────────────────────────────────────────────

type Beat = {
  id: string;
  seconds: number;
  caption?: string;
  /** Speed of the recording that replaces the surface. */
  rate?: number;
  /** Full-frame ad footage or a card, which never takes a draft tag. */
  film?: boolean;
  render: (p: ComfyChallengeProps) => React.ReactNode;
};

const beats = (f: Pick<ComfyChallengeProps, "director" | "timelineFollows">): Beat[] => [
  {
    id: "beat-01",
    seconds: 15,
    film: true,
    render: () => <Hook />
  },
  { id: "beat-02", seconds: 4, film: true, render: () => <Title /> },
  {
    id: "beat-03",
    seconds: 5,
    caption: f.director ? "Start with a brief. The Director breaks it into shots." : "Start from a storyboard.",
    render: (p) => <Brief director={p.director} />
  },
  {
    id: "beat-04",
    seconds: 12,
    caption: "Every shot gets a still and a camera move from an open, versioned preset library.",
    render: () => <Board />
  },
  {
    id: "beat-05",
    seconds: 22,
    caption: "Each shot renders on Comfy Cloud with a pinned open-weights ComfyUI workflow. LTX-2.3 even gives you sound.",
    render: () => <Render />
  },
  {
    id: "beat-06",
    seconds: 10,
    caption: "Every render becomes a take. Nothing gets overwritten. Pick the one you like.",
    render: () => <Takes />
  },
  ...(f.timelineFollows
    ? [{ id: "beat-07", seconds: 18, caption: "Assemble the shots on the timeline, with their audio, and keep cutting.", render: () => <TimelineFollow /> }]
    : []),
  {
    id: "beat-08",
    seconds: 20,
    caption: "No black box. Open the exact ComfyUI graph behind any shot, edit it, run it on Comfy Cloud.",
    render: () => <Graph />
  },
  {
    id: "beat-09",
    seconds: 5,
    caption: "Need a partner model? About 226 Comfy Router models, including H3 Max, are available.",
    render: () => <Router />
  },
  {
    id: "beat-10",
    seconds: 5,
    film: true,
    render: (p) => <ExportClose exportWorks={p.exportWorks} />
  }
];

export const totalFrames = (f: Pick<ComfyChallengeProps, "director" | "timelineFollows"> = DEFAULT_FLAGS): number =>
  beats(f).reduce((n, b) => n + b.seconds * FPS, 0);

const Caption: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 44 }}>
    <div
      style={{
        maxWidth: 1500,
        textAlign: "center",
        fontSize: 34,
        fontWeight: 600,
        lineHeight: 1.3,
        padding: "12px 26px",
        borderRadius: R.md,
        background: "rgba(0,0,0,0.72)",
        color: C.text
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);

const SpeedTag: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      top: 60,
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 18px",
      borderRadius: R.pill,
      fontSize: 26,
      fontWeight: 600,
      color: C.stage,
      background: C.warning
    }}
  >
    {text}
  </div>
);

const DraftTag: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 24,
      left: 24,
      padding: "6px 14px",
      borderRadius: R.pill,
      fontSize: 20,
      fontWeight: 600,
      color: C.stage,
      background: C.warning
    }}
  >
    Reconstructed UI
  </div>
);

export const ComfyChallenge: React.FC<ComfyChallengeProps> = (props) => {
  useInterFont();
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.stage, fontFamily: FONT, color: C.text }}>
      {beats(props).map((b) => {
        const start = from;
        const frames = b.seconds * FPS;
        from += frames;
        const recorded = hasFile(`${b.id}.mp4`);
        return (
          <Sequence key={b.id} from={start} durationInFrames={frames}>
            {recorded ? video(`${b.id}.mp4`, true, b.rate) : b.render(props)}
            {!recorded && !b.film && props.draftTags ? <DraftTag /> : null}
            {recorded && b.id === "beat-05" ? (
              <Sequence from={12 * FPS}>
                <SpeedTag text="Sped up ×3: this render took 26 s" />
              </Sequence>
            ) : null}
            {recorded && b.id === "beat-07" ? <SpeedTag text="Sped up" /> : null}
            {recorded && b.id === "beat-08" ? <SpeedTag text="Sped up ×2" /> : null}
            {b.caption ? <Caption text={b.caption} /> : null}
          </Sequence>
        );
      })}
      {hasFile("voiceover.mp3") ? <Audio src={asset("voiceover.mp3")} /> : null}
    </AbsoluteFill>
  );
};
