// Adapted from three@0.185.1 SMAAShader.js (SMAA 1x Medium).
// Three MIT and upstream SMAA notices in native/game/licenses.
#version 440
layout(std140,binding=0) uniform Params { mat4 clipCorrection; vec4 metrics; vec4 p0; vec4 p1; vec4 p2; vec4 weights[22]; };
#define resolution metrics.xy
layout(location=0) out vec4 outColor;
vec4 sampleRT(sampler2D tex,vec2 coord){return texture(tex,vec2(coord.x,metrics.z>0.5?coord.y:1.0-coord.y));}
vec4 sampleRT(sampler2D tex,vec2 coord,float bias){return texture(tex,vec2(coord.x,metrics.z>0.5?coord.y:1.0-coord.y),bias);}


		layout(binding=1) uniform sampler2D tDiffuse;
		layout(binding=2) uniform sampler2D tColor;
		

		layout(location=0) in vec2 vUv;
		layout(location=1) in vec4 vOffset[ 2 ];

		vec4 SMAANeighborhoodBlendingPS( vec2 texcoord, vec4 offset[ 2 ], sampler2D colorTex, sampler2D blendTex ) {
			// Fetch the blending weights for current pixel:
			vec4 a;
			a.xz = sampleRT( blendTex, texcoord ).xz;
			a.y = sampleRT( blendTex, offset[ 1 ].zw ).g;
			a.w = sampleRT( blendTex, offset[ 1 ].xy ).a;

			// Is there any blending weight with a value greater than 0.0?
			if ( dot(a, vec4( 1.0, 1.0, 1.0, 1.0 )) < 1e-5 ) {
				return sampleRT( colorTex, texcoord, 0.0 );
			} else {
				// Up to 4 lines can be crossing a pixel (one through each edge). We
				// favor blending by choosing the line with the maximum weight for each
				// direction:
				vec2 offset;
				offset.x = a.a > a.b ? a.a : -a.b; // left vs. right
				offset.y = a.g > a.r ? -a.g : a.r; // top vs. bottom // WebGL port note: Changed signs

				// Then we go in the direction that has the maximum weight:
				if ( abs( offset.x ) > abs( offset.y )) { // horizontal vs. vertical
					offset.y = 0.0;
				} else {
					offset.x = 0.0;
				}

				// Fetch the opposite color and lerp by hand:
				vec4 C = sampleRT( colorTex, texcoord, 0.0 );
				texcoord += sign( offset ) * resolution;
				vec4 Cop = sampleRT( colorTex, texcoord, 0.0 );
				float s = abs( offset.x ) > abs( offset.y ) ? abs( offset.x ) : abs( offset.y );

				// WebGL port note: Added gamma correction
				C.xyz = pow(C.xyz, vec3(2.2));
				Cop.xyz = pow(Cop.xyz, vec3(2.2));
				vec4 mixed = mix(C, Cop, s);
				mixed.xyz = pow(mixed.xyz, vec3(1.0 / 2.2));

				return mixed;
			}
		}

		void main() {

			outColor = SMAANeighborhoodBlendingPS( vUv, vOffset, tColor, tDiffuse );

		}