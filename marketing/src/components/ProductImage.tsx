import React from "react";

interface ProductImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption: string;
  priority?: boolean;
  contain?: boolean;
}

export default function ProductImage({
  src,
  alt,
  width,
  height,
  caption,
  priority = false,
  contain = false,
}: ProductImageProps) {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/80 shadow-2xl shadow-black/40 ring-1 ring-white/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          className={`no-desaturate block w-full ${
            contain ? "h-auto object-contain" : "h-auto"
          }`}
        />
      </div>
      <figcaption className="px-2 pb-1 pt-3 text-sm leading-relaxed text-slate-400">
        {caption}
      </figcaption>
    </figure>
  );
}
