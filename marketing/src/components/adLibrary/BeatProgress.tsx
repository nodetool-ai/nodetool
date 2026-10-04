"use client";
import { formatKey } from "@/data/adLibrary";

interface ProgressBeat {
  readonly id: string;
  readonly role: string;
  readonly start_ms: number;
  readonly end_ms: number;
}

interface BeatProgressProps {
  readonly beats: readonly ProgressBeat[];
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
