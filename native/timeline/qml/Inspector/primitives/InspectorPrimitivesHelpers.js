.pragma library
function formatTimecode(ms, fps) {
    const actualFps = Math.max(1, fps);
    const safeFps = Math.max(1, Math.round(fps));
    const totalFrames = Math.max(0, Math.round((ms / 1000) * actualFps));
    const ff = totalFrames % safeFps;
    const totalSec = Math.floor(totalFrames / safeFps);
    const ss = totalSec % 60;
    const mm = Math.floor(totalSec / 60) % 60;
    const hh = Math.floor(totalSec / 3600);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}
function parseTimecode(input, fps) {
    const trimmed = input.trim();
    if (trimmed === "")
        return null;
    const actualFps = Math.max(1, fps);
    const safeFps = Math.max(1, Math.round(fps));
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 0)
            return null;
        return Math.round(n);
    }
    const parts = trimmed.split(":").map((p) => p.trim());
    if (parts.some((p) => !/^\d+$/.test(p)))
        return null;
    const nums = parts.map(Number);
    if (nums.some((n) => !Number.isFinite(n) || n < 0))
        return null;
    let hh = 0;
    let mm = 0;
    let ss = 0;
    let ff = 0;
    if (nums.length === 4) {
        [hh, mm, ss, ff] = nums;
    }
    else if (nums.length === 3) {
        [hh, mm, ss] = nums;
    }
    else if (nums.length === 2) {
        [mm, ss] = nums;
    }
    else if (nums.length === 1) {
        [ss] = nums;
    }
    else {
        return null;
    }
    const totalSec = hh * 3600 + mm * 60 + ss;
    if (nums.length === 4) {
        return Math.round(((totalSec * safeFps + ff) * 1000) / actualFps);
    }
    return Math.round(totalSec * 1000 + (ff * 1000) / actualFps);
}
function parseSeconds(input) {
    const trimmed = input.trim().replace(/s$/i, "").trim();
    if (trimmed === "")
        return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0)
        return null;
    return Math.round(n * 1000);
}
function parseNumberList(input) {
    const trimmed = input.trim();
    if (trimmed === "")
        return [];
    const parts = trimmed.split(/[,\s]+/);
    const out = [];
    for (const part of parts) {
        const n = Number(part);
        if (!Number.isFinite(n))
            return null;
        out.push(n);
    }
    return out;
}
function formatNumberList(values) {
    return (values !== null && values !== void 0 ? values : []).join(", ");
}
function parseGradientStops(input) {
    const trimmed = input.trim();
    if (trimmed === "")
        return [];
    const out = [];
    for (const part of trimmed.split(",")) {
        const [rawOffset, ...rest] = part.split(":");
        const color = rest.join(":").trim();
        const offset = Number(rawOffset);
        if (!Number.isFinite(offset) || color === "")
            return null;
        out.push({ offset: Math.min(1, Math.max(0, offset)), color });
    }
    return out.sort((a, b) => a.offset - b.offset);
}
function formatGradientStops(stops) {
    return (stops !== null && stops !== void 0 ? stops : []).map((s) => `${s.offset}:${s.color}`).join(", ");
}
function parseCurvePoints(input) {
    const trimmed = input.trim();
    if (trimmed === "")
        return [];
    const out = [];
    for (const pair of trimmed.split(/\s+/)) {
        const parts = pair.split(",");
        if (parts.length !== 2)
            return null;
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return null;
        out.push({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
    }
    return out.sort((a, b) => a.x - b.x);
}
function formatCurvePoints(points) {
    return (points !== null && points !== void 0 ? points : []).map((p) => `${p.x},${p.y}`).join(" ");
}
function parseFiniteNumber(raw) {
    if (raw.trim() === "")
        return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}
