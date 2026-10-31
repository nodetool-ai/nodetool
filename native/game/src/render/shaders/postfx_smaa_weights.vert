// Adapted from three@0.185.1 SMAAShader.js (SMAA 1x Medium).
// Three MIT and upstream SMAA notices in native/game/licenses.
#version 440
layout(std140,binding=0) uniform Params { mat4 clipCorrection; vec4 metrics; vec4 p0; vec4 p1; vec4 p2; vec4 weights[22]; };
#define resolution metrics.xy
#define SMAA_MAX_SEARCH_STEPS 8
#define SMAA_AREATEX_MAX_DISTANCE 16
#define SMAA_AREATEX_PIXEL_SIZE ( 1.0 / vec2( 160.0, 560.0 ) )
#define SMAA_AREATEX_SUBTEX_SIZE ( 1.0 / 7.0 )
layout(location=0) in vec3 position; layout(location=1) in vec2 uv;


		

		layout(location=0) out vec2 vUv;
		layout(location=1) out vec4 vOffset[ 3 ];
		layout(location=4) out vec2 vPixcoord;

		void SMAABlendingWeightCalculationVS( vec2 texcoord ) {
			vPixcoord = texcoord / resolution;

			// We will use these offsets for the searches later on (see @PSEUDO_GATHER4):
			vOffset[ 0 ] = texcoord.xyxy + resolution.xyxy * vec4( -0.25, 0.125, 1.25, 0.125 ); // WebGL port note: Changed sign in Y and W components
			vOffset[ 1 ] = texcoord.xyxy + resolution.xyxy * vec4( -0.125, 0.25, -0.125, -1.25 ); // WebGL port note: Changed sign in Y and W components

			// And these for the searches, they indicate the ends of the loops:
			vOffset[ 2 ] = vec4( vOffset[ 0 ].xz, vOffset[ 1 ].yw ) + vec4( -2.0, 2.0, -2.0, 2.0 ) * resolution.xxyy * float( SMAA_MAX_SEARCH_STEPS );

		}

		void main() {

			vUv = uv;

			SMAABlendingWeightCalculationVS( vUv );

			gl_Position = clipCorrection * vec4( position, 1.0 );

		}