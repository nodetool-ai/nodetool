/**
 * The single page `nodetool timeline preview` serves. It is self-contained (no
 * external scripts, fonts or styles) because the host is often offline or
 * behind a proxy. All data comes from `/api/source`, and every value from the
 * document is written with `textContent`, never as HTML.
 */
export function previewPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NodeTool preview</title>
<style>
:root { color-scheme: dark; --bg: #111317; --panel: #1a1d23; --line: #2a2f38; --text: #e6e8eb; --muted: #9aa1ab; --accent: #6aa6ff; --error: #ff6b6b; --warn: #f3b24e; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { padding: 12px 16px; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: baseline; }
h1 { font-size: 16px; font-weight: 600; margin: 0; }
.muted { color: var(--muted); }
main { padding: 16px; max-width: 1280px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.viewer { display: grid; gap: 8px; }
.stage { position: relative; max-height: 70vh; background: #000; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.stage img, .stage video { width: 100%; height: 100%; object-fit: contain; display: block; }
.stage .status { position: absolute; left: 8px; bottom: 8px; background: rgba(0,0,0,.7); padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.controls input[type=range] { flex: 1 1 240px; }
button { background: #252a33; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; font: inherit; cursor: pointer; }
button:hover { border-color: var(--accent); }
.strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.strip figure { margin: 0; flex: 0 0 auto; cursor: pointer; text-align: center; }
.strip img { height: 72px; border-radius: 4px; border: 2px solid transparent; display: block; background: #000; }
.strip figure.active img { border-color: var(--accent); }
.strip figcaption { font-size: 11px; color: var(--muted); }
.tracks { display: grid; gap: 4px; }
.track { display: grid; grid-template-columns: 140px 1fr; gap: 8px; align-items: center; }
.track .lane { position: relative; height: 22px; background: #14171c; border-radius: 4px; }
.clip { position: absolute; top: 2px; bottom: 2px; background: #2f4a73; border-radius: 3px; font-size: 11px; padding: 0 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; }
.clip:hover { background: #3d5f93; }
.playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); pointer-events: none; }
.issues li.error { color: var(--error); }
.issues li.warning { color: var(--warn); }
.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.shot { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; display: grid; align-content: start; }
.shot .media { background: #000; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; }
.shot .media img, .shot .media video { width: 100%; height: 100%; object-fit: cover; display: block; }
.shot .body { padding: 8px 10px; display: grid; gap: 4px; }
.shot .meta { display: flex; flex-wrap: wrap; gap: 0 8px; justify-content: space-between; font-size: 12px; color: var(--muted); }
.error-box { color: var(--error); white-space: pre-wrap; }
@media (max-width: 640px) { .track { grid-template-columns: 80px 1fr; } }
</style>
</head>
<body>
<header><h1 id="title">Loading…</h1><span id="summary" class="muted"></span></header>
<main id="main"></main>
<script>
"use strict";
const el = (tag, props, children) => {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  for (const child of children || []) node.append(child);
  return node;
};
const main = document.getElementById("main");
const fmt = (ms) => { const s = ms / 1000; const m = Math.floor(s / 60); return m + ":" + (s - m * 60).toFixed(2).padStart(5, "0"); };
let version = null;
let view = null;

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body;
}

function showError(message) {
  main.replaceChildren(el("div", { className: "panel error-box", textContent: message }));
}

function timelineView(source) {
  let frame = 0;
  let requested = null;
  const img = el("img", { alt: "Rendered frame" });
  const status = el("span", { className: "status" });
  const stage = el("div", { className: "stage" }, [img, status]);
  stage.style.aspectRatio = source.width + " / " + source.height;
  const slider = el("input", { type: "range", min: 0, max: Math.max(0, source.totalFrames - 1), value: 0 });
  const label = el("span", { className: "muted" });
  const prev = el("button", { textContent: "◀ Frame", title: "Previous frame (←)" });
  const next = el("button", { textContent: "Frame ▶", title: "Next frame (→)" });
  const videoButton = el("button", { textContent: "Render video" });
  const strip = el("div", { className: "strip" });
  const tracks = el("div", { className: "tracks" });
  const playheads = [];
  let timer = null;

  function show(target) {
    frame = Math.max(0, Math.min(source.totalFrames - 1, target));
    slider.value = frame;
    const ms = (frame / source.fps) * 1000;
    label.textContent = "frame " + frame + " / " + (source.totalFrames - 1) + " · " + fmt(ms);
    for (const head of playheads) head.style.left = (ms / source.durationMs) * 100 + "%";
    for (const fig of strip.children) fig.classList.toggle("active", Number(fig.dataset.frame) === frame);
    clearTimeout(timer);
    timer = setTimeout(load, 120);
  }
  function load() {
    if (stage.contains(img) === false) stage.replaceChildren(img, status);
    const url = "/frame/" + frame + ".png?v=" + source.version;
    if (requested === url) return;
    requested = url;
    status.textContent = "Rendering frame " + frame + "…";
    status.hidden = false;
    const probe = new Image();
    probe.onload = () => { if (requested === url) { img.src = url; status.hidden = true; } };
    probe.onerror = async () => {
      if (requested !== url) return;
      try { await getJson(url); } catch (error) { status.textContent = error.message; }
    };
    probe.src = url;
  }
  async function loadStrip() {
    strip.replaceChildren(el("span", { className: "muted", textContent: "Rendering thumbnails…" }));
    try {
      const result = await getJson("/api/strip?count=12");
      strip.replaceChildren(...result.frames.map((f) => {
        const fig = el("figure", {}, [
          el("img", { src: "/frame/" + f + ".png?scale=" + result.scale + "&v=" + result.version, alt: "Frame " + f }),
          el("figcaption", { textContent: fmt((f / source.fps) * 1000) })
        ]);
        fig.dataset.frame = f;
        fig.onclick = () => show(f);
        return fig;
      }));
    } catch (error) {
      strip.replaceChildren(el("span", { className: "error-box", textContent: error.message }));
    }
  }
  videoButton.onclick = () => {
    const video = el("video", { controls: true, autoplay: true, src: "/video.mp4?v=" + source.version });
    status.textContent = "Rendering the video. This takes about as long as an export.";
    status.hidden = false;
    video.onloadeddata = () => { status.hidden = true; };
    video.onerror = async () => {
      try { await getJson(video.src); } catch (error) { status.textContent = error.message; }
    };
    requested = null;
    stage.replaceChildren(video, status);
  };
  slider.oninput = () => show(Number(slider.value));
  prev.onclick = () => show(frame - 1);
  next.onclick = () => show(frame + 1);
  document.onkeydown = (event) => {
    if (event.target instanceof HTMLInputElement && event.target !== slider) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); show(frame - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); show(frame + 1); }
  };

  for (const track of source.tracks) {
    const lane = el("div", { className: "lane" });
    for (const clip of source.clips.filter((c) => c.trackId === track.id)) {
      const bar = el("div", { className: "clip", textContent: clip.name, title: clip.name + " (" + clip.mediaType + ") " + fmt(clip.startMs) + "–" + fmt(clip.startMs + clip.durationMs) });
      bar.style.left = (clip.startMs / source.durationMs) * 100 + "%";
      bar.style.width = Math.max(0.3, (clip.durationMs / source.durationMs) * 100) + "%";
      bar.onclick = () => show(Math.round((clip.startMs / 1000) * source.fps));
      lane.append(bar);
    }
    const head = el("div", { className: "playhead" });
    playheads.push(head);
    lane.append(head);
    tracks.append(el("div", { className: "track" }, [el("span", { className: "muted", textContent: track.name + " · " + track.type }), lane]));
  }

  const parts = [
    el("section", { className: "panel viewer" }, [stage, el("div", { className: "controls" }, [prev, slider, next, label, videoButton])]),
    el("section", { className: "panel" }, [strip]),
    el("section", { className: "panel" }, [tracks])
  ];
  const v = source.validation;
  if (v && (v.errors.length || v.warnings.length)) {
    const items = [...v.errors, ...v.warnings].map((issue) =>
      el("li", { className: issue.severity, textContent: issue.severity + " " + issue.code + ": " + issue.message + (issue.clipId ? " [clip " + issue.clipId + "]" : "") }));
    parts.push(el("section", { className: "panel" }, [el("strong", { textContent: "Validation" }), el("ul", { className: "issues" }, items)]));
  }
  main.replaceChildren(...parts);
  if (source.totalFrames === 0) { showError("The timeline has zero duration: it has no clips."); return { update() {} }; }
  show(0);
  loadStrip();
  return {
    update(next) {
      source = next;
      requested = null;
      slider.max = Math.max(0, source.totalFrames - 1);
      show(Math.min(frame, source.totalFrames - 1));
      loadStrip();
    }
  };
}

function storyboardView(source) {
  const [w, h] = source.aspectRatio.split(":").map(Number);
  const ratio = w > 0 && h > 0 ? w + " / " + h : "16 / 9";
  const cards = source.shots.map((shot) => {
    const media = el("div", { className: "media" });
    media.style.aspectRatio = ratio;
    if (shot.clip) {
      const video = el("video", { controls: true, preload: "metadata", src: shot.clip.src });
      if (shot.keyframe) video.poster = shot.keyframe.src;
      media.append(video);
    } else if (shot.keyframe) {
      media.append(el("img", { src: shot.keyframe.src, alt: shot.slug || "Shot " + (shot.index + 1), loading: "lazy" }));
    } else {
      media.textContent = "No still yet";
    }
    const body = el("div", { className: "body" }, [
      el("div", { className: "meta" }, [
        el("span", { textContent: "#" + (shot.index + 1) + (shot.slug ? " · " + shot.slug : "") }),
        el("span", { textContent: (shot.durationSeconds ? shot.durationSeconds + "s · " : "") + shot.status })
      ]),
      el("div", { textContent: shot.action })
    ]);
    if (shot.dialogue) body.append(el("div", { className: "muted", textContent: "Dialogue: " + shot.dialogue }));
    if (shot.narration) body.append(el("div", { className: "muted", textContent: "Narration: " + shot.narration }));
    return el("article", { className: "shot" }, [media, body]);
  });
  const parts = [];
  if (source.brief || source.style || source.timelineId) {
    const info = el("section", { className: "panel" });
    if (source.brief) info.append(el("div", { textContent: source.brief }));
    if (source.style) info.append(el("div", { className: "muted", textContent: "Style: " + source.style }));
    if (source.timelineId) info.append(el("div", { className: "muted", textContent: "Assembled timeline: nodetool timeline preview " + source.timelineId }));
    parts.push(info);
  }
  parts.push(cards.length ? el("section", { className: "shots" }, cards) : el("div", { className: "panel muted", textContent: "The storyboard has no shots." }));
  main.replaceChildren(...parts);
  return { update(next) { view = storyboardView(next); } };
}

function header(source) {
  document.getElementById("title").textContent = source.name;
  document.title = source.name + " · NodeTool preview";
  document.getElementById("summary").textContent = source.kind === "timeline"
    ? "Timeline · " + source.width + "×" + source.height + " · " + source.fps + " fps · " + fmt(source.durationMs) + " · " + source.totalFrames + " frames · " + source.clips.length + " clips"
    : "Storyboard · " + source.shots.length + " shots · " + source.aspectRatio;
}

async function poll() {
  try {
    const source = await getJson("/api/source");
    if (source.version !== version) {
      const first = version === null;
      version = source.version;
      header(source);
      if (first || !view || view.kind !== source.kind) {
        view = source.kind === "timeline" ? timelineView(source) : storyboardView(source);
        view.kind = source.kind;
      } else {
        view.update(source);
        if (view) view.kind = source.kind;
      }
    }
  } catch (error) {
    if (version === null) showError(error.message);
  }
  setTimeout(poll, 2000);
}
poll();
</script>
</body>
</html>`;
}
