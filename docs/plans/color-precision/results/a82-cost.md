# A82: FP16 cost

## Budgets fixed before measurement

- D1: Discrete GPU, completed eight-pass 3840×2160 work: FP16 minus RGBA8
  at most +2 ms median and +3 ms p95.
- D2: Software server completion: FP16 at most 20% slower at median and p95,
  and at most +250 ms p95. Completion includes encoding and queue completion,
  excludes upload and readback. Cold start and transfers are reported separately.
- D3: Representative API latency during rendering: at most +5 ms p95 versus
  idle and no additional errors. Event-loop delay is an allowed diagnostic
  substitute, but cannot satisfy the API gate.
- D4: Twenty create/render/dispose cycles per format after warmup: zero live
  tracked textures/buffers after disposal and no persistent upward RSS trend
  larger than 64 MiB from the first five to the last five cycles. Driver GPU
  memory must be reported as unavailable if no trustworthy counter exists.
- D5: Native uses the committed budgets in native/timeline/budgets:
  60 Hz (16.667 ms frame interval), CPU p95 2 ms for baseline and 8 ms for
  effects/zero-copy. Completed wall frame time is a separate measurement from
  CPU recording. Compare FP16 overhead with D1 as an additional trial budget.

Reject and repeat a route run if its starting one-minute load exceeds 6
(half the machine's 12 logical CPUs), or available RAM is below 8 GiB.
Record load and available memory before every sample as well. Use
LP_NUM_THREADS=4 for lavapipe. No builds or other agent work during measurement.
Five warmups per format, then twenty samples per format in alternating order.
Use nearest-rank p95 and the mean of the two central values for median.
The driver shader cache is not cleared, so cold means process/device/context
cold, not a cold OS or driver cache.

Results pending. No production code changes are authorized.
