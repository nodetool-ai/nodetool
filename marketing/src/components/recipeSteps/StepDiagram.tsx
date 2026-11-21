import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, Check, CircleDashed } from "lucide-react";

/*
 * Building blocks for the recipe step diagrams. Each diagram reads left to
 * right: what goes into the step, where in NodeTool the step happens and what
 * it does, and what comes out. Every picture is a frame or resize of the
 * recipe's accepted run (scripts/build-recipe-step-media.sh), and every quoted
 * value comes from that run's records.
 */

export const STEP_MEDIA = "/recipes/step-media";

export interface Operation {
  /** The surface and stage, as NodeTool labels them. */
  readonly where: string;
  /** What the step does, as a short verb phrase. */
  readonly title: string;
  readonly notes?: readonly ReactNode[];
}

interface StepDiagramProps {
  readonly give: ReactNode;
  readonly does: Operation;
  readonly get: ReactNode;
  readonly giveLabel?: string;
  readonly getLabel?: string;
  /** Heading over the operation, for steps that happen outside NodeTool. */
  readonly doesLabel?: string;
  /** Put the result on its own full-width row, for timelines and grids. */
  readonly wideResult?: boolean;
}

function FlowArrow({ down = false }: { readonly down?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center text-amber-300/70"
    >
      {down ? (
        <ArrowDown className="h-5 w-5" />
      ) : (
        <>
          <ArrowDown className="h-5 w-5 md:hidden" />
          <ArrowRight className="hidden h-5 w-5 md:block" />
        </>
      )}
    </div>
  );
}

