#version 440
layout(location=0) in vec2 uv;
layout(location=0) out vec4 color;
layout(std140,binding=0) uniform buf { mat4 matrix; vec4 flipsBorder; vec4 sizes; };
layout(binding=1) uniform sampler2D inputImage;
layout(binding=2) uniform sampler2D unusedImage;
void main() {
    vec2 pixel = uv * sizes.zw;
    vec2 inset = (sizes.zw - sizes.xy) * 0.5;
    vec2 source = (pixel-inset)/sizes.xy;
    // When no outset is reported, draw the band inside the old bounds.
    if (any(lessThan(pixel, vec2(flipsBorder.z))) ||
        any(greaterThanEqual(pixel, sizes.zw-vec2(flipsBorder.z)))) {
        color = vec4(1,0,0,1);
    } else {
        color = texture(inputImage, vec2(source.x, flipsBorder.x > 0.5 ? 1.0-source.y : source.y));
    }
}
