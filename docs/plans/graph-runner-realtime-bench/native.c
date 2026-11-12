#include "common.h"
__attribute__((noinline)) static void process(float *buf, int frames, int nb, const float *coef, float *state) {
  for (int ch = 0; ch < 2; ch++) for (int k = 0; k < nb; k++) {
    const float *c = coef + k * 5; float b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4];
    float *s = state + (ch * nb + k) * 2; float z1 = s[0], z2 = s[1];
    float *p = buf + ch, *end = p + frames * 2;
    for (; p < end; p += 2) { float x = *p, y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; *p = y; }
    s[0] = z1; s[1] = z2;
  }
}
__attribute__((noinline)) static void mix(float *restrict dst, const float *restrict a, const float *restrict b, int n, float ga, float gb) {
  for (int i = 0; i < n; i++) dst[i] = a[i] * ga + b[i] * gb;
}
int main(int argc, char **argv) {
  const char *tag = argc > 1 ? argv[1] : "native";
  static float in[FRAMES*2], buf[FRAMES*2], coef[NB*5], state[2*NB*2]; static double d[BLOCKS];
  fill_input(in); fill_coefs(coef);
  for (int b = 0; b < BLOCKS; b++) { double t0 = now_us(); memcpy(buf, in, sizeof in); process(buf, FRAMES, NB, coef, state); d[b] = now_us() - t0; }
  double cs = 0; for (int i = 0; i < FRAMES*2; i++) cs += buf[i];
  char name[64]; snprintf(name, sizeof name, "%s biquad", tag);
  report(name, d + WARMUP, BLOCKS - WARMUP, cs, FRAMES * 2 * NB);
  static float ma[MIXN], mb[MIXN], md[MIXN]; for (int i = 0; i < MIXN; i++) { ma[i] = in[i]; mb[i] = in[MIXN - 1 - i]; }
  for (int b = 0; b < BLOCKS; b++) { double t0 = now_us(); for (int m = 0; m < MIXES; m++) mix(md, ma, mb, MIXN, 0.7f, 0.3f); d[b] = now_us() - t0; }
  cs = 0; for (int i = 0; i < MIXN; i++) cs += md[i];
  snprintf(name, sizeof name, "%s mix", tag); report(name, d + WARMUP, BLOCKS - WARMUP, cs, MIXN * MIXES); return 0;
}
