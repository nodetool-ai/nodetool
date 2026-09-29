"use client";
import Image from "next/image";
import { formatKey, illustrationSrc } from "@/data/adLibrary";

interface FrameBeat {
  readonly id: string;
  readonly role: string;
  readonly start_ms: number;
  readonly end_ms: number;
}

interface BeatFrameProps {
  readonly title: string;
  readonly beats: readonly FrameBeat[];
  readonly activeIndex: number;
  /** Mount every beat image. When false, only the active beat loads. */
  readonly loadAll: boolean;
  readonly sizes: string;
  readonly priority?: boolean;
  readonly className?: string;
}

/** A 9:16 frame that cross-fades between beat illustrations. */
export function BeatFrame({
  title,
  beats,
  activeIndex,
  loadAll,
  sizes,
  priority = false,
  className = ""
}: BeatFrameProps) {
  return (
    <div
      className={`relative aspect-[9/16] overflow-hidden bg-slate-900 ${className}`}
    >
      {beats.map((beat, index) => {
        const active = index === activeIndex;
        if (!loadAll && !active) {
          return null;
        }
        return (
          <Image
            key={beat.id}
            src={illustrationSrc(beat.id)}
            alt={
              active
                ? `${title}, beat ${index + 1}: ${formatKey(beat.role)}`
                : ""
            }
            aria-hidden={active ? undefined : true}
            width={600}
            height={1067}
            sizes={sizes}
            priority={priority && active}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none ${
              active ? "opacity-100" : "opacity-0"
            }`}
          />
        );
      })}
    </div>
  );
}

interface BeatProgressProps {
  readonly beats: readonly FrameBeat[];
  readonly elapsedMs: number;
  /** When set, each segment becomes a button that selects its beat. */
  readonly onSelect?: (index: number) => void;
  readonly className?: string;
}

/** Segments sized by beat length. The active segment fills in real time. */
export function BeatProgress({
  beats,
  elapsedMs,
  onSelect,
  className = ""
}: BeatProgressProps) {
  return (
    <div className={`flex gap-1 ${className}`}>
      {beats.map((beat, index) => {
        const length = beat.end_ms - beat.start_ms;
        const fill = Math.min(
          1,
          Math.max(0, (elapsedMs - beat.start_ms) / length)
        );
        const bar = (
          <span className="relative block h-1 w-full overflow-hidden rounded-full bg-white/25">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-white"
              style={{ width: `${fill * 100}%` }}
            />
          </span>
        );
        if (!onSelect) {
          return (
            <span
              key={beat.id}
              className="block"
              style={{ flexGrow: length, flexBasis: 0 }}
            >
              {bar}
            </span>
          );
        }
        return (
          <button
            key={beat.id}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Show beat ${index + 1}: ${formatKey(beat.role)}`}
            className="focus-ring group block rounded py-2"
            style={{ flexGrow: length, flexBasis: 0 }}
          >
            {bar}
          </button>
        );
      })}
    </div>
  );
}
