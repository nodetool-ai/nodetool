#include "nodetool/realtime/dsp.h"
int main(void) {
    const nt_dsp_config config = {48000, 128, 2, 1, 0};
    const nt_dsp_kernel* kernel = nt_dsp_builtin("gain");
    return !kernel || kernel->abi != NT_DSP_ABI || kernel->state_size(&config) == 0 ||
        kernel->params != 1 || nt_dsp_builtin("missing") != 0 || nt_dsp_builtin_name(1000) != 0;
}
