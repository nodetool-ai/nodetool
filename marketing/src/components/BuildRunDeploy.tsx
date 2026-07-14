import React from "react";
import {
  Workflow,
  PlayCircle,
  Mic,
  MessageSquare,
  ImageIcon,
  Check,
  Wand2,
  Crop,
  Paintbrush,
  Scissors,
  SlidersHorizontal,
} from "lucide-react";

type AccentColor = "blue" | "fuchsia" | "amber";

const accents: Record<
  AccentColor,
  { ring: string; text: string; dot: string; glow: string }
> = {
  blue: {
    ring: "ring-blue-500/30",
    text: "text-blue-400",
    dot: "bg-blue-400",
    glow: "shadow-blue-500/10",
  },
  fuchsia: {
    ring: "ring-fuchsia-500/30",
    text: "text-fuchsia-400",
    dot: "bg-fuchsia-400",
    glow: "shadow-fuchsia-500/10",
  },
  amber: {
    ring: "ring-amber-500/30",
    text: "text-amber-400",
    dot: "bg-amber-400",
    glow: "shadow-amber-500/10",
  },
};

export default function BuildRunDeploy() {
  return (
    <div id="how-title" className="relative w-full py-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card
          step="01"
          title="Wire your canvas"
          icon={<Workflow className="h-6 w-6" />}
          accent="blue"
          description="Drag in models, edits, and assets. Connect them. Every model from every provider lives on the same canvas."
        >
          <BuildVisual />
        </Card>

        <Card
          step="02"
          title="Render with your keys"
          icon={<PlayCircle className="h-6 w-6" />}
          accent="fuchsia"
          description="Bring your own keys to FAL, KIE, OpenAI, Anthropic, Gemini, Replicate. Pay providers directly. Watch results stream in."
        >
          <RunVisual />
        </Card>

        <Card
          step="03"
          title="Edit and finish"
          icon={<Wand2 className="h-6 w-6" />}
          accent="amber"
          description="Drop the generated image or clip into the built-in editors. Crop, mask, cut, and arrange on the timeline — no export, no second app."
        >
          <EditVisual />
        </Card>
      </div>
    </div>
  );
}

function Card({
  step,
  title,
  icon,
  accent,
  description,
  children,
}: {
  step: string;
  title: string;
  icon: React.ReactNode;
  accent: AccentColor;
  description: string;
  children: React.ReactNode;
}) {
  const a = accents[accent];
  return (
    <div
      className={`group relative flex flex-col gap-6 rounded-2xl border border-slate-800/70 bg-slate-900/40 p-6 ring-1 ring-white/5 backdrop-blur-sm transition-all hover:border-slate-700 hover:bg-slate-900/60 ${a.glow}`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/80 ring-1 ${a.ring} ${a.text}`}
        >
          {icon}
        </div>
        <div className="pt-1">
          <h3 className="text-lg font-semibold text-white">
            <span className={`mr-2 font-mono text-sm ${a.text}`}>{step}</span>
            {title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-auto rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
        {children}
      </div>
    </div>
  );
}

function MiniNode({
  icon,
  label,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  bg: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 ${bg} text-white shadow-md`}
      >
        {icon}
      </div>
      <span className="text-[10px] font-medium text-slate-300">{label}</span>
    </div>
  );
}

function Connector({ color }: { color: string }) {
  return (
    <div className="relative mx-1 flex h-px flex-1 items-center">
      <div className={`h-px w-full ${color}`} />
      <span className={`absolute -left-0.5 h-1.5 w-1.5 rounded-full ${color.replace("bg-", "bg-")}`} />
      <span className={`absolute -right-0.5 h-1.5 w-1.5 rounded-full ${color.replace("bg-", "bg-")}`} />
    </div>
  );
}

function BuildVisual() {
  return (
    <div className="flex items-center justify-between px-1 py-2">
      <MiniNode
        icon={<Mic className="h-5 w-5" />}
        label="Audio Input"
        bg="bg-blue-600/70"
      />
      <Connector color="bg-blue-500/60" />
      <MiniNode
        icon={<MessageSquare className="h-5 w-5" />}
        label="Whisper"
        bg="bg-amber-700/70"
      />
      <Connector color="bg-fuchsia-500/60" />
      <MiniNode
        icon={<ImageIcon className="h-5 w-5" />}
        label="GPT Image 2"
        bg="bg-fuchsia-700/70"
      />
    </div>
  );
}

function RunVisual() {
  const lines = [
    "Workflow started",
    "LLM response received",
    "Image generated",
    "Data transformed",
    "Workflow completed",
  ];
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <div>
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
          <span>Logs</span>
          <span className="text-emerald-400">2.4s</span>
        </div>
        <ul className="space-y-1.5">
          {lines.map((l) => (
            <li
              key={l}
              className="flex items-center gap-2 text-[11px] text-slate-300"
            >
              <Check className="h-3 w-3 text-emerald-400" />
              {l}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex w-24 flex-col">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">
          Preview
        </div>
        <div className="relative flex-1 overflow-hidden rounded-md border border-slate-800">
          <img
            src="/cat.webp"
            alt="Example image generated by a workflow node"
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/60 px-1.5 py-0.5 text-[8px] text-slate-300">
            <span>1024×1024</span>
            <span>PNG</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditTool({ icon }: { icon: React.ReactNode }) {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/70 bg-slate-900/70 text-slate-200">
      {icon}
    </div>
  );
}

function EditVisual() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-800">
          <img
            src="/cat.webp"
            alt="Generated asset opened in the built-in editor"
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          {/* Crop handles */}
          <span className="pointer-events-none absolute left-0.5 top-0.5 h-2 w-2 border-l border-t border-amber-300/90" />
          <span className="pointer-events-none absolute right-0.5 top-0.5 h-2 w-2 border-r border-t border-amber-300/90" />
          <span className="pointer-events-none absolute bottom-0.5 left-0.5 h-2 w-2 border-b border-l border-amber-300/90" />
          <span className="pointer-events-none absolute bottom-0.5 right-0.5 h-2 w-2 border-b border-r border-amber-300/90" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            Editors
          </span>
          <div className="flex gap-1.5">
            <EditTool icon={<Crop className="h-3.5 w-3.5" />} />
            <EditTool icon={<Paintbrush className="h-3.5 w-3.5" />} />
            <EditTool icon={<Scissors className="h-3.5 w-3.5" />} />
            <EditTool icon={<SlidersHorizontal className="h-3.5 w-3.5" />} />
          </div>
        </div>
      </div>

      {/* Timeline — assemble the generated clips */}
      <div className="relative rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5">
        <div className="flex items-center gap-1">
          <div className="h-5 flex-[2] rounded-sm bg-sky-500/40" />
          <div className="h-5 flex-[3] rounded-sm bg-fuchsia-500/40" />
          <div className="h-5 flex-[1.5] rounded-sm bg-amber-500/40" />
        </div>
        <span className="pointer-events-none absolute inset-y-1 left-[42%] w-px bg-white/70" />
      </div>
    </div>
  );
}
