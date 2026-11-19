#version 440
layout(location = 0) in vec2 v_texcoord;
layout(location = 1) in vec2 localCoord;
layout(location = 2) in vec2 v_wipecoord;
layout(location = 0) out vec4 fragColor;

// Same bindings and std140 layout as composite.frag. border is
// (alphaDisplay, grid, cellPx, 0). borderBounds.xy is the picture's top-left
// in framebuffer pixels, and .z is +1 for Y-down or -1 for Y-up.
layout(std140, binding = 0) uniform buf {
    mat4 mvp;
    mat4 colorMatrix;
    float opacity;
    float flipV;
    float mode;
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

void main()
{
    vec4 color = texture(plane0, v_texcoord);
    if (border.x > 0.5) {
        fragColor = vec4(color.aaa, 1.0);
    } else if (border.y > 0.5) {
        vec2 point = (gl_FragCoord.xy - borderBounds.xy) * vec2(1.0, borderBounds.z);
        vec2 cell = floor(point / border.z);
        float checker = mod(cell.x + cell.y, 2.0) < 1.0 ? 1.0 : 0.8;
        fragColor = vec4(color.rgb + vec3(checker) * (1.0 - color.a), 1.0);
    } else {
        fragColor = color;
    }
    // FP16 presentation only. Keep the existing encoded SDR values, with no
    // transfer conversion. Stable screen-space 8x8 Bayer noise affects RGB,
    // never working storage, alpha, or the alpha diagnostic display.
    if (mode > 0.5 && border.x < 0.5) {
        ivec2 pixel = ivec2(gl_FragCoord.xy);
        int rank = 0;
        for (int bit = 0; bit < 3; ++bit) {
            int x = (pixel.x >> bit) & 1;
            int y = (pixel.y >> bit) & 1;
            rank |= ((x ^ y) * 2 + y) << (4 - bit * 2);
        }
        float noise = (float(rank) + 0.5) / 64.0 - 0.5;
        fragColor.rgb = floor(clamp(fragColor.rgb, 0.0, 1.0) * 255.0 + 0.5 + noise) / 255.0;
    }
}
