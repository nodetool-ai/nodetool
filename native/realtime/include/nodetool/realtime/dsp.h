#ifndef NT_REALTIME_DSP_H
#define NT_REALTIME_DSP_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

#define NT_DSP_ABI 1u
#define NT_DSP_STATE_ALIGNMENT 16u
enum nt_dsp_event_type { NT_DSP_RESET = 1, NT_DSP_START = 2, NT_DSP_STOP = 3, NT_DSP_SEEK = 4 };
/* Borrowed for one process call. Equal offsets retain caller order. */
typedef struct nt_dsp_event { uint32_t offset; uint32_t type; double value; } nt_dsp_event;
/* Immutable prepare-time config. All ports use channels (mono or stereo). */
typedef struct nt_dsp_config {
    uint32_t sample_rate;
    uint32_t quantum;
    uint32_t channels;
    uint32_t seed;
    uint32_t delay_frames;
} nt_dsp_config;
typedef struct nt_dsp_meter { float peak[2]; float rms[2]; } nt_dsp_meter;
/* Pointers are borrowed from host-owned storage, never retained by a kernel.
 * Planar lanes are [port * channels + channel], each with frames samples.
 * All pointer regions live in the same linear memory in a future Wasm build.
 * Args/config/state layout uses the target's pointer width, not a wire format. */
typedef struct nt_dsp_args {
    const float* const* in;
    float* const* out;
    const float* param_begin;
    const float* param_end;
    const nt_dsp_event* events;
    uint32_t event_count;
    uint32_t frames;
    uint64_t stream_frame;
    const float* const* sample;
    uint64_t sample_frames;
    nt_dsp_meter* meter;
    /* Optional per-param arrays of frames values, overriding endpoint ramps. */
    const float* const* param_samples;
} nt_dsp_args;
/* The host owns one cleared, 16-byte-aligned block per node. State contains
 * no owning pointers. init is prepare/reset only; process never allocates. */
typedef struct nt_dsp_kernel {
    uint32_t abi;
    uint32_t state_version;
    uint32_t inputs;
    uint32_t outputs;
    uint32_t params;
    uint32_t event_mask;
    uint32_t (*state_size)(const nt_dsp_config*);
    void (*init)(void*, const nt_dsp_config*);
    void (*process)(void*, const nt_dsp_args*);
} nt_dsp_kernel;
/* Returns a borrowed immutable descriptor, or NULL for an unknown name. */
const nt_dsp_kernel* nt_dsp_builtin(const char* name);
const char* nt_dsp_builtin_name(uint32_t index);
#ifdef __cplusplus
}
#endif
#endif
