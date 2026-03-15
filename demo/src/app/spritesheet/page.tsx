"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// ── Types ──────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface GenerateResult {
  image: string;
  cols: number;
  rows: number;
  frames: number;
}

const STYLES = [
  { id: "pixel art", label: "Pixel Art", icon: "🎮" },
  { id: "hand-drawn cartoon", label: "Cartoon", icon: "✏️" },
  { id: "flat vector", label: "Flat Vector", icon: "🔷" },
  { id: "anime", label: "Anime", icon: "⚔️" },
];

const ANIMATIONS = [
  { id: "walk cycle", label: "Walk", icon: "🚶" },
  { id: "idle breathing", label: "Idle", icon: "😌" },
  { id: "attack swing", label: "Attack", icon: "⚡" },
  { id: "jump", label: "Jump", icon: "🦘" },
  { id: "run cycle", label: "Run", icon: "🏃" },
  { id: "death", label: "Death", icon: "💀" },
];

const FRAME_OPTIONS = [4, 6, 8];

const SAMPLES = [
  "A brave knight in silver armor with a red cape",
  "A small green slime monster with big eyes",
  "A cute wizard cat with a purple hat and staff",
  "A robot with glowing blue eyes and jet boots",
];

// ── Step indicator ─────────────────────────────────────────────────────────

