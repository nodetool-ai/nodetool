// Adapted from three@0.185.1 SMAAShader.js (SMAA 1x Medium).
// Three MIT and upstream SMAA notices in native/game/licenses.
#version 440
layout(std140,binding=0) uniform Params { mat4 clipCorrection; vec4 metrics; vec4 p0; vec4 p1; vec4 p2; vec4 weights[22]; };
#define resolution metrics.xy
#define SMAA_THRESHOLD 0.1
layout(location=0) in vec3 position; layout(location=1) in vec2 uv;


		

		layout(location=0) out vec2 vUv;
		layout(location=1) out vec4 vOffset[ 3 ];

		void SMAAEdgeDetectionVS( vec2 texcoord ) {
			vOffset[ 0 ] = texcoord.xyxy + resolution.xyxy * vec4( -1.0, 0.0, 0.0,  1.0 ); // WebGL port note: Changed sign in W component
			vOffset[ 1 ] = texcoord.xyxy + resolution.xyxy * vec4(  1.0, 0.0, 0.0, -1.0 ); // WebGL port note: Changed sign in W component
			vOffset[ 2 ] = texcoord.xyxy + resolution.xyxy * vec4( -2.0, 0.0, 0.0,  2.0 ); // WebGL port note: Changed sign in W component
		}

		void main() {

			vUv = uv;

			SMAAEdgeDetectionVS( vUv );

			gl_Position = clipCorrection * vec4( position, 1.0 );

		}