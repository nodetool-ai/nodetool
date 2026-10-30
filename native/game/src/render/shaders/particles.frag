#version 440
layout(location=0) in vec2 vUv;
layout(location=1) in vec4 vColor;
layout(location=2) in float vSoftness;
layout(location=3) in float vViewDepth;
layout(location=4) in vec3 vPosition;
layout(std140,binding=0) uniform Camera {mat4 viewProjection;mat4 view;vec4 viewport;vec4 fogColor;vec4 fogSettings;vec4 cameraPosition;};
layout(binding=1) uniform sampler2D sceneDepth;
layout(location=0) out vec4 fragColor;
void main(){
 float falloff=clamp(1.0-length(vUv-0.5)*2.0,0.0,1.0);
 float alpha=vColor.a*falloff*falloff*(3.0-2.0*falloff);
 if(vSoftness>0.0){vec2 uv=gl_FragCoord.xy/viewport.xy;if(viewport.z>0.5){uv.y=1.0-uv.y;}float depth=texture(sceneDepth,uv).r;alpha*=clamp((depth-vViewDepth)/vSoftness,0.0,1.0);}
 if(alpha<=0.0){discard;}
 vec3 color=vColor.rgb;
 if(fogColor.a>0.5){float distance=length(vPosition-cameraPosition.xyz);float delta=fogSettings.z*abs(vPosition.y-cameraPosition.y);float average=delta<0.001?1.0-0.5*delta+delta*delta/6.0:(1.0-exp(-min(60.0,delta)))/delta;float exponent=clamp(-fogSettings.z*(min(vPosition.y,cameraPosition.y)-fogSettings.y),-60.0,60.0);float opticalDepth=min(80.0,fogSettings.x*distance*exp(exponent)*average);color=mix(color,fogColor.rgb,min(fogSettings.w,1.0-exp(-opticalDepth)));}
 fragColor=vec4(color*alpha,alpha);
}
