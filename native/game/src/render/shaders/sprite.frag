#version 440
layout(location=0) in vec2 uv;
layout(location=1) in vec4 tint;
layout(location=2) in vec3 world;
layout(location=0) out vec4 fragColor;
layout(std140,binding=0) uniform Lights { vec4 ambient; vec4 points[64]; } lights;
layout(binding=1) uniform sampler2D surface;
void main() {
 vec4 sampled=texture(surface,uv);
 vec4 color=vec4(sampled.rgb*tint.rgb*tint.a,sampled.a*tint.a);
 vec3 lighting=lights.ambient.rgb;
 for(int i=0;i<int(lights.ambient.a);++i) {
  vec4 p=lights.points[i*2]; vec4 c=lights.points[i*2+1];
  float attenuation=pow(max(0.0,1.0-length(world.xy-p.xy)/p.z),p.w);
  lighting+=c.rgb*c.a*attenuation;
 }
 if(world.z<0.5) { color.rgb*=clamp(lighting,0.0,1.0); }
 fragColor=color;
}
