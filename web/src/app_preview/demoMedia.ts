/**
 * Client-side demo media for app previews: a synthesized WAV (audio widgets)
 * and a short Ken Burns WebM rendered from the template's card art (video
 * widgets). Generated in the browser so the preview needs no media assets or
 * ffmpeg — only the JPG the generator script already copies.
 */

/**
 * A soft abstract-gradient JPEG data URI, seeded by `text` so each app gets a
 * stable, distinct look. Fallback demo visual for templates without card art.
 */
export function makeDemoGradient(text: string): string {
  let hash = 0;
  for (const c of text) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;

  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, `hsl(${hue}, 60%, 16%)`);
  base.addColorStop(1, `hsl(${(hue + 60) % 360}, 55%, 30%)`);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // A few soft glow blobs for depth.
  for (let i = 0; i < 4; i++) {
    const x = ((Math.abs(hash >> (i * 3)) % 100) / 100) * canvas.width;
    const y = ((Math.abs(hash >> (i * 5)) % 100) / 100) * canvas.height;
    const r = 140 + (Math.abs(hash >> i) % 160);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, `hsla(${(hue + 30 * i) % 360}, 80%, 60%, 0.35)`);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** A soft two-note chord as a PCM16 WAV data URI. */
export function makeDemoAudio(durationSec = 2, sampleRate = 22050): string {
  const total = Math.floor(durationSec * sampleRate);
  const samples = new Int16Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 8) * Math.exp(-t * 1.2);
    const v = 0.35 * env * (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 330 * t));
    samples[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  }
  const header = new ArrayBuffer(44);
  const dv = new DataView(header);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  dv.setUint32(4, 36 + samples.byteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeStr(36, "data");
  dv.setUint32(40, samples.byteLength, true);
  const bytes = new Uint8Array(44 + samples.byteLength);
  bytes.set(new Uint8Array(header), 0);
  bytes.set(new Uint8Array(samples.buffer), 44);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/**
 * Record a short slow-zoom clip of `imageUrl` to a WebM blob URL. Falls back
 * to null when the image can't load or MediaRecorder is unavailable.
 */
export async function makeDemoVideo(
  imageUrl: string,
  durationMs = 900
): Promise<string | null> {
  if (typeof MediaRecorder === "undefined") return null;
  const img = new Image();
  img.src = imageUrl;
  try {
    await img.decode();
  } catch {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  const done = new Promise<void>((resolveDone) => {
    recorder.onstop = () => resolveDone();
  });
  recorder.start();

  const start = performance.now();
  const draw = () => {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    const zoom = 1 + 0.06 * t;
    const w = canvas.width * zoom;
    const h = canvas.height * zoom;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    if (t < 1) {
      requestAnimationFrame(draw);
    } else {
      recorder.stop();
    }
  };
  draw();

  await done;
  return URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
}
