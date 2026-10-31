#version 440
layout(location=0) in vec2 position;
layout(location=0) out vec4 color;
layout(location=1) out float linearDepth;
layout(std140,binding=0) uniform Camera{mat4 correction;mat4 inverseViewProjection;vec4 cameraPosition;vec4 settings;vec4 background;};
layout(binding=1) uniform samplerCube source;
void main(){vec4 point=inverseViewProjection*(correction*vec4(position,1,1));vec3 direction=normalize(point.xyz/point.w-cameraPosition.xyz);color=vec4(settings.z>0.5?texture(source,direction).rgb*settings.x:background.rgb,1);linearDepth=settings.y;}
