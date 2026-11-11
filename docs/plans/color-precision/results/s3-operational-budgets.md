# A49 server operational measurements

The S3 exit gate is **not met on deployed lavapipe**. The production compose
declares a 4 GiB, two-CPU budget per app replica. Several measured batches
exceed 4 GiB process RSS even in the focused API host. The unrestricted host
throughput is not throughput under the replica's two-CPU quota. These runs
also use host Mesa, not the production image. A50's owner must resolve the
resource budget and choose concurrency before release.
A49 remains open for browser interactive qualification and real constrained
hardware. The interactive deadline and seek targets belong to A93.

The clearest contention finding is four concurrent 4K RGBA8 jobs on host
lavapipe: the event loop stalled for 5502.93 ms and a real HTTP request took
5480.45 ms. That batch then hit the system-memory floor and was terminated.
Rendering in the API process can starve it for seconds. Its HTTP median was
only 1.21 ms and p95 was 53.77 ms, so those two percentiles alone hide the
worst pause. This is an interrupted measurement, not a completed batch.
No server redesign was attempted.

Two concurrent 4K FP16 jobs also starved the API before their memory stop:
HTTP p50 was 1099.09 ms and p95 was 1320.16 ms, versus 0.95 / 1.60 ms idle.
Event-loop p95 was 1241.51 ms and maximum delay was 1408.24 ms.
This is sustained contention in the observed portion of the run, not just
one cold-start outlier. The measurement was interrupted at 32 frames per job.

The one completed 4K FP16 lavapipe render took 201.60 seconds at 1.49 FPS,
with 3975.01 MiB peak RSS. Reading its cgroup `memory.peak` once per second
during the latter part of the run observed 4091.16 MiB, less than 5 MiB below
the declared replica ceiling. This is cgroup memory, separate from RSS.
The focused process lacks the full API host, so this does not provide usable
production headroom. The scope observation is retained in the raw evidence.

The owner-decision stop was taken after discovering the external deployment
limits and finishing that active render. Additional 4K FP16 repetitions and
the planned LP=2 timing repetitions were not run. The completed 4K FP16
lavapipe time is one sample, not a three-run range. Unsafe configurations and
the full production host under its two-CPU quota remain unqualified.

## Workload and measurement boundary

The retained [probe](../../../../packages/video-nodes/tests/a49-operational-probe.mjs)
renders a ten-second, 30 fps motion-graphics sequence to H.264 MP4 through the
real Node/Dawn compositor and in-process libav encoder. Each completed job
contains 300 frames at 1920×1080 or 3840×2160. Three stacked tracks contain a
background, transformed translucent panels, radius-6 blur, seeded grain, and
a two-second overlapping crossfade. This is a synthetic motion-graphics
workload, not camera footage or a decode-heavy timeline. There is no proxy,
frame sampling, mock encoder or ffmpeg/ffprobe subprocess.

Every measurement starts a fresh process. Total time includes cold GPU and
encoder acquisition, rendering and encoder finish, but excludes imports and
the five-second idle HTTP baseline. FPS is aggregate completed frames divided
by batch wall time. At concurrency four, four ten-second jobs produce 1200
frames. Individual completion times are retained in the raw evidence.

The production Fastify health plugin serves real GET `/api/health` requests
on an OS-assigned loopback port in the same process as rendering. Port 7777
is never used. This focused server hosts the actual production route, not
the complete application startup, auth middleware, database workload or
deployment proxy. It measures render contention with a cheap real HTTP API
route, not end-to-end production API latency.

The [external observer](../../../../packages/video-nodes/tests/_fixtures/a49-monitor.py)
offers a request every 50 ms, with at most four outstanding requests and a
30-second timeout. It checks HTTP 200 and the version payload. That limit can
reduce offered load during long stalls. Each row reports per-run percentile
ranges, not pooled percentiles. Node's event-loop histogram uses 10 ms
resolution, so an idle reading near 10 ms is its sampling interval. HTTP
latency and event-loop delay are different measurements.
Long pauses can occupy only a small fraction of histogram samples. A low
event-loop p95 therefore does not cancel out a large HTTP tail or loop maximum.

