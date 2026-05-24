import React from "react";
import {
  Workflow,
  PlayCircle,
  Mic,
  MessageSquare,
  ImageIcon,
  Check,
  Send,
  Images,
  Film,
  AppWindow,
  Globe,
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
          title="Publish anywhere"
          icon={<Send className="h-6 w-6" />}
          accent="amber"
          description="Send the output straight to a gallery, a video reel, a standalone app, or a live website. One canvas, every surface your audience sees."
        >
          <DeployVisual />
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
      className={`group relative flex flex-col gap-6 rounded-2xl border border-neutral-800/70 bg-neutral-900/40 p-6 ring-1 ring-white/5 backdrop-blur-sm transition-all hover:border-neutral-700 hover:bg-neutral-900/60 ${a.glow}`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-neutral-700/70 bg-neutral-900/80 ring-1 ${a.ring} ${a.text}`}
        >
          {icon}
        </div>
        <div className="pt-1">
          <h3 className="text-lg font-semibold text-white">
            <span className={`mr-2 font-mono text-sm ${a.text}`}>{step}</span>
            {title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-auto rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-3">
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
      <span className="text-[10px] font-medium text-neutral-300">{label}</span>
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
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500">
          <span>Logs</span>
          <span className="text-emerald-400">2.4s</span>
        </div>
        <ul className="space-y-1.5">
          {lines.map((l) => (
            <li
              key={l}
              className="flex items-center gap-2 text-[11px] text-neutral-300"
            >
              <Check className="h-3 w-3 text-emerald-400" />
              {l}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex w-24 flex-col">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">
          Preview
        </div>
        <div className="relative flex-1 overflow-hidden rounded-md border border-neutral-800">
          <img
            src="/cat.png"
            alt="Generated output"
            className="h-full w-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/60 px-1.5 py-0.5 text-[8px] text-neutral-300">
            <span>1024×1024</span>
            <span>PNG</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeployTarget({
  label,
  icon,
}: {
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700/70 bg-neutral-900/70 text-neutral-200">
        {icon}
      </div>
      <span className="text-[10px] font-medium text-neutral-400">{label}</span>
    </div>
  );
}

function DeployVisual() {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium">
        <Check className="h-3 w-3 text-emerald-400" />
        <span className="text-emerald-300">Published</span>
      </div>
      <div className="flex items-end justify-between gap-2 px-1">
        <DeployTarget
          label="Gallery"
          icon={<Images className="h-5 w-5 text-fuchsia-300" />}
        />
        <DeployTarget
          label="Video"
          icon={<Film className="h-5 w-5 text-sky-400" />}
        />
        <DeployTarget
          label="App"
          icon={<AppWindow className="h-5 w-5 text-violet-400" />}
        />
        <DeployTarget
          label="Website"
          icon={<Globe className="h-5 w-5 text-emerald-300" />}
        />
      </div>
    </div>
  );
}
