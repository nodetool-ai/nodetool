import { useEffect, useRef, useState } from "react";
import type { AnyGameDocument, GameParticles } from "@nodetool-ai/protocol";
import { createGameParticlePreview, FixedTickClock, PARTICLE_PREVIEW_HEIGHT, PARTICLE_PREVIEW_TICK_RATE, PARTICLE_PREVIEW_WIDTH } from "@nodetool-ai/game-renderer";

import { resolveMediaUri } from "../../../../utils/resolveMediaUri";
import { BORDER_RADIUS, Box, Caption, EditorButton, FlexColumn, FlexRow, SPACING } from "../../../ui_primitives";
import ReportBugButton from "../../../support/ReportBugButton";

interface ParticlePreviewProps {
  readonly particles: GameParticles;
  readonly dimension: "2d" | "3d";
  readonly assets?: AnyGameDocument["assets"];
}

export default function ParticlePreview({ particles, dimension, assets }: ParticlePreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState({ tick: 0, count: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) { return; }
    const canvas = document.createElement("canvas");
    canvas.width = PARTICLE_PREVIEW_WIDTH;
    canvas.height = PARTICLE_PREVIEW_HEIGHT;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${dimension.toUpperCase()} live particle preview`);
    container.replaceChildren(canvas);
    const controller = new AbortController();
    const images = new Set<ImageBitmap>();
    const preview = createGameParticlePreview(particles, dimension);
    const clock = new FixedTickClock(PARTICLE_PREVIEW_TICK_RATE);
    let disposed = false;
    let request = 0;
    let visible = true;
    let renderer: { dispose(): void } | null = null;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer?.observe(container);
    setError(null);
    setStatus({ tick: 0, count: 0 });

    const report = (failure: unknown): void => {
      if (!disposed) { setError(failure instanceof Error ? failure.message : String(failure)); }
    };
    const initialize = async (): Promise<void> => {
      let render: () => Promise<unknown>;
      if (preview.dimension === "2d") {
        const { createGameRenderer } = await import("@nodetool-ai/game-renderer/browser");
        const created = await createGameRenderer({ canvas, backend: "canvas2d", assets: async (slot) => {
          try {
            const binding = assets && Object.hasOwn(assets, slot) ? assets[slot] : undefined;
            if (!binding || binding.mediaKind !== "image") { throw new Error(`Particle image ${slot} is unavailable`); }
            const url = await resolveMediaUri(binding.assetId.startsWith("package://") ? binding.assetId : `asset://${binding.assetId}`);
            if (!url) { throw new Error(`Particle image ${slot} is unavailable`); }
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) { throw new Error(`Particle image ${slot} returned ${response.status}`); }
            const image = await createImageBitmap(await response.blob());
            if (disposed) { image.close(); return null; }
            images.add(image);
            return image;
          } catch (failure) { report(failure); throw failure; }
        } });
        if (disposed) { created.dispose(); return; }
        renderer = created;
        render = () => created.render(preview.frame, 1, preview.particles);
      } else {
        const { createGameRenderer3D } = await import("@nodetool-ai/game-renderer/browser3d");
        const created = await createGameRenderer3D({ canvas, signal: controller.signal, onDiagnostic: (message) => report(new Error(message)) });
        if (disposed) { created.dispose(); return; }
        renderer = created;
        render = () => created.render(preview.frame, 1, preview.particles);
      }
      let drawnTick = -1;
      const animate = async (now: number): Promise<void> => {
        if (disposed) { return; }
        if (visible && !document.hidden) {
          if (playingRef.current) { clock.advance(now, () => preview.step()); }
          else { clock.reset(); }
          if (drawnTick !== preview.frame.tick) {
            await render();
            drawnTick = preview.frame.tick;
            if (!disposed && preview.frame.tick % 6 === 0) {
              setStatus({ tick: preview.frame.tick, count: preview.particles.count });
            }
          }
        } else { clock.reset(); }
        if (!disposed) { request = requestAnimationFrame((time) => { void animate(time).catch(report); }); }
      };
      await animate(performance.now());
    };
    void initialize().catch(report);
    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(request);
      observer?.disconnect();
      renderer?.dispose();
      for (const image of images) { image.close(); }
      canvas.remove();
    };
  }, [particles, dimension, assets, generation]);

  return <FlexColumn gap={SPACING.xs}>
    <Box ref={host} sx={{ width: "100%", aspectRatio: "16 / 9", backgroundColor: "background.default", borderRadius: BORDER_RADIUS.sm, overflow: "hidden" }} />
    <FlexRow gap={SPACING.sm} align="center">
      <EditorButton onClick={() => setPlaying((value) => !value)}>{playing ? "Pause preview" : "Play preview"}</EditorButton>
      <EditorButton onClick={() => setGeneration((value) => value + 1)}>Restart preview</EditorButton>
    </FlexRow>
    <Caption>{dimension === "2d" ? "Canvas2D" : "WebGL2"} · {status.count} particles · tick {status.tick}</Caption>
    <Caption>Isolated preview. Restart uses the same seed. Editing restarts the effect.</Caption>
    {dimension === "3d" && <Caption>3D uses round billboards or meshes. Sprite textures and sheets are 2D only.</Caption>}
    {error && <>
      <Caption color="error" role="alert">{error}</Caption>
      <ReportBugButton context={{ source: "panel-crash", summary: "Particle preview failed", errorText: error }} />
    </>}
  </FlexColumn>;
}
