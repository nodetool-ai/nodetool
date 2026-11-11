#include "common.h"
#include <wasm.h>
#include <wasmtime.h>
static void die(const char *m, wasmtime_error_t *e, wasm_trap_t *t) {
  wasm_byte_vec_t msg; if (e) wasmtime_error_message(e, &msg); else if (t) wasm_trap_message(t, &msg); else { fprintf(stderr, "%s\n", m); exit(1); }
  fprintf(stderr, "%s: %.*s\n", m, (int)msg.size, msg.data); exit(1);
}
int main(int argc, char **argv) {
  FILE *f = fopen(argv[1], "rb"); if (!f) die("open wat", 0, 0);
  static char wat[65536]; size_t n = fread(wat, 1, sizeof wat, f); fclose(f);
  wasm_engine_t *engine = wasm_engine_new();
  wasmtime_store_t *store = wasmtime_store_new(engine, NULL, NULL);
  wasmtime_context_t *cx = wasmtime_store_context(store);
  wasm_byte_vec_t wasm; wasmtime_error_t *err = wasmtime_wat2wasm(wat, n, &wasm); if (err) die("wat2wasm", err, 0);
  if (argc > 2) { FILE *o = fopen(argv[2], "wb"); fwrite(wasm.data, 1, wasm.size, o); fclose(o); }
  wasmtime_module_t *module = NULL; err = wasmtime_module_new(engine, (uint8_t*)wasm.data, wasm.size, &module); if (err) die("module", err, 0);
  wasmtime_instance_t inst; wasm_trap_t *trap = NULL;
  err = wasmtime_instance_new(cx, module, NULL, 0, &inst, &trap); if (err || trap) die("instance", err, trap);
  wasmtime_extern_t fn, mem;
  if (!wasmtime_instance_export_get(cx, &inst, "process", 7, &fn) || !wasmtime_instance_export_get(cx, &inst, "memory", 6, &mem)) die("exports", 0, 0);
  uint8_t *base = wasmtime_memory_data(cx, &mem.of.memory);
  const int BUF = 0, COEF = 8192, STATE = 9216;
  static float in[FRAMES*2]; static double d[BLOCKS]; fill_input(in); fill_coefs((float*)(base + COEF)); memset(base + STATE, 0, 2*NB*2*4);
  wasmtime_val_t a[5]; for (int i = 0; i < 5; i++) a[i].kind = WASMTIME_I32;
  a[0].of.i32 = BUF; a[1].of.i32 = FRAMES; a[2].of.i32 = NB; a[3].of.i32 = COEF; a[4].of.i32 = STATE;
  for (int b = 0; b < BLOCKS; b++) {
    double t0 = now_us(); memcpy(base + BUF, in, sizeof in);
    err = wasmtime_func_call(cx, &fn.of.func, a, 5, NULL, 0, &trap); if (err || trap) die("call", err, trap);
    d[b] = now_us() - t0;
  }
  double cs = 0; for (int i = 0; i < FRAMES*2; i++) cs += ((float*)(base + BUF))[i];
  report("wasmtime biquad", d + WARMUP, BLOCKS - WARMUP, cs, FRAMES * 2 * NB);
  const int MD = 16384, MA = 20480, MB = 24576; float *ma = (float*)(base + MA), *mb = (float*)(base + MB);
  for (int i = 0; i < MIXN; i++) { ma[i] = in[i]; mb[i] = in[MIXN - 1 - i]; }
  const char *names[2] = {"mix", "mix_simd"};
  for (int v = 0; v < 2; v++) {
    wasmtime_extern_t mf; if (!wasmtime_instance_export_get(cx, &inst, names[v], strlen(names[v]), &mf)) die("mix export", 0, 0);
    wasmtime_val_t m[6]; for (int i = 0; i < 4; i++) m[i].kind = WASMTIME_I32; m[4].kind = WASMTIME_F32; m[5].kind = WASMTIME_F32;
    m[0].of.i32 = MD; m[1].of.i32 = MA; m[2].of.i32 = MB; m[3].of.i32 = MIXN; m[4].of.f32 = 0.7f; m[5].of.f32 = 0.3f;
    for (int b = 0; b < BLOCKS; b++) {
      double t0 = now_us();
      for (int k = 0; k < MIXES; k++) { err = wasmtime_func_call(cx, &mf.of.func, m, 6, NULL, 0, &trap); if (err || trap) die("mix", err, trap); }
      d[b] = now_us() - t0;
    }
    cs = 0; for (int i = 0; i < MIXN; i++) cs += ((float*)(base + MD))[i];
    char name[64]; snprintf(name, sizeof name, "wasmtime %s", names[v]); report(name, d + WARMUP, BLOCKS - WARMUP, cs, MIXN * MIXES);
  }
  // Call overhead: an empty call (0 frames, 0 biquads).
  a[1].of.i32 = 0; a[2].of.i32 = 0; double t0 = now_us();
  for (int i = 0; i < 1000000; i++) { err = wasmtime_func_call(cx, &fn.of.func, a, 5, NULL, 0, &trap); if (err || trap) die("call", err, trap); }
  printf("wasmtime empty call: %.1f ns\n", (now_us() - t0) * 1000.0 / 1e6);
  return 0;
}
