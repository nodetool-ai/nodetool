#version 440
layout(location=0) in vec2 uv;
layout(location=0) out vec4 color;
layout(std140,binding=0) uniform buf {
    mat4 matrix;
    vec4 flipsMode;
};
layout(binding=1) uniform sampler2D backdrop;
layout(binding=2) uniform sampler2D layer;

// packages/gpu/src/blend/wgsl.ts. IDs match blendModes.ts.
float softLightD(float x) {
    if (x <= 0.25) { return ((16.0*x-12.0)*x+4.0)*x; }
    return sqrt(x);
}
float blendChannel(float s, float d, int mode) {
    switch (mode) {
    case 1: return s*d;
    case 2: return s+d-s*d;
    case 3: return d <= 0.5 ? 2.0*s*d : 1.0-2.0*(1.0-s)*(1.0-d);
    case 4: return min(s,d);
    case 5: return max(s,d);
    case 6: return s >= 1.0 ? 1.0 : min(1.0,d/max(1.0-s,0.001));
    case 7: return s <= 0.0 ? 0.0 : max(0.0,1.0-(1.0-d)/max(s,0.001));
    case 8: return s <= 0.5 ? 2.0*s*d : 1.0-2.0*(1.0-s)*(1.0-d);
    case 9: return s <= 0.5 ? d-(1.0-2.0*s)*d*(1.0-d) : d+(2.0*s-1.0)*(softLightD(d)-d);
    case 10: return abs(s-d);
    case 11: return s+d-2.0*s*d;
    case 12: return min(1.0,s+d);
    default: return s;
    }
}
void main() {
    vec4 b = texture(backdrop, vec2(uv.x, flipsMode.x > 0.5 ? 1.0-uv.y : uv.y));
    vec4 l = texture(layer, vec2(uv.x, flipsMode.y > 0.5 ? 1.0-uv.y : uv.y));
    if (l.a <= 0.0) { color = b; return; }
    int mode = int(flipsMode.z);
    // Both inputs already contain coverage and opacity. The export's source
    // is straight, so undo premultiplication once before applying its math.
    vec3 sc = l.rgb/max(l.a,1.0/65535.0);
    if (mode == 12) {
        color = min(vec4(sc*l.a+b.rgb,l.a+b.a),vec4(1.0));
        return;
    }
    vec3 dc = b.a > 0.0 ? b.rgb/max(b.a,1.0/65535.0) : vec3(0.0);
    vec3 blended = vec3(blendChannel(sc.r,dc.r,mode), blendChannel(sc.g,dc.g,mode), blendChannel(sc.b,dc.b,mode));
    // packages/gpu/src/compositor/shaders.ts fs_blend, premultiplied output.
    color = vec4(l.a*(1.0-b.a)*sc+l.a*b.a*blended+(1.0-l.a)*b.rgb, l.a+b.a*(1.0-l.a));
}