RSS is Linux process maxRSS in MiB. The observer also samples `/proc` RSS and
thread count every 50 ms. CPU is process user plus system CPU time divided by
render wall time, with 100% meaning one logical CPU. It includes driver and
codec CPU work, but is not GPU utilization. Thread names identify observed
groups, not a complete attribution of every native thread to its owner.

## Host, safeguards and deployment difference

This host has an AMD Ryzen 5 3600, six physical cores and twelve logical CPUs,
about 31.2 GiB RAM, and an NVIDIA GeForce RTX 3060 with driver 610.57.04.
Other agents build on the machine. Every result records the one-minute load
range and all three load averages at start and finish. Results apply only
to this machine under that load. Fresh processes do not clear OS or shader
disk caches.

Every render runs under `systemd-run --user --scope -p MemoryMax=10G`.
The observer initially waited for 5 GiB available. After memory-pressure
stops it waited for 10 GiB, then used 8 GiB to reserve 3 GiB above the floor
before launch. It terminates the measurement if availability falls below
5 GiB. A safety stop is not successful
completion, a renderer cancellation test, or proof of a production limit.
The 10 GiB scope is an experiment safety ceiling, not a proposed per-job
production allowance. TMPDIR is `/home/mg/Projects/nodetool-film/tmp`.
Generated render outputs are removed after measurement.

