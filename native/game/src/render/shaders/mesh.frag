#version 440
layout(location=0) in vec4 vColor;
layout(location=1) in vec2 vUv;
layout(location=2) in vec4 shadowPosition;
layout(binding=1) uniform sampler2D surface;
layout(binding=2) uniform sampler2DShadow shadowMap;
layout(std140,binding=0) uniform Camera { mat4 viewProjection;mat4 lightProjection;vec4 shadowParameters; };
layout(location=0) out vec4 fragColor;
void main() {
 vec3 shadow=shadowPosition.xyz/shadowPosition.w;
 shadow.xy=shadow.xy*0.5+0.5;
 if(shadowParameters.x<0.5) shadow.z=shadow.z*0.5+0.5;
 float visibility=1.0;
 if(all(greaterThanEqual(shadow,vec3(0.0)))&&all(lessThanEqual(shadow,vec3(1.0)))) visibility=texture(shadowMap,vec3(shadow.xy,shadow.z-0.002));
 fragColor=vColor*texture(surface,vUv);fragColor.rgb*=0.4+0.6*visibility;
}