const STEPS = [
  { num: 1 as Step, label: "Describe" },
  { num: 2 as Step, label: "Configure" },
  { num: 3 as Step, label: "Generate" },
  { num: 4 as Step, label: "Preview" },
];

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((s, i) => {
        const isActive = s.num === current;
        const isDone = s.num < current;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  isActive
                    ? "bg-indigo-500 text-white shadow-[0_0_20px_-3px_rgba(99,102,241,0.5)]"
                    : isDone
                    ? "bg-green-500/20 text-green-400 border border-green-500/50"
                    : "bg-muted text-slate-500 border border-border"
                }`}
              >
                {isDone ? "✓" : s.num}
              </div>
              <span
                className={`text-[0.65rem] font-semibold uppercase tracking-wider ${
                  isActive ? "text-indigo-300" : isDone ? "text-green-400" : "text-slate-600"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-12 h-px mx-2 mb-5 transition-colors duration-300 ${
                  isDone ? "bg-green-500/50" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Sprite preview with animation ──────────────────────────────────────────

function SpritePreview({
  image,
  cols,
  rows,
  frames,
}: GenerateResult) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(8);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
    };
    img.src = image;
  }, [image]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setCurrentFrame((f) => (f + 1) % frames);
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [playing, fps, frames]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fw = img.width / cols;
    const fh = img.height / rows;
    const col = currentFrame % cols;
    const row = Math.floor(currentFrame / cols);

    canvas.width = fw;
    canvas.height = fh;
    ctx.clearRect(0, 0, fw, fh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, col * fw, row * fh, fw, fh, 0, 0, fw, fh);
  }, [currentFrame, cols, rows]);

  useEffect(() => {
    drawFrame();
  }, [drawFrame]);

  return (
    <div className="flex flex-col gap-4">
      {/* Animation preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border border-border bg-black/40 p-6 flex items-center justify-center min-h-[200px]">
          <canvas
            ref={canvasRef}
            className="max-w-[200px] max-h-[200px] w-auto h-auto"
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPlaying(!playing)}
            className="w-20"
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">FPS</span>
            {[4, 8, 12, 16].map((f) => (
              <button
                key={f}
                onClick={() => setFps(f)}
                className={`w-8 h-7 rounded text-xs font-mono transition-all ${
                  fps === f
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/50"
                    : "bg-muted text-slate-500 border border-border hover:text-slate-300"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-600 font-mono">
            {currentFrame + 1}/{frames}
          </span>
        </div>
      </div>

      {/* Full spritesheet */}
      <div className="rounded-lg border border-dashed border-border bg-black/20 p-3">
        <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-slate-600 mb-2">
          Full spritesheet
        </span>
        <img
          src={image}
          alt="Spritesheet"
          className="w-full rounded"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function SpritesheetPage() {
  const [step, setStep] = useState<Step>(1);
  const [description, setDescription] = useState(SAMPLES[0]);
  const [style, setStyle] = useState(STYLES[0].id);
  const [animation, setAnimation] = useState(ANIMATIONS[0].id);
  const [frames, setFrames] = useState(4);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setStep(3);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/generate-sprites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, animation, style, frames }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error ?? "Generation failed");
      }
      const data = (await res.json()) as GenerateResult;
      setResult(data);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setResult(null);
    setError(null);
  };

  return (
    <main className="mx-auto max-w-[640px] px-6 pb-16 pt-8 min-h-screen flex flex-col">
      {/* Header */}
      <header className="relative overflow-hidden text-center pt-10 pb-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.12),transparent_70%)]" />
        <div className="relative">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <span className="text-3xl">🎨</span>
            <h1 className="text-2xl font-bold tracking-tight">
              Sprite Generator
            </h1>
          </div>
          <p className="text-slate-500 text-sm">
            AI-powered spritesheet creation using{" "}
            <code className="rounded border border-border bg-muted px-1 py-0.5 text-xs text-indigo-300">
              gpt-image-1
            </code>
          </p>
        </div>
      </header>

      {/* Step indicator */}
      <div className="mb-6">
        <StepIndicator current={step} />
      </div>

      {/* Step content */}
      <div className="flex-1">
        {/* ── Step 1: Describe ────────────────────────────── */}
        {step === 1 && (
          <Card className="overflow-hidden transition-all duration-300 border-border/60">
            <CardHeader className="relative pb-4">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
              <CardTitle className="text-base font-semibold">
                Describe your character
              </CardTitle>
              <CardDescription className="text-sm">
                What should the sprite look like? Be specific about appearance,
                colors, and accessories.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              {/* Sample descriptions */}
              <div className="flex flex-wrap gap-2">
                {SAMPLES.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className={`cursor-pointer transition-all hover:bg-indigo-500/5 hover:border-indigo-500 hover:text-slate-200 ${
                      description === s
                        ? "bg-indigo-500/10 border-indigo-400 text-indigo-200 shadow-[0_0_8px_-2px_rgba(99,102,241,0.3)]"
                        : "text-slate-400"
                    }`}
                    onClick={() => setDescription(s)}
                  >
                    {s.length > 30 ? s.slice(0, 30) + "…" : s}
                  </Badge>
                ))}
              </div>

              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="A brave knight in silver armor…"
                className="resize-y focus:border-indigo-500/50 focus:shadow-[0_0_12px_-4px_rgba(99,102,241,0.2)]"
              />

              <Button
                className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-semibold shadow-[0_0_20px_-4px_rgba(99,102,241,0.4)] hover:opacity-90 hover:-translate-y-px hover:shadow-[0_0_25px_-4px_rgba(99,102,241,0.5)] transition-all"
                onClick={() => setStep(2)}
                disabled={!description.trim()}
                size="lg"
              >
                Next: Configure →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Configure ───────────────────────────── */}
        {step === 2 && (
          <Card className="overflow-hidden transition-all duration-300 border-border/60">
            <CardHeader className="relative pb-4">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
              <CardTitle className="text-base font-semibold">
                Configure your spritesheet
              </CardTitle>
              <CardDescription className="text-sm">
                Choose the art style, animation type, and number of frames.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
              {/* Art style */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Art style
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                        style === s.id
                          ? "bg-indigo-500/10 border-indigo-400 text-indigo-200 shadow-[0_0_12px_-3px_rgba(99,102,241,0.3)]"
                          : "border-border bg-card text-slate-400 hover:border-slate-600 hover:text-slate-300"
                      }`}
                    >
                      <span className="text-lg">{s.icon}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Animation type */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Animation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {ANIMATIONS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAnimation(a.id)}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
                        animation === a.id
                          ? "bg-indigo-500/10 border-indigo-400 text-indigo-200 shadow-[0_0_12px_-3px_rgba(99,102,241,0.3)]"
                          : "border-border bg-card text-slate-400 hover:border-slate-600 hover:text-slate-300"
                      }`}
                    >
                      <span className="text-lg">{a.icon}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame count */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Frames
                </label>
                <div className="flex gap-2">
                  {FRAME_OPTIONS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFrames(f)}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-bold transition-all ${
                        frames === f
                          ? "bg-indigo-500/10 border-indigo-400 text-indigo-200 shadow-[0_0_12px_-3px_rgba(99,102,241,0.3)]"
                          : "border-border bg-card text-slate-400 hover:border-slate-600 hover:text-slate-300"
                      }`}
                    >
                      {f} frames
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-border bg-black/20 px-4 py-3">
                <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Preview config
                </span>
                <p className="text-sm text-slate-400">
                  <span className="text-slate-200">{description}</span>
                  {" · "}
                  {STYLES.find((s) => s.id === style)?.label}
                  {" · "}
                  {ANIMATIONS.find((a) => a.id === animation)?.label}
                  {" · "}
                  {frames} frames
                </p>
              </div>

              {error !== null && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                  size="lg"
                >
                  ← Back
                </Button>
                <Button
                  className="flex-[2] bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-semibold shadow-[0_0_20px_-4px_rgba(99,102,241,0.4)] hover:opacity-90 hover:-translate-y-px hover:shadow-[0_0_25px_-4px_rgba(99,102,241,0.5)] transition-all"
                  onClick={handleGenerate}
                  size="lg"
                >
                  Generate Spritesheet →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Generating ──────────────────────────── */}
        {step === 3 && loading && (
          <Card className="overflow-hidden border-indigo-500/30 shadow-[0_0_40px_-8px_rgba(99,102,241,0.2)]">
            <CardContent className="py-16 flex flex-col items-center gap-6">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
                <div className="absolute inset-3 rounded-full border-2 border-transparent border-t-violet-500 animate-spin [animation-direction:reverse] [animation-duration:1.5s]" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-slate-200 mb-1">
                  Generating spritesheet...
                </p>
                <p className="text-sm text-slate-500">
                  Creating {frames} frames of {animation} animation
                </p>
                <p className="text-xs text-slate-600 mt-2">
                  This may take 15–30 seconds
                </p>
              </div>

              {/* Config reminder */}
              <div className="w-full rounded-lg border border-dashed border-border bg-black/20 backdrop-blur-sm px-4 py-3 text-xs text-slate-500">
                <span className="text-slate-400">{description}</span>
                {" · "}
                {STYLES.find((s) => s.id === style)?.label}
                {" · "}
                {ANIMATIONS.find((a) => a.id === animation)?.label}
                {" · "}
                {frames} frames
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Preview ─────────────────────────────── */}
        {step === 4 && result && (
          <div className="flex flex-col gap-5">
            <Card className="overflow-hidden border-green-500/20 shadow-[0_0_30px_-8px_rgba(34,197,94,0.1)]">
              <CardHeader className="relative pb-3">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Spritesheet Ready
                </CardTitle>
                <CardDescription className="text-sm">
                  {STYLES.find((s) => s.id === style)?.label}
                  {" · "}
                  {ANIMATIONS.find((a) => a.id === animation)?.label}
                  {" · "}
                  {frames} frames
                </CardDescription>
              </CardHeader>

              <CardContent>
                <SpritePreview
                  image={result.image}
                  cols={result.cols}
                  rows={result.rows}
                  frames={result.frames}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleReset}
                size="lg"
              >
                ← New sprite
              </Button>
              <Button
                className="flex-1 bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-semibold shadow-[0_0_20px_-4px_rgba(99,102,241,0.4)] hover:opacity-90 transition-all"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = result.image;
                  a.download = "spritesheet.png";
                  a.click();
                }}
                size="lg"
              >
                Download PNG
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center mt-12 pt-6 border-t border-border/30 text-xs text-slate-600">
        <p>
          Powered by{" "}
          <a
            href="https://github.com/nodetool-ai/nodetool"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-500 underline underline-offset-2"
          >
            NodeTool
          </a>
          {" · "}
          <code className="text-slate-500">gpt-image-1</code>
        </p>
      </footer>
    </main>
  );
}
