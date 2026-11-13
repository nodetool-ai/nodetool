#version 440

// Draws a shared texture as premultiplied, sRGB-encoded color, which is
// what the Qt Quick scene graph blends. A premultiplied sRGB texture passes
// through untouched. Straight alpha and linear light are converted here, in
// the draw that puts the texture on screen, so no intermediate copy exists.

layout(location = 0) in vec2 vTexCoord;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    int straightAlpha;
    int linearLight;
};
layout(binding = 1) uniform sampler2D source;

vec3 srgbEncode(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
    vec4 c = texture(source, vTexCoord);
    if (straightAlpha != 0 || linearLight != 0) {
        float a = clamp(c.a, 0.0, 1.0);
        vec3 rgb = c.rgb;
        if (straightAlpha == 0) rgb = a > 0.0 ? rgb / a : vec3(0.0);
        if (linearLight != 0) rgb = srgbEncode(rgb);
        c = vec4(rgb * a, a);
    }
    fragColor = c * qt_Opacity;
}
