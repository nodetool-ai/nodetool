#version 440

// One layer: an RGBA texture (premultiplied), or YUV planes converted with the
// frame's colour matrix (DESIGN.md D10). The result is premultiplied and
// scaled by the layer opacity; the pipeline blends One / OneMinusSrcAlpha,
// which is premultiplied "over".
layout(location = 0) in vec2 v_texcoord;
layout(location = 1) in vec2 localCoord;
layout(location = 2) in vec2 v_wipecoord;

layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 mvp;
    mat4 colorMatrix;
    float opacity;
    float flipV;
    float mode;  // 0 premultiplied RGBA, 1 I420, 2 NV12, 3 straight-filtered leaf RGBA
    vec4 sourceRect;
    vec4 sourceTexelSize;
    vec4 border;
    vec4 borderBounds;
    vec4 wipe;
    vec4 wipeCoordinates;
};

layout(binding = 1) uniform sampler2D plane0;
layout(binding = 2) uniform sampler2D plane1;
layout(binding = 3) uniform sampler2D plane2;

// Leaf uploads and effect chains reach web placement as straight RGBA8.
// Convert each stored premultiplied texel before filtering, not afterward.
vec4 straightPixel(vec2 cell) {
    vec2 size = vec2(1.0) / sourceTexelSize.xy;
    vec2 center = (clamp(cell, vec2(0.0), size - vec2(1.0)) + vec2(0.5)) * sourceTexelSize.xy;
    vec4 pixel = texture(plane0, center);
    vec3 rgb = pixel.a > 0.0 ? pixel.rgb / pixel.a : vec3(0.0);
    return vec4(floor(clamp(rgb, 0.0, 1.0) * 255.0 + 0.5) / 255.0, pixel.a);
}
vec4 straightFiltered(vec2 uv) {
    vec2 point = uv / sourceTexelSize.xy - vec2(0.5);
    vec2 cell = floor(point);
    vec2 weight = fract(point);
    vec4 top = mix(straightPixel(cell), straightPixel(cell + vec2(1.0, 0.0)), weight.x);
    vec4 bottom = mix(straightPixel(cell + vec2(0.0, 1.0)), straightPixel(cell + vec2(1.0, 1.0)), weight.x);
    vec4 color = mix(top, bottom, weight.y);
    return vec4(color.rgb * color.a, color.a);
}

void main()
{
    vec2 uv = v_texcoord;
    if (any(notEqual(sourceRect, vec4(0.0, 0.0, 1.0, 1.0)))) {
        vec2 halfTexel = 0.5 * sourceTexelSize.xy;
        vec2 origin = sourceRect.xy;
        if (flipV > 0.5) origin.y = 1.0 - origin.y - sourceRect.w;
        uv = clamp(uv, origin + halfTexel, origin + sourceRect.zw - halfTexel);
    }
    if (border.w > 0.5) {
        vec2 cropLocal = (localCoord - borderBounds.xy) / borderBounds.zw;
        if (any(lessThan(cropLocal, vec2(0.0))) || any(greaterThanEqual(cropLocal, vec2(1.0)))) {
            fragColor = vec4(0.0); return;
        }
        vec2 cropOrigin = sourceRect.xy + borderBounds.xy * sourceRect.zw;
        vec2 cropSize = borderBounds.zw * sourceRect.zw;
        if (flipV > 0.5) cropOrigin.y = 1.0 - cropOrigin.y - cropSize.y;
        vec2 halfTexel = sourceTexelSize.xy * 0.5;
        uv = clamp(uv, cropOrigin + halfTexel, cropOrigin + cropSize - halfTexel);
    }
    vec4 color;
    if (mode > 2.5) {
        color = straightFiltered(uv);
    } else if (mode < 0.5) {
        color = texture(plane0, uv);
    } else {
        float y = texture(plane0, uv).r;
        vec2 cbcr = mode < 1.5 ? vec2(texture(plane1, uv).r, texture(plane2, uv).r)
                               : texture(plane1, uv).rg;
        vec3 rgb = (colorMatrix * vec4(y, cbcr, 1.0)).rgb;
        color = vec4(clamp(rgb, 0.0, 1.0), 1.0);
    }
    float coverage = 1.0;
    if (border.x > 0.0) {
        vec2 local = ((localCoord - borderBounds.xy) / borderBounds.zw) * 2.0 - 1.0;
        float aspect = border.y;
        vec2 p = local;
        if (aspect > 1.0) p.y /= aspect; else p.x *= aspect;
        vec2 halfSize = vec2(min(1.0, aspect), min(1.0, 1.0 / aspect));
        float radius = border.x * 2.0 * min(halfSize.x, halfSize.y);
        vec2 d = abs(p) - halfSize + radius;
        float dist = min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - radius;
        coverage = 1.0 - smoothstep(-border.z, border.z, dist);
    }
    if (wipe.x > 0.5) {
        float c = wipe.x < 1.5 ? v_wipecoord.x : wipe.x < 2.5 ? 1.0 - v_wipecoord.x
                    : wipe.x < 3.5 ? v_wipecoord.y : 1.0 - v_wipecoord.y;
        float reveal = 1.0;
        if (wipe.y <= 0.0) {
            reveal = 0.0;
        } else if (wipe.y < 1.0) {
            // Match the shared WebGPU compositor, including sub-texel hard edges.
            float softness = max(wipe.z, 0.0001);
            float edge = wipe.y * (1.0 + softness);
            reveal = 1.0 - smoothstep(edge - softness, edge, c);
        }
        if (any(lessThan(v_wipecoord, vec2(0.0))) || any(greaterThan(v_wipecoord, vec2(1.0)))) {
            reveal = 0.0;
        }
        coverage *= reveal;
    }
    fragColor = color * opacity * coverage;
}
