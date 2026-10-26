#version 440

// One layer: an RGBA texture (premultiplied), or YUV planes converted with the
// frame's colour matrix (DESIGN.md D10). The result is premultiplied and
// scaled by the layer opacity; the pipeline blends One / OneMinusSrcAlpha,
// which is premultiplied "over".
layout(location = 0) in vec2 v_texcoord;

layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 mvp;
    mat4 colorMatrix;
    float opacity;
    float flipV;
    float mode;  // 0 RGBA, 1 I420 (Y, U, V), 2 NV12 (Y, CbCr)
    vec4 sourceRect;
    vec4 sourceTexelSize;
};

layout(binding = 1) uniform sampler2D plane0;
layout(binding = 2) uniform sampler2D plane1;
layout(binding = 3) uniform sampler2D plane2;

void main()
{
    vec2 uv = v_texcoord;
    if (any(notEqual(sourceRect, vec4(0.0, 0.0, 1.0, 1.0)))) {
        vec2 halfTexel = 0.5 * sourceTexelSize.xy;
        vec2 origin = sourceRect.xy;
        if (flipV > 0.5) origin.y = 1.0 - origin.y - sourceRect.w;
        uv = clamp(uv, origin + halfTexel, origin + sourceRect.zw - halfTexel);
    }
    vec4 color;
    if (mode < 0.5) {
        color = texture(plane0, uv);
    } else {
        float y = texture(plane0, uv).r;
        vec2 cbcr = mode < 1.5 ? vec2(texture(plane1, uv).r, texture(plane2, uv).r)
                               : texture(plane1, uv).rg;
        vec3 rgb = (colorMatrix * vec4(y, cbcr, 1.0)).rgb;
        color = vec4(clamp(rgb, 0.0, 1.0), 1.0);
    }
    fragColor = color * opacity;
}