function Column({
  label,
  children
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

export function StepDiagram({
  give,
  does,
  get,
  giveLabel = "Goes in",
  getLabel = "Comes out",
  doesLabel = "In NodeTool",
  wideResult = false
}: StepDiagramProps) {
  return (
    <div
      data-step-visual
      className={`grid gap-4 rounded-xl border border-white/10 bg-slate-900/50 p-4 md:items-center md:p-6 ${wideResult ? "md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.85fr)_auto_minmax(0,1.15fr)]"}`}
    >
      <Column label={giveLabel}>{give}</Column>
      <FlowArrow />
      <Column label={doesLabel}>
        <div className="overflow-hidden rounded-lg border border-amber-300/40 bg-slate-950 shadow-[0_0_0_4px_rgba(252,211,77,0.04)]">
          <p className="flex items-center gap-2 border-b border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-medium text-amber-200">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300"
            />
            {does.where}
          </p>
          <div className="px-3 py-3">
            <p className="text-base font-semibold leading-snug text-slate-100">
              {does.title}
            </p>
            {does.notes && does.notes.length > 0 && (
              <ul className="mt-2 space-y-1.5 text-sm leading-snug text-slate-300">
                {does.notes.map((note, index) => (
                  <li key={index} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-500"
                    />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Column>
      {wideResult ? (
        <div className="md:col-span-3">
          <FlowArrow down />
        </div>
      ) : (
        <FlowArrow />
      )}
      <div className={wideResult ? "md:col-span-3" : "min-w-0"}>
        <Column label={getLabel}>{get}</Column>
      </div>
    </div>
  );
}

const STILL_WIDTH = {
  xs: "w-16",
  sm: "w-24",
  md: "w-32",
  lg: "w-44",
  full: "w-full"
} as const;

interface StillProps {
  /** File name under public/recipes/step-media/, such as "campaign/hero.webp". */
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly label?: ReactNode;
  readonly size?: keyof typeof STILL_WIDTH;
  readonly checker?: boolean;
}

export function Still({
  src,
  alt,
  width,
  height,
  label,
  size = "full",
  checker = false
}: StillProps) {
  return (
    <figure className={`min-w-0 shrink-0 ${STILL_WIDTH[size]}`}>
      <Image
        src={src.startsWith("/") ? src : `${STEP_MEDIA}/${src}`}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        className={`h-auto w-full rounded-md border border-white/10 ${checker ? "bg-[conic-gradient(#cbd5e1_25%,#f8fafc_0_50%,#cbd5e1_0_75%,#f8fafc_0)] bg-[length:16px_16px]" : "bg-slate-950"}`}
      />
      {label && (
        <figcaption className="mt-1.5 text-xs leading-snug text-slate-400">
          {label}
        </figcaption>
      )}
    </figure>
  );
}

export function Row({
  children,
  align = "start"
}: {
  readonly children: ReactNode;
  readonly align?: "start" | "end";
}) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${align === "end" ? "items-end" : "items-start"}`}
    >
      {children}
    </div>
  );
}

/** A panel that stands in for a NodeTool document, form, or text result. */
export function Panel({
  title,
  children
}: {
  readonly title?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-slate-950/80 p-3">
      {title && (
        <p className="mb-2 text-xs font-medium text-slate-400">{title}</p>
      )}
      <div className="space-y-2 text-sm leading-snug text-slate-200">
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-sm leading-snug text-slate-200">
        {children}
      </p>
    </div>
  );
}

export function Quote({
  children,
  lang
}: {
  readonly children: ReactNode;
  readonly lang?: string;
}) {
  return (
    <p
      lang={lang}
      className="border-l-2 border-amber-300/50 pl-3 text-sm italic leading-snug text-slate-200"
    >
      {children}
    </p>
  );
}

export function Tags({ items }: { readonly items: readonly ReactNode[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <li
          key={index}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Checklist({
  items,
  pending = false
}: {
  readonly items: readonly ReactNode[];
  readonly pending?: boolean;
}) {
  const Icon = pending ? CircleDashed : Check;
  return (
    <ul className="space-y-1.5 text-sm leading-snug text-slate-200">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <Icon
            className={`mt-0.5 h-4 w-4 shrink-0 ${pending ? "text-slate-400" : "text-emerald-400"}`}
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export interface ShotItem {
  readonly label: ReactNode;
  readonly seconds?: number;
  readonly text?: ReactNode;
  readonly sound?: ReactNode;
}

/** A numbered shot or line list, as Storyboard and Script lay them out. */
export function Shots({ items }: { readonly items: readonly ShotItem[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex gap-3 rounded-lg border border-white/10 bg-slate-950/80 p-2.5"
        >
          <span className="font-jetbrains text-xs tabular-nums text-amber-300">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm font-medium text-slate-100">
              <span>{item.label}</span>
              {item.seconds !== undefined && (
                <span className="font-jetbrains text-xs text-slate-400">
                  {item.seconds}s
                </span>
              )}
            </p>
            {item.text && (
              <p className="mt-1 text-sm leading-snug text-slate-300">
                {item.text}
              </p>
            )}
            {item.sound && (
              <p className="mt-1 text-xs leading-snug text-slate-400">
                Sound: {item.sound}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface TimelineClip {
  readonly start: number;
  readonly end: number;
  readonly label?: string;
  /** Thumbnail under public/recipes/step-media/. */
  readonly src?: string;
  readonly tone?: "picture" | "voice" | "sound" | "muted" | "planned";
}

export interface TimelineTrack {
  readonly label: string;
  readonly clips: readonly TimelineClip[];
}

const CLIP_TONE = {
  picture: "border-sky-300/40 bg-sky-400/20",
  voice: "border-amber-300/50 bg-amber-300/20",
  sound: "border-emerald-300/40 bg-emerald-400/15",
  muted: "border-white/10 bg-white/5 text-slate-400 line-through",
  planned: "border-dashed border-white/25 bg-transparent text-slate-300"
} as const;

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/** Tracks drawn to scale: every clip sits at its recorded start and end. */
export function Timeline({
  duration,
  tracks,
  caption
}: {
  readonly duration: number;
  readonly tracks: readonly TimelineTrack[];
  readonly caption?: ReactNode;
}) {
  return (
    <figure className="min-w-0 rounded-lg border border-white/10 bg-slate-950/80 p-3">
      <div className="space-y-1.5">
        {tracks.map((track) => (
          <div key={track.label} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-slate-400">
              {track.label}
            </span>
            <div className="relative h-12 min-w-0 flex-1 rounded bg-white/[0.03]">
              {track.clips.map((clip) => (
                <div
                  key={`${clip.start}-${clip.label ?? ""}`}
                  className={`absolute inset-y-0 overflow-hidden rounded border text-xs text-slate-100 ${CLIP_TONE[clip.tone ?? "picture"]}`}
                  style={{
                    left: `${(clip.start / duration) * 100}%`,
                    width: `calc(${((clip.end - clip.start) / duration) * 100}% - 2px)`
                  }}
                  title={clip.label}
                >
                  {clip.src && (
                    <Image
                      src={`${STEP_MEDIA}/${clip.src}`}
                      alt=""
                      width={120}
                      height={68}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover opacity-70"
                    />
                  )}
                  {clip.label && (
                    <span className="relative block truncate px-1.5 py-0.5 leading-tight [text-shadow:0_1px_2px_rgb(0_0_0)]">
                      {clip.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between pl-16 font-jetbrains text-xs text-slate-400">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs leading-snug text-slate-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Which reference is attached to which shot. */
export function AssignmentGrid({
  shots,
  entities
}: {
  readonly shots: readonly string[];
  readonly entities: readonly {
    readonly name: string;
    readonly src: string;
    readonly shots: readonly number[];
  }[];
}) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-white/10 bg-slate-950/80 p-3">
      <table className="w-full border-separate border-spacing-y-1 text-xs">
        <thead>
          <tr>
            <th scope="col" className="text-left font-medium text-slate-400">
              <span className="sr-only">Reference</span>
            </th>
            {shots.map((shot) => (
              <th
                key={shot}
                scope="col"
                className="px-1 font-jetbrains font-medium text-slate-400"
              >
                {shot}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => (
            <tr key={entity.name}>
              <th scope="row" className="pr-2 text-left font-normal">
                <span className="flex items-center gap-2 text-slate-200">
                  <Image
                    src={`${STEP_MEDIA}/${entity.src}`}
                    alt=""
                    width={48}
                    height={27}
                    loading="lazy"
                    className="h-6 w-10 shrink-0 rounded object-cover"
                  />
                  {entity.name}
                </span>
              </th>
              {shots.map((shot, index) => (
                <td key={shot} className="px-1 text-center">
                  {entity.shots.includes(index + 1) ? (
                    <Check
                      className="mx-auto h-4 w-4 text-emerald-400"
                      aria-label="attached"
                    />
                  ) : (
                    <span className="text-slate-400" aria-label="not attached">
                      –
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A short caveat that the run record holds, shown beside the result. */
export function Note({ children }: { readonly children: ReactNode }) {
  return <p className="text-xs leading-snug text-slate-400">{children}</p>;
}
