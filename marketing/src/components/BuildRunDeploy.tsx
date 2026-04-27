import React from "react";
import {
  Workflow,
  PlayCircle,
  Globe,
  Mic,
  MessageSquare,
  ImageIcon,
  Check,
  Server,
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
          title="Build Visually"
          icon={<Workflow className="h-6 w-6" />}
          accent="blue"
          description="Drag, connect, and configure nodes to create powerful AI workflows. Every connection is type-safe."
        >
          <BuildVisual />
        </Card>

        <Card
          step="02"
          title="Run Everything"
          icon={<PlayCircle className="h-6 w-6" />}
          accent="fuchsia"
          description="Run LLM calls, image generation, data transforms, and more — locally. See results in real time."
        >
          <RunVisual />
        </Card>

        <Card
          step="03"
          title="Deploy Anywhere"
          icon={<Globe className="h-6 w-6" />}
          accent="amber"
          description="Export workflows to Docker, RunPod, Google Cloud Run, or your own servers."
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
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
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
        <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
          Preview
        </div>
        <div className="relative flex-1 overflow-hidden rounded-md border border-slate-800">
          <img
            src="/cat.png"
            alt="Generated output"
            className="h-full w-full object-cover"
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

function DeployTarget({
  label,
  icon,
}: {
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700/70 bg-slate-900/70 text-slate-200">
        {icon}
      </div>
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
    </div>
  );
}

function DeployVisual() {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-emerald-300">Workflow online</span>
      </div>
      <div className="flex items-end justify-between gap-2 px-1">
        <DeployTarget
          label="Docker"
          icon={<DockerIcon className="h-5 w-5 text-sky-400" />}
        />
        <DeployTarget
          label="RunPod"
          icon={<Server className="h-5 w-5 text-violet-400" />}
        />
        <DeployTarget
          label="Google Cloud"
          icon={<CloudIcon className="h-5 w-5 text-amber-300" />}
        />
        <DeployTarget
          label="Self-Hosted"
          icon={<Server className="h-5 w-5 text-emerald-300" />}
        />
      </div>
    </div>
  );
}

function DockerIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13.98 11.13H16.3v2.32h-2.32v-2.32zm-2.85 0h2.32v2.32H11.13v-2.32zm-2.85 0H10.6v2.32H8.28v-2.32zm-2.85 0h2.32v2.32H5.43v-2.32zm5.7-2.85h2.32v2.32H11.13V8.28zm-2.85 0H10.6v2.32H8.28V8.28zm5.7-2.85H16.3v2.32h-2.32V5.43zm-2.85 0h2.32v2.32H11.13V5.43zM2 14.5c0 3.04 2.46 5.5 5.5 5.5h9c3.04 0 5.5-2.46 5.5-5.5v-.5h-1.5c-.43 0-.85-.05-1.26-.13-.32 1.66-1.5 3.04-3.07 3.6l-.32.11.11-.32a4.18 4.18 0 0 0 .04-2.43 5.06 5.06 0 0 1-.95-.42c-.18 1-.85 1.85-1.78 2.18l-.32.11.11-.32c.27-.78.13-1.65-.36-2.31a4.85 4.85 0 0 1-.95.45c.5 1.07.16 2.36-.83 3.05l-.27.18-.06-.32a3.34 3.34 0 0 1 .56-2.42c-.32-.13-.62-.3-.9-.5L2 14.5z" />
    </svg>
  );
}

function CloudIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 18a5 5 0 0 1-.5-9.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1 .5 8.97L18 18H7Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}
