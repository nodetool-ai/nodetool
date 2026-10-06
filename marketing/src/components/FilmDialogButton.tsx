"use client";

import { useRef } from "react";
import { Play, X } from "lucide-react";

type FilmDialogButtonProps = {
  title: string;
  src: string;
  poster: string;
  width: number;
  height: number;
};

/**
 * A button that opens the finished film in a modal. The film loads only when
 * the dialog opens (`preload="none"` until then) and stops when it closes.
 */
export default function FilmDialogButton({
  title,
  src,
  poster,
  width,
  height
}: FilmDialogButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const vertical = height > width;

  const open = () => {
    dialogRef.current?.showModal();
    void videoRef.current?.play().catch(() => {});
  };

  const stop = () => {
    videoRef.current?.pause();
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-300/40 px-4 py-2 text-sm font-medium text-amber-200 transition-colors hover:border-amber-300 hover:bg-amber-300/10"
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        Watch the film
        <span className="sr-only">: {title}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-label={`${title}, finished film`}
        onClose={stop}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            dialogRef.current?.close();
          }
        }}
        className="m-auto w-[min(92vw,72rem)] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-slate-950/85"
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close the film"
            className="focus-ring absolute -top-12 right-0 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            controls
            playsInline
            preload="none"
            className={`mx-auto block rounded-xl bg-black ${
              vertical ? "max-h-[85vh] w-auto" : "h-auto w-full"
            }`}
          />
        </div>
      </dialog>
    </>
  );
}
