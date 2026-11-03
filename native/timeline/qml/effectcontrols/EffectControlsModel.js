.pragma library
.import "../../src/edit/clipeffects/ClipEffectsCatalog.js" as Catalog

// What the Effect Controls panel lists for a clip: pure, so the panel can rebuild its
// rows only when this list changes and not on every edit of a value.
// The order follows Premiere's fixed effects: Motion, Opacity, Time Remapping, then Crop, Corners
// and Motion blur, then the clip's effects, then under audio Volume and the audio effects.
// `sections` are the ones registered for this panel, whose controls have no keyframes. Crop and
// Corners are rows like Motion's, in a group with no switch.
function groups(clip, rowSpecs, visualEffects, audioEffects, sections) {
    const type = clip.mediaType || "";
    const result = [];
    const rows = ids => ids.map(id => rowSpecs.find(row => row.id === id)).filter(row => !!row);
    const sound = type === "audio" || type === "midi";
    const registered = id => (sections || []).find(section => section.id === id);
    const addSection = id => {
        const section = registered(id);
        if (section) {
            result.push({id: id, kind: "section", label: section.title, source: section.source, rows: [], startsOpen: false});
        }
    };
    if (!sound && type !== "adjustment") {
        result.push({id: "motion", kind: "fixed", label: "Motion", rows: rows(["position", "scale", "rotation", "anchor", "rotationX", "rotationY", "perspective", "depth"])});
    }
    if (type === "model3d") {
        result.push({id: "camera", kind: "camera", label: "Camera", rows: rows(["cameraOrbit", "cameraFov", "cameraZoom"])});
    }
    if (!sound) {
        result.push({id: "opacity", kind: "fixed", label: "Opacity", rows: rows(["opacity"])});
    }
    if (type !== "midi" && type !== "group") {
        addSection("timeRemap");
    }
    const addRows = (id, label, ids) => result.push({id: id, kind: "section", label: label, rows: rows(ids), startsOpen: false});
    if (["video", "image", "overlay", "text", "shape", "model3d"].indexOf(type) >= 0) {
        addRows("crop", "Crop", ["cropLeft", "cropTop", "cropRight", "cropBottom"]);
    }
    if (!sound) {
        addRows("borderRadius", "Corners", ["borderRadius"]);
        addSection("motionBlur");
    }
    for (const effect of visualEffects) {
        result.push({id: "effect:" + effect.id, kind: "effect", effectId: effect.id, effectType: effect.type, rows: Catalog.keyedRows(effect.id, effect.type, type)});
    }
    if (sound) {
        const level = registered("audio");
        result.push({id: "volume", kind: "fixed", label: "Volume", rows: rows(["volume"]), source: level ? level.source : ""});
    }
    for (const effect of audioEffects) {
        result.push({id: "audioEffect:" + effect.id, kind: "audioEffect", effectId: effect.id, effectType: effect.type, rows: []});
    }
    return result;
}

// Which rows the panel can key.
function rowIds(groupList) {
    const ids = [];
    for (const group of groupList) {
        for (const row of group.rows) {
            ids.push(row.id);
        }
    }
    return ids;
}

// The frame grid of the sequence, so a key lands where the web's lane puts it.
function snappedMs(ms, clipStartMs, durationMs, fps) {
    const frameMs = 1000 / Math.max(1, fps);
    const held = Math.max(0, Math.min(durationMs, ms));
    return Math.max(0, Math.min(durationMs, Math.round((clipStartMs + held) / frameMs) * frameMs - clipStartMs));
}

// The tick steps follow FilmCraft crates/ui-egui/src/panels/effect_controls.rs paint_ruler
// (licenses/FilmCraft-MIT.txt): labels at least 80 px apart, and small ticks at least 8 px
// apart that divide the labelled ones evenly.
function rulerSteps(pxPerMs, fps) {
    const base = Math.max(1, Math.round(fps));
    const framePx = pxPerMs * 1000 / Math.max(1, fps);
    const steps = [1, 2, 5, 10, Math.floor(base / 2), base, base * 2, base * 5, base * 10, base * 15, base * 30,
                   base * 60, base * 120, base * 300, base * 600, base * 1800, base * 3600];
    const label = steps.find(step => step > 0 && step * framePx >= 80);
    const minor = steps.find(step => step > 0 && step * framePx >= 8 && (label === undefined || label % step === 0));
    return {label: label, minor: minor};
}

// The ticks over startMs..endMs of the sequence, placed from fromMs at pxPerMs.
function rulerTicks(startMs, endMs, fromMs, pxPerMs, fps) {
    const steps = rulerSteps(pxPerMs, fps);
    const frameMs = 1000 / Math.max(1, fps);
    const ticks = [];
    for (const [step, major] of [[steps.minor, false], [steps.label, true]]) {
        if (step === undefined) {
            continue;
        }
        let frame = Math.floor(startMs / frameMs / step) * step;
        for (let guard = 0; guard < 4096 && frame * frameMs <= endMs; ++guard, frame += step) {
            const ms = frame * frameMs;
            if (ms >= startMs) {
                ticks.push({ms: ms, x: (ms - fromMs) * pxPerMs, major: major});
            }
        }
    }
    return ticks;
}

function keyOf(row, ms) {
    return row + "@" + ms;
}
