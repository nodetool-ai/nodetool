.pragma library
// Pure edits on an effect's `masks` array, the native counterpart of
// packages/timeline/src/effectMasks.ts. Every function returns a new array, so
// a gesture previews and commits through ClipEffectsEdits.patch as one undo entry.

const maskableTypes = ["color", "exposure", "liftGammaGain", "curves", "hueSatCurves", "secondaryColor", "vignette", "sharpen", "blur"];
const KAPPA = 0.5522847498307936;
const modes = [{label: "Add", value: "add"}, {label: "Subtract", value: "subtract"}, {label: "Intersect", value: "intersect"}];
const shapeLabels = {ellipse: "Ellipse", polygon: "Polygon", bezier: "Pen"};

function maskable(type) { return maskableTypes.indexOf(type) >= 0; }

function ellipseVertices(cx, cy, rx, ry) {
    const kx = rx * KAPPA, ky = ry * KAPPA;
    return [
        {x: cx, y: cy - ry, inX: -kx, inY: 0, outX: kx, outY: 0},
        {x: cx + rx, y: cy, inX: 0, inY: -ky, outX: 0, outY: ky},
        {x: cx, y: cy + ry, inX: kx, inY: 0, outX: -kx, outY: 0},
        {x: cx - rx, y: cy, inX: 0, inY: ky, outX: 0, outY: -ky}
    ];
}

function create(shape, id, vertices) {
    const path = vertices || (shape === "ellipse" ? ellipseVertices(0.5, 0.5, 0.25, 0.25)
        : [{x: 0.3, y: 0.3}, {x: 0.7, y: 0.3}, {x: 0.7, y: 0.7}, {x: 0.3, y: 0.7}]);
    return {id: id, shape: shape, vertices: path, feather: 0.02, opacity: 1, expansion: 0, inverted: false, mode: "add"};
}

function nextName(masks) { return "Mask (" + ((masks || []).length + 1) + ")"; }

function add(masks, shape, id, vertices) {
    const mask = create(shape, id, vertices);
    mask.name = nextName(masks);
    return (masks || []).concat([mask]);
}

function remove(masks, id) { return (masks || []).filter(mask => mask.id !== id); }

function patch(masks, id, change) {
    return (masks || []).map(mask => {
        if (mask.id !== id) return mask;
        const next = Object.assign({}, mask);
        for (const key of Object.keys(change)) {
            if (change[key] === undefined) delete next[key];
            else next[key] = change[key];
        }
        return next;
    });
}

function find(masks, id) { return (masks || []).find(mask => mask.id === id) || null; }

function mapVertices(masks, id, fn) {
    return (masks || []).map(mask => mask.id !== id ? mask : Object.assign({}, mask, {vertices: mask.vertices.map(fn)}));
}

function translate(masks, id, dx, dy) {
    return mapVertices(masks, id, v => Object.assign({}, v, {x: v.x + dx, y: v.y + dy}));
}

// Moves the vertices named in `indices`, or one tangent of one vertex (`handle` "in" / "out").
// A smooth vertex keeps its opposite tangent collinear unless `breakHandles` is set.
function moveVertex(masks, id, indices, dx, dy, handle, breakHandles) {
    return mapVertices(masks, id, (v, index) => {
        if (indices.indexOf(index) < 0) return v;
        if (!handle || handle === "point") return Object.assign({}, v, {x: v.x + dx, y: v.y + dy});
        const next = Object.assign({}, v);
        const key = handle === "in" ? "in" : "out", other = handle === "in" ? "out" : "in";
        next[key + "X"] = (v[key + "X"] || 0) + dx;
        next[key + "Y"] = (v[key + "Y"] || 0) + dy;
        if (!breakHandles && (v[other + "X"] || v[other + "Y"])) {
            const length = Math.hypot(v[other + "X"] || 0, v[other + "Y"] || 0);
            const own = Math.hypot(next[key + "X"], next[key + "Y"]) || 1;
            next[other + "X"] = -next[key + "X"] / own * length;
            next[other + "Y"] = -next[key + "Y"] / own * length;
        }
        return next;
    });
}