The [production Dockerfile](../../../../Dockerfile) installs
`mesa-vulkan-drivers` from bookworm-backports and system Chromium. Its comment
explains that bookworm Mesa 22.3 is rejected by Dawn for missing Vulkan
`shaderUniform*ArrayDynamicIndexing`, while Mesa 25.0 satisfies the requirement.
The package is selected from backports, not pinned to an exact version.
The [amd64 package index](https://deb.debian.org/debian/dists/bookworm-backports/main/binary-amd64/Packages.xz)
offers `25.0.7-2~bpo12+1` with LLVM 15. This host reports
`26.2.5-arch1.1 (LLVM 23.1.3)`. The candidate version is not evidence of what
an already-published image actually contains.

Docker is installed, but `docker info` fails with permission denied on its
socket. `sudo -n docker info` requires a password. No image was pulled or
built. The worktree filesystem had about 23 GiB free, above the requested
15 GiB reserve. Exact published-image and deployed-image package versions
remain unverified.

Neither [docker-compose.yml](../../../../docker-compose.yml) nor the
[production deployment guide](../../../docker-production-deploy.md) supplies
a replica memory limit directly. The separate deployment repository does:
[compose.yaml at 50265fa](https://github.com/nodetool-ai/nodetool-deploy/blob/50265fa7855aa3e2f4fd6940e2ec2ae958875ccc/compose.yaml#L23)
sets `cpus: 2` and `mem_limit: 4g` for both app replicas.
Its [setup guide](https://github.com/nodetool-ai/nodetool-deploy/blob/50265fa7855aa3e2f4fd6940e2ec2ae958875ccc/docs/setup.md#L28)
identifies these as two CPUs and 4 GiB per app and warns that the limits do
not reserve memory. These files and the deployment README were read through
the GitHub API. Running container overrides were not inspected.

Use 4096 MiB as the most generous whole-replica memory ceiling, including
the API and all concurrent renders. It is not a per-render allowance.
The focused health-plugin process omits the rest of the full API host, so
being just below that ceiling is not evidence that the production process
fits. RSS is a capacity screen, not an exact cgroup-charge or OOM prediction.
The separate 10 GiB experimental scope must not be mistaken for this budget.
The earlier
[A42 report](s3-server-export.md#a42-server-qualification-checkpoint) incorrectly
described the deployed adapter as absent: lavapipe is present, but the host's
Mesa build differs from the image candidate. The same-adapter browser parity
limit in [A43.2](s3-parity.md) still applies.

## Reproduction

### Budget disposition and concurrency recommendation

Recommend `NODETOOL_TIMELINE_RENDER_CONCURRENCY=1` for the owner to consider
in A50. This is a recommendation, not a changed default. The existing unset
value remains unlimited. One job limits the simultaneous encoder and frame
allocations and avoids the observed 147/245-thread lavapipe batches. Four
1080p FP16 jobs produced little additional aggregate throughput over two,
while increasing memory and threads. The 4K contention attempts exposed
multi-second API stalls and memory-floor stops. Even cap 1 is not a guarantee
that 4K FP16 meets a deployment API budget under memory pressure.

No per-job production memory allowance is invented. The declared 4 GiB
replica ceiling must cover the full API and every render. `MemoryMax=10G` and
the available-memory floor bound the experiment, not the service. Peak RSS from
a fresh ten-second render does not establish leak freedom in a long-lived
replica. A42 supplies separate repeated-abort and lifetime evidence.

No server completion or API-latency budget was agreed before these runs.
The plan's A82 explicitly calls for setting those budgets before measurement.
These results therefore establish costs and failure observations, not a
retrospective latency pass. The owner must resolve whether rendering must fit
the declared 4 GiB / two-CPU replica or whether that deployment budget changes,
specify acceptable completion/API latency, choose the cap, and qualify the
actual image against them before A50. Do not turn these
machine-specific times into test assertions.

Safety-stopped configurations were not repeatedly forced through the memory
floor. Their incomplete rows remain gaps. Stopping under external pressure
does not prove a renderer leak or that production would OOM. It does mean
these runs cannot certify completion at that configuration.

### Driver and process threads

The [device-only probe](../../../../packages/video-nodes/tests/_fixtures/a49-device-threads.mjs)
starts at seven Node threads before acquiring a GPU device. On lavapipe it
reaches thirteen with `LP_NUM_THREADS=2`, including two named llvmpipe workers,
and thirty-three with the variable unset, including twelve named llvmpipe
workers. Both measurements used twelve logical CPUs and load 7.26. RTX reaches
twelve threads, with three named Vulkan helper threads, at load 7.16.
These are threads added during Dawn/device initialization, not threads from
video encoding. They do not establish ownership of every generically named
thread inside Dawn or Mesa.

During full renders, default-thread lavapipe reaches 98, 147 and 245 process
threads at caps 1, 2 and 4. RTX reaches 77, 126 and 224. The observed increase
is 49 threads per additional admitted render on this host. It is an
observation, not a portable thread-count contract. `LP_NUM_THREADS` controls
the llvmpipe worker count, not V8, codecs, other native pools, or every thread
added during Dawn initialization.

No production setting was adjusted. Restricting llvmpipe threads reduces CPU
use but can substantially reduce completion throughput. A process CPU quota
also affects the API and codec work. Neither is a substitute for measuring
the configured render cap on the deployed host.

The clean LP=2 timing control completed 300 1080p RGBA8 frames in 112.02 s
(2.68 FPS), with 2309.68 MiB RSS, 78 threads and 274.96% CPU. Its load range
was 7.55–11.62 on twelve logical CPUs. The default-thread matrix completed
the same workload in 41.18–43.23 s, at 609.48–638.94% CPU and load
10.57–13.31. This LP=2 control is one clean timing sample and does not qualify
a new production thread setting. An earlier LP=2 result overlapped an
exploratory smoke process and is excluded from this comparison.

### Commands

Source `/home/mg/Projects/nodetool-film/bin/ntenv`. Unset DISPLAY. For lavapipe,
set both `VK_ICD_FILENAMES` and `VK_DRIVER_FILES` to
`/usr/share/vulkan/icd.d/lvp_icd.json`. For RTX, source
`/home/mg/.local/nvidia-610/env.sh` after ntenv. Set the desired
`NODETOOL_TIMELINE_RENDER_CONCURRENCY` and either unset `LP_NUM_THREADS` or
set it to 2 as labelled. From the worktree root:

```bash
python3 packages/video-nodes/tests/_fixtures/a49-monitor.py "$TMPDIR/a49-run.json" \
  systemd-run --user --scope -p MemoryMax=10G \
  node --import tsx packages/video-nodes/tests/a49-operational-probe.mjs \
  "$TMPDIR/a49-run.json" 1080 rgba16float 1
```

Use a new report name for every process. Height 2160 selects 4K. The final
argument must match the configured concurrency. Append `cancel` and set
`A49_DURATION_MS=1000` for the separate 30-frame cancellation diagnostic.
That diagnostic aborts job zero after ten encoded frames and admits an extra
queued job. It asserts partial-file removal and that the replacement makes
progress while another job is still active. Other jobs must finish with
nonempty files and no render diagnostics.

## Verification scope

### Constrained CPU approximation

Three fresh RTX 3060 processes rendered the ten-second 1080p FP16 sequence
at cap 1 under `CPUQuota=200%` and `MemoryMax=10G`. The effective cgroup
values were `cpu.max=200000 100000` and `memory.max=10737418240`.
They completed in 10.76–12.10 seconds, or 24.79–27.89 FPS, with
1439.84–1525.28 MiB peak RSS, 67 threads and 197.72–198.10% CPU.
The host still had six physical / twelve logical CPUs. Observed one-minute
load was 6.34–8.53. HTTP idle p50/p95 were 0.72–0.76 / 1.11–1.19 ms.
During rendering they were 7.68–10.31 / 67.12–75.30 ms.

This is a CPU-bandwidth and memory-ceiling approximation on the same RTX
machine. It does not reproduce a constrained GPU, memory bandwidth, thermals,
or a small physical machine, and does not close the constrained-hardware
part of A49. A CPU quota also does not constrain the process to two threads.

### Checks

An initial observer version lost its summary if `/proc` disappeared between
reads. It now handles that process-exit race. A metadata check initially
expected `cpu.max` in every scope. Unthrottled scopes can omit that file,
so the probe now records that no scope CPU quota is configured. Measurements
that failed before rendering because of this check were rerun. Neither
instrumentation failure is treated as a renderer failure.

The standalone probes assert full frame count, completion, no diagnostics,
nonempty output, and cancellation cleanup. An invalid format deliberately
fails with `ERR_ASSERTION`, exit 1. JavaScript syntax, Python compilation and
the video-nodes package source typecheck pass. No production code changed.
Default RGBA8, FP16 opt-in, BT.709, renderer selection and concurrency defaults
are unchanged. Frame hashes were not rerun because no rendering code changed.

Not run, as requested: `test:affected`, root typecheck, root lint,
`harness gate`, `/verify`, full suites or unrelated test files. No push,
rebase, branch switch or PR was performed.

<!-- A49_MEASUREMENTS -->

## Workload measurements

All rows use six physical cores / twelve logical CPUs. Lavapipe uses unset
`LP_NUM_THREADS`. RTX uses 2 or unset, neither of which controls the NVIDIA driver.
Ranges are the minimum and maximum of independent fresh-process runs.
The completion column is successful batches / attempted batches. Stopped
batches do not contribute to completion FPS, CPU or time ranges.

| Adapter | Workload | Format | Cap | Complete | FPS | Total seconds | Peak RSS MiB | Peak threads | CPU % | Load range |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| RTX 3060 | 1080p | FP16 | 1 | 3/3 | 62.29–71.50 | 4.2–4.8 | 1442.3–1486.9 | 77 | 444.9–475.1 | 6.92–9.32 |
| RTX 3060 | 1080p | FP16 | 2 | 3/3 | 69.56–87.65 | 6.8–8.6 | 2099.6–2170.8 | 126 | 507.8–574.0 | 7.25–9.06 |
| RTX 3060 | 1080p | FP16 | 4 | 3/3 | 98.83–103.47 | 11.6–12.1 | 3304.1–3512.4 | 224 | 651.5–676.9 | 8.68–13.41 |
| RTX 3060 | 1080p | RGBA8 | 1 | 3/3 | 39.72–68.32 | 4.4–7.6 | 1446.3–1655.0 | 77 | 337.8–449.2 | 6.46–10.92 |
| RTX 3060 | 1080p | RGBA8 | 2 | 3/3 | 82.72–86.51 | 6.9–7.3 | 2154.9–2182.2 | 126 | 553.4–565.1 | 7.04–8.54 |
| RTX 3060 | 1080p | RGBA8 | 4 | 3/3 | 102.64–106.62 | 11.3–11.7 | 3262.1–3301.9 | 224 | 655.1–686.5 | 7.09–9.97 |
| RTX 3060 | 4K | FP16 | 1 | 3/3 | 13.90–19.10 | 15.7–21.6 | 3084.6–3138.5 | 77 | 445.0–554.1 | 6.59–13.92 |
| RTX 3060 | 4K | FP16 | 2 | 3/3 | 27.13–28.47 | 21.1–22.1 | 5292.4–5396.3 | 126 | 648.9–675.0 | 8.92–11.63 |
| RTX 3060 | 4K | FP16 | 4 | 0/1 | — | — | — | — | — | 8.10–8.63 |
| RTX 3060 | 4K | RGBA8 | 1 | 3/3 | 17.47–20.67 | 14.5–17.2 | 3030.6–3118.8 | 77 | 537.7–573.3 | 6.61–10.25 |
| RTX 3060 | 4K | RGBA8 | 2 | 3/3 | 27.32–30.04 | 20.0–22.0 | 5372.9–5553.2 | 126 | 654.0–709.1 | 6.26–12.26 |
| RTX 3060 | 4K | RGBA8 | 4 | 0/1 | — | — | — | — | — | 7.94–9.23 |
| lavapipe 26.2.5 | 1080p | FP16 | 1 | 3/3 | 3.45–6.26 | 47.9–86.9 | 2435.4–2489.2 | 98 | 430.7–695.3 | 5.18–17.40 |
| lavapipe 26.2.5 | 1080p | FP16 | 2 | 3/3 | 6.50–6.93 | 86.6–92.2 | 3096.4–3259.0 | 147 | 729.2–775.1 | 10.58–16.40 |
| lavapipe 26.2.5 | 1080p | FP16 | 4 | 3/3 | 6.76–7.04 | 170.5–177.4 | 4215.6–4267.7 | 245 | 760.3–789.7 | 5.09–16.98 |
| lavapipe 26.2.5 | 1080p | RGBA8 | 1 | 3/3 | 6.94–7.28 | 41.2–43.2 | 2304.5–2348.6 | 98 | 609.5–638.9 | 10.57–13.31 |
| lavapipe 26.2.5 | 1080p | RGBA8 | 2 | 3/3 | 8.79–9.05 | 66.3–68.2 | 2463.4–3067.9 | 147 | 760.5–774.4 | 11.71–16.43 |
| lavapipe 26.2.5 | 1080p | RGBA8 | 4 | 0/1 | — | — | — | — | — | 12.96–15.08 |
| lavapipe 26.2.5 | 4K | FP16 | 1 | 1/2 | 1.49 | 201.6 | 3975.0 | 98 | 686.7 | 7.38–17.55 |
| lavapipe 26.2.5 | 4K | FP16 | 2 | 0/1 | — | — | — | — | — | 12.92–15.10 |
| lavapipe 26.2.5 | 4K | FP16 | 4 | 0/1 | — | — | — | — | — | 15.08 at launch |
| lavapipe 26.2.5 | 4K | RGBA8 | 1 | 3/3 | 2.19–2.32 | 129.5–136.9 | 3384.7–3481.6 | 98 | 764.4–802.8 | 12.22–16.90 |
| lavapipe 26.2.5 | 4K | RGBA8 | 2 | 0/1 | — | — | — | — | — | 12.80–17.30 |
| lavapipe 26.2.5 | 4K | RGBA8 | 4 | 0/1 | — | — | — | — | — | 13.80–17.21 |

## HTTP contention

These are milliseconds. Only completed batches appear here. Each baseline
runs before GPU acquisition in that same fresh process. The raw evidence
also retains request counts, errors and interrupted-run latency.

| Adapter | Workload | Format | Cap | Idle p50 | Idle p95 | Render p50 | Render p95 | Render max | Loop p95 | Loop max |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| RTX 3060 | 1080p | FP16 | 1 | 0.8–0.8 | 1.2–1.5 | 1.3–2.1 | 17.8–53.6 | 353.2–380.9 | 16.4–19.5 | 42.5–405.0 |
| RTX 3060 | 1080p | FP16 | 2 | 0.8–0.9 | 1.3–2.3 | 3.2–3.5 | 18.1–25.6 | 393.9–446.2 | 16.6–17.2 | 63.0–442.2 |
| RTX 3060 | 1080p | FP16 | 4 | 0.7–0.8 | 1.1–1.5 | 6.5–7.6 | 20.9–25.9 | 568.3–585.4 | 18.1–19.0 | 70.1–602.4 |
| RTX 3060 | 1080p | RGBA8 | 1 | 0.7–0.8 | 1.1–1.3 | 1.5–1.7 | 22.6–157.1 | 361.0–532.2 | 14.3–20.4 | 56.4–360.4 |
| RTX 3060 | 1080p | RGBA8 | 2 | 0.7–0.8 | 1.2–1.3 | 3.0–3.4 | 17.0–42.8 | 386.7–421.2 | 15.9–18.0 | 54.3–416.5 |
| RTX 3060 | 1080p | RGBA8 | 4 | 0.8–0.8 | 1.1–1.3 | 7.2–8.8 | 21.7–22.6 | 526.1–568.9 | 18.4–19.4 | 65.8–529.5 |
| RTX 3060 | 4K | FP16 | 1 | 0.7–0.8 | 1.1–1.5 | 2.2–3.3 | 23.6–35.3 | 476.6–1947.3 | 22.2–32.5 | 104.3–128.9 |
| RTX 3060 | 4K | FP16 | 2 | 0.7–0.8 | 1.0–1.4 | 8.2–8.6 | 39.1–43.7 | 894.6–1632.3 | 28.8–31.5 | 107.8–148.8 |
| RTX 3060 | 4K | RGBA8 | 1 | 0.7–0.8 | 1.1–1.5 | 1.6–2.0 | 19.9–22.4 | 488.3–505.8 | 18.9–20.9 | 101.3–500.4 |
| RTX 3060 | 4K | RGBA8 | 2 | 0.6–0.8 | 0.8–1.2 | 6.0–6.4 | 34.9–45.1 | 653.1–705.9 | 24.1–28.0 | 116.7–743.4 |
| lavapipe 26.2.5 | 1080p | FP16 | 1 | 0.8–0.8 | 1.2–1.3 | 1.1–1.3 | 24.7–42.3 | 912.8–1408.0 | 11.3–12.1 | 957.3–1195.4 |
| lavapipe 26.2.5 | 1080p | FP16 | 2 | 0.7–0.8 | 1.2–1.5 | 1.1–1.2 | 127.8–141.4 | 707.8–847.2 | 11.8–12.2 | 620.8–865.1 |
| lavapipe 26.2.5 | 1080p | FP16 | 4 | 0.7–0.7 | 1.0–1.2 | 1.2–1.2 | 99.7–104.6 | 1262.4–1280.4 | 12.1–12.1 | 441.2–1270.9 |
| lavapipe 26.2.5 | 1080p | RGBA8 | 1 | 0.7–0.8 | 1.0–1.7 | 1.0–1.1 | 51.3–85.7 | 953.5–993.5 | 11.1–11.6 | 964.2–1031.8 |
| lavapipe 26.2.5 | 1080p | RGBA8 | 2 | 0.7–0.8 | 1.1–1.5 | 1.1–1.1 | 89.9–103.6 | 575.9–929.0 | 11.7–11.8 | 309.9–956.3 |
| lavapipe 26.2.5 | 4K | FP16 | 1 | 0.8 | 1.2 | 1.2 | 262.8 | 1282.9 | 13.0 | 1016.6 |
| lavapipe 26.2.5 | 4K | RGBA8 | 1 | 0.7–0.8 | 1.3–1.8 | 1.1–1.1 | 52.5–53.3 | 879.0–1036.9 | 11.7–12.2 | 237.5–410.3 |

## Interrupted matrix measurements

These are safety stops, not successful renders. RSS and progress are last
observations and may be below the final peak. Connection resets caused by
terminating the process are not renderer-originated HTTP failures.
The row stopped before rendering names the requested ICD. It has no
per-render adapter result. The separate device probe verified that ICD.

| Adapter | Workload | Format | Cap | Exit | Memory floor | Observed RSS MiB | Threads | Frames per job |
|---|---|---|---:|---:|---|---:|---:|---|
| RTX 3060 | 4K | FP16 | 4 | -15 | True | 8348.6 | 224 | [39, 37, 40, 37] |
| RTX 3060 | 4K | RGBA8 | 4 | -15 | True | 7500.5 | 224 | [31, 30, 30, 32] |
| lavapipe 26.2.5 | 1080p | RGBA8 | 4 | -15 | True | 3633.0 | 245 | [92, 92, 92, 92] |
| lavapipe 26.2.5 | 4K | FP16 | 1 | -15 | True | 2248.9 | 98 | [13] |
| lavapipe 26.2.5 | 4K | FP16 | 2 | -15 | True | 5470.4 | 147 | [32, 32] |
| lavapipe 26.2.5 | 4K | FP16 | 4 | -15 | True | — | — | before render |
| lavapipe 26.2.5 | 4K | RGBA8 | 2 | -15 | True | 5549.8 | 147 | [98, 98] |
| lavapipe 26.2.5 | 4K | RGBA8 | 4 | -15 | True | 5914.0 | 245 | [20, 19, 20, 20] |

## Cancellation at configured maximum

Each row names a separate 1080p, 30-frame diagnostic. The first job aborts
after ten frames. Successful cases assert cleanup and slot reuse while
another job is active. Timing is abort request to rejection after cleanup.

| Adapter | Format | Cap | LP threads | Passed / attempted | Cleanup ms | Load range |
|---|---|---:|---|---:|---:|---:|
| RTX 3060 | rgba16float | 2 | 2 | 1/1 | 180.5 | 13.00 |
| RTX 3060 | rgba16float | 4 | unset | 3/3 | 103.6–174.2 | 6.95–8.56 |
| RTX 3060 | rgba8unorm | 2 | 2 | 1/1 | 144.2 | 13.13–13.76 |
| RTX 3060 | rgba8unorm | 4 | unset | 3/3 | 126.3–134.4 | 9.48–11.17 |
| lavapipe 26.2.5 | rgba16float | 2 | 2 | 1/1 | 1070.0 | 7.42–8.45 |
| lavapipe 26.2.5 | rgba16float | 4 | unset | 3/3 | 780.2–1194.8 | 12.28–17.70 |
| lavapipe 26.2.5 | rgba8unorm | 2 | 2 | 1/1 | 893.0 | 8.84–9.26 |
| lavapipe 26.2.5 | rgba8unorm | 4 | unset | 3/3 | 619.5–769.8 | 11.48–15.59 |

Raw per-process measurements, adapter strings, load averages, individual
completion times, thread-name samples and HTTP counts are retained in
[s3-operational-measurements.json](s3-operational-measurements.json).
