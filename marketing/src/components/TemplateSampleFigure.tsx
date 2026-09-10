import Image from "next/image";
import type { TemplateSample } from "@/data/templateSamples";

export default function TemplateSampleFigure({ sample }: { sample: TemplateSample }) {
  const imageWidth = sample.imageWidth ?? 1280;
  const imageHeight = sample.imageHeight ?? 1020;

  return (
    <figure>
      {sample.inputText && (
        <div className="mb-6 max-w-3xl">
          <p className="mb-2 text-sm font-medium text-slate-300">Input</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-400">{sample.inputText}</p>
        </div>
      )}
      {sample.image && (
        <div
          className={sample.inputImage ? "grid gap-4 md:grid-cols-2" : "mx-auto max-w-full"}
          style={sample.inputImage ? undefined : { width: Math.min(imageWidth, (imageWidth / imageHeight) * 640) }}
        >
          {[
            { src: sample.inputImage, label: "Input photo" },
            { src: sample.image, label: "Result" },
          ].map(({ src, label }) => src && (
            <div key={label}>
              <p className="mb-3 text-sm font-medium text-slate-300">{label}</p>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-200">
                <Image
                  src={src}
                  alt={label === "Input photo" ? label : sample.caption || "Workflow result"}
                  width={label === "Input photo" ? 1024 : imageWidth}
                  height={label === "Input photo" ? 816 : imageHeight}
                  className={sample.inputImage ? "aspect-[5/4] w-full object-contain" : "h-auto w-full object-contain"}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {sample.video && (
        <video src={sample.video} poster={sample.poster} controls playsInline preload="metadata" className="max-h-[640px] w-full rounded-2xl border border-white/10 bg-slate-950" />
      )}
      {sample.audio && <audio src={sample.audio} controls preload="metadata" className="w-full" />}
      {sample.text && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-sm leading-relaxed text-slate-200">
          {sample.text}
        </pre>
      )}
      {(sample.caption || sample.credit) && <figcaption className="mt-4 text-sm leading-relaxed text-slate-400">
        {sample.caption}
        {sample.credit && (
          <span className="mt-2 block text-xs text-slate-500">
            <a href={sample.credit.url} className="underline underline-offset-2">{sample.credit.name}</a>
            {" · "}
            <a href={sample.credit.licenseUrl} className="underline underline-offset-2">{sample.credit.license}</a>
          </span>
        )}
      </figcaption>}
    </figure>
  );
}
