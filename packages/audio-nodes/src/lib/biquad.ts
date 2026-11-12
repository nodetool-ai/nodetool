/**
 * The default Q of the streaming biquad filters (StreamingLowPass,
 * StreamingHighPass, VCF): a Butterworth response for the RBJ lowpass and
 * highpass. The filters themselves run in @nodetool-ai/kernels.
 */
export const DEFAULT_Q = Math.SQRT1_2;
