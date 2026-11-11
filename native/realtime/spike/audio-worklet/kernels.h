#ifndef NT_SPIKE_KERNELS_H
#define NT_SPIKE_KERNELS_H

enum { NT_FRAMES = 128, NT_CHANNELS = 2, NT_SAMPLES = 256 };

/* Owned by the caller and accessed only on its render thread. */
typedef struct {
  float input[NT_SAMPLES];
  float other[NT_SAMPLES];
  float output[NT_SAMPLES];
  float state[NT_CHANNELS][2];
} NtSpike;

void nt_process(NtSpike *context);

#endif
