#version 440
layout(location=0) in vec3 position;
layout(location=1) in vec2 uv;
layout(location=2) in vec4 color;
layout(location=3) in float softness;
layout(std140,binding=0) uniform Camera {mat4 viewProjection;mat4 view;vec4 viewport;vec4 fogColor;vec4 fogSettings;vec4 cameraPosition;};
layout(location=0) out vec2 vUv;
layout(location=1) out vec4 vColor;
layout(location=2) out float vSoftness;
layout(location=3) out float vViewDepth;
layout(location=4) out vec3 vPosition;
void main(){gl_Position=viewProjection*vec4(position,1.0);vUv=uv;vColor=color;vSoftness=softness;vViewDepth=-(view*vec4(position,1.0)).z;vPosition=position;}
