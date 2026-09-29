import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from "remotion";
import { useInterFont } from "../promo/fonts";
import { Flash, Grain, Shake, Wipe } from "./fx";
import { Hud } from "./Hud";
import {
  BackdropsScene,
  CaptureScene,
  DropScene,
  EndCard,
  FinishScene,
  LevelScene,
  LightsScene,
  MusicScene,
  ParallaxScene,
  PropsScene,
  SfxScene,
  SpritesScene,
} from "./scenes";
import { MUSIC_AT, SFX, SFX_AT } from "./timeline";
import { BAR, COLOR, FPS, MUSIC_OFFSET_S, SECTION, bars } from "./theme";

/** Registers the Kindle HUD face (Bebas Neue) as "VibeBebas". */
function useBebas(): void {
  const [handle] = useState(() => delayRender("vibe: load Bebas"));
  useEffect(() => {
    const face = new FontFace("VibeBebas", `url(${staticFile("vibe/bebas.ttf")})`);
    face
      .load()
      .then((f) => document.fonts.add(f))
      .catch(() => undefined)
      .then(() => continueRender(handle));
  }, [handle]);
}

const SCENES: Array<{ from: number; to: number; C: () => React.JSX.Element; shake: number }> = [
  { from: SECTION.lights, to: SECTION.drop, C: LightsScene, shake: 0 },
  { from: SECTION.drop, to: SECTION.sprites, C: DropScene, shake: 16 },
  { from: SECTION.sprites, to: SECTION.props, C: SpritesScene, shake: 6 },
  { from: SECTION.props, to: SECTION.backgrounds, C: PropsScene, shake: 10 },
  { from: SECTION.backgrounds, to: SECTION.parallax, C: BackdropsScene, shake: 5 },
  { from: SECTION.parallax, to: SECTION.music, C: ParallaxScene, shake: 9 },
  { from: SECTION.music, to: SECTION.sfx, C: MusicScene, shake: 1.5 },
  { from: SECTION.sfx, to: SECTION.build, C: SfxScene, shake: 8 },
  { from: SECTION.build, to: SECTION.run + 3, C: LevelScene, shake: 7 },
  { from: SECTION.run + 3, to: SECTION.finish, C: CaptureScene, shake: 12 },
  { from: SECTION.finish, to: SECTION.endCard, C: FinishScene, shake: 6 },
  { from: SECTION.endCard, to: SECTION.end, C: EndCard, shake: 0 },
];

const FLASHES = [SECTION.drop, SECTION.sprites, SECTION.backgrounds, SECTION.sfx, SECTION.build, SECTION.run, SECTION.run + 3, SECTION.finish, SECTION.endCard];
const WIPES: Array<[number, string, boolean]> = [
  [SECTION.props, COLOR.ember, false],
  [SECTION.parallax, COLOR.teal, true],
  [SECTION.music, COLOR.violet, false],
  [SECTION.build, COLOR.ember, true],
];

function MusicBed(): React.JSX.Element {
  const frame = useCurrentFrame();
  const len = bars(SECTION.sfx) - MUSIC_AT;
  return (
    <Audio
      src={staticFile("vibe/kindle-music.mp3")}
      trimBefore={MUSIC_OFFSET_S * FPS}
      volume={() => interpolate(frame, [0, 6, len - 40, len], [0, 0.95, 0.95, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
    />
  );
}

export function VibeRace(): React.JSX.Element {
  useInterFont();
  useBebas();
  return (
    <AbsoluteFill style={{ background: COLOR.ink }}>
      {SCENES.map(({ from, to, C, shake }) => (
        <Sequence key={from} from={bars(from)} durationInFrames={bars(to) - bars(from)}>
          <Shake amount={shake}>
            <C />
          </Shake>
        </Sequence>
      ))}

      {WIPES.map(([bar, color, reverse]) => (
        <Wipe key={bar} at={bars(bar) - 7} len={14} color={color} reverse={reverse} />
      ))}
      {FLASHES.map((bar) => (
        <Flash key={bar} at={bars(bar)} len={bar === SECTION.drop || bar === SECTION.finish ? 14 : 6} max={bar === SECTION.drop || bar === SECTION.finish ? 0.9 : 0.55} />
      ))}

      <Hud />
      <Grain />

      <Audio src={staticFile("vibe/track.wav")} />
      <Sequence from={MUSIC_AT} durationInFrames={bars(SECTION.sfx) - MUSIC_AT}>
        <MusicBed />
      </Sequence>
      {SFX.map((name, i) => (
        <Sequence key={name} from={SFX_AT[i]} durationInFrames={BAR}>
          <Audio src={staticFile(`vibe/${name}.wav`)} volume={0.9} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
