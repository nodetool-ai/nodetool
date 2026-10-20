import React from "react";
import type { AlternativeMedia as Media } from "../data/alternativesVisuals";

/**
 * One still or short loop in an `/alternatives` stage card. A loop shows its
 * poster instead of playing for a reader who asked for reduced motion.
 */
export default function AlternativeMedia({ media }: { media: Media }): React.ReactElement {
  if (media.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={media.src}
        alt={media.alt}
        width={media.width}
        height={media.height}
        loading="lazy"
        decoding="async"
        className="aspect-video h-auto w-full object-cover object-left-top"
      />
    );
  }
  const poster = `${media.base}-poster.webp`;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt={media.alt}
        width={1920}
        height={1080}
        loading="lazy"
        decoding="async"
        className="hidden aspect-video h-auto w-full motion-reduce:block"
      />
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster={poster}
        aria-label={media.alt}
        className="block aspect-video h-auto w-full motion-reduce:hidden"
      >
        <source src={`${media.base}.webm`} type='video/webm; codecs="vp9"' />
        <source src={`${media.base}.mp4`} type="video/mp4" />
      </video>
    </>
  );
}
