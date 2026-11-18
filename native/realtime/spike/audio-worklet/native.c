#include "kernels.h"
#include <stdio.h>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

int main(void) {
#ifdef _WIN32
  if (_setmode(_fileno(stdin), _O_BINARY) == -1 ||
      _setmode(_fileno(stdout), _O_BINARY) == -1) { return 1; }
#endif
  NtSpike context = {0};
  for (;;) {
    const size_t count = fread(context.input, sizeof(float), NT_SAMPLES, stdin);
    if (count == 0 && feof(stdin)) { return 0; }
    if (count != NT_SAMPLES ||
        fread(context.other, sizeof(float), NT_SAMPLES, stdin) != NT_SAMPLES) {
      return 1;
    }
    nt_process(&context);
    if (fwrite(context.output, sizeof(float), NT_SAMPLES, stdout) != NT_SAMPLES) {
      return 1;
    }
  }
}
