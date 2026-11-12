#include "kernels.h"

/* RT-N6: compile this source without fast math or FMA contraction on both hosts. */
void nt_process(NtSpike *context) {
  for (int channel = 0; channel < NT_CHANNELS; ++channel) {
    float z1 = context->state[channel][0];
    float z2 = context->state[channel][1];
    for (int frame = 0; frame < NT_FRAMES; ++frame) {
      const int index = frame * NT_CHANNELS + channel;
      const float input = context->input[index];
      const float filtered = 0.0046039983f * input + z1;
      z1 = 0.0092079965f * input + 1.7990964f * filtered + z2;
      z2 = 0.0046039983f * input - 0.8175124f * filtered;
      context->output[index] = filtered * 0.7f + context->other[index] * 0.3f;
    }
    /* RT-R13: source-level state clearing agrees with WebAssembly. */
    context->state[channel][0] = (z1 < 1e-30f && z1 > -1e-30f) ? 0.0f : z1;
    context->state[channel][1] = (z2 < 1e-30f && z2 > -1e-30f) ? 0.0f : z2;
  }
}

#ifdef __wasm__
/* The linker reserves the stack below this caller-owned arena. */
extern unsigned char __heap_base;
NtSpike *nt_context(void) { return (NtSpike *)&__heap_base; }
#endif