function insertVertex(masks, id, after, x, y) {
    return (masks || []).map(mask => {
        if (mask.id !== id) return mask;
        const vertices = mask.vertices.slice();
        vertices.splice(after + 1, 0, {x: x, y: y});
        return Object.assign({}, mask, {vertices: vertices, shape: mask.shape === "ellipse" ? "bezier" : mask.shape});
    });
}

// A mask keeps at least three vertices, so deleting cannot collapse it to a line.
function removeVertex(masks, id, index) {
    return (masks || []).map(mask => {
        if (mask.id !== id || mask.vertices.length <= 3) return mask;
        const vertices = mask.vertices.filter((_, i) => i !== index);
        return Object.assign({}, mask, {vertices: vertices, shape: mask.shape === "ellipse" ? "bezier" : mask.shape});
    });
}

// Toggles a vertex between a corner and a smooth point whose tangents follow its neighbours.
function toggleSmooth(masks, id, index) {
    return (masks || []).map(mask => {
        if (mask.id !== id) return mask;
        const n = mask.vertices.length;
        const vertices = mask.vertices.map((v, i) => {
            if (i !== index) return v;
            if (v.inX || v.inY || v.outX || v.outY) return {x: v.x, y: v.y};
            const prev = mask.vertices[(i + n - 1) % n], next = mask.vertices[(i + 1) % n];
            const tx = (next.x - prev.x) / 6, ty = (next.y - prev.y) / 6;
            return {x: v.x, y: v.y, inX: -tx, inY: -ty, outX: tx, outY: ty};
        });
        return Object.assign({}, mask, {vertices: vertices, shape: mask.shape === "polygon" ? "bezier" : mask.shape});
    });
}

function bounds(mask) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const v of mask.vertices) {
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    return {x: x0, y: y0, width: x1 - x0, height: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2};
}

// Points along the closed path for drawing, in normalized space.
function outline(mask, subdivisions) {
    const steps = subdivisions || 16, points = [], vertices = mask.vertices, n = vertices.length;
    for (let i = 0; i < n; ++i) {
        const a = vertices[i], b = vertices[(i + 1) % n];
        points.push({x: a.x, y: a.y});
        if (!a.outX && !a.outY && !b.inX && !b.inY) continue;
        const p1x = a.x + (a.outX || 0), p1y = a.y + (a.outY || 0), p2x = b.x + (b.inX || 0), p2y = b.y + (b.inY || 0);
        for (let s = 1; s < steps; ++s) {
            const t = s / steps, u = 1 - t;
            const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
            points.push({x: w0 * a.x + w1 * p1x + w2 * p2x + w3 * b.x, y: w0 * a.y + w1 * p1y + w2 * p2y + w3 * b.y});
        }
    }
    return points;
}

// Index of the segment nearest to (x, y), in the units of x and y, as {after, distance}.
function nearestSegment(mask, x, y, aspect) {
    const vertices = mask.vertices, n = vertices.length, k = aspect || 1;
    let best = {after: -1, distance: Infinity};
    for (let i = 0; i < n; ++i) {
        const a = vertices[i], b = vertices[(i + 1) % n];
        const ex = (b.x - a.x) * k, ey = b.y - a.y, len = ex * ex + ey * ey;
        const t = len > 0 ? Math.max(0, Math.min(1, ((x - a.x) * k * ex + (y - a.y) * ey) / len)) : 0;
        const d = Math.hypot((x - a.x) * k - ex * t, y - a.y - ey * t);
        if (d < best.distance) best = {after: i, distance: d};
    }
    return best;
}

// Even-odd test against the flattened path.
function contains(mask, x, y) {
    const points = outline(mask);
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[j], b = points[i];
        if ((a.y > y) !== (b.y > y) && x < a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x)) inside = !inside;
    }
    return inside;
}

function appendVertex(masks, id, x, y) {
    return (masks || []).map(mask => mask.id !== id ? mask : Object.assign({}, mask, {vertices: mask.vertices.concat([{x: x, y: y}])}));
}
