// Shared setup: 512 stereo frames of LCG noise, 8 identical RBJ low-pass biquads (1 kHz, Q 0.7071, 44.1 kHz).
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#define FRAMES 512
#define NB 8
#define BLOCKS 22000
#define WARMUP 2000
static void fill_input(float *in) {
  uint32_t s = 12345u;
  for (int i = 0; i < FRAMES * 2; i++) { s = s * 1664525u + 1013904223u; in[i] = (float)((double)(s >> 8) / 8388608.0 - 1.0); }
}
static void fill_coefs(float *c) {
  double w0 = 2.0 * M_PI * 1000.0 / 44100.0, alpha = sin(w0) / (2.0 * 0.7071), cw = cos(w0), a0 = 1.0 + alpha;
  for (int k = 0; k < NB; k++) {
    c[k*5+0] = (float)(((1.0 - cw) / 2.0) / a0); c[k*5+1] = (float)((1.0 - cw) / a0); c[k*5+2] = c[k*5+0];
    c[k*5+3] = (float)((-2.0 * cw) / a0); c[k*5+4] = (float)((1.0 - alpha) / a0);
  }
}
static double now_us(void) { return (double)clock_gettime_nsec_np(CLOCK_UPTIME_RAW) / 1e3; }
#define MIXN 1024
#define MIXES 16
static int cmp(const void *a, const void *b) { double x = *(const double*)a, y = *(const double*)b; return x < y ? -1 : x > y; }
static void report(const char *name, double *d, int n, double checksum, double per) {
  double sum = 0; for (int i = 0; i < n; i++) sum += d[i];
  qsort(d, n, sizeof(double), cmp);
  printf("%-16s mean %9.2f us  p50 %9.2f  p99 %9.2f  max %9.2f  ns/sample %7.3f  checksum %.6f\n",
         name, sum / n, d[n/2], d[(int)(n*0.99)], d[n-1], (sum / n) * 1000.0 / per, checksum);
}
