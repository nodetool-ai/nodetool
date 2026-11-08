# Graph runner async host: threading evidence

This page collects the library evidence that
[graph-runner-async-host.md](graph-runner-async-host.md) sections 4.8 and 4.9
and rollout step 5 require before a host is converted. It cites library
documentation, library source code and maintainer statements on official
channels. It contains no stress-test results. No code was run.

Each answer is labeled by how well it is supported.

- **Stated** means a document or source comment says it directly.
- **Source** means the library's own code does it, with no sentence promising it.
- **Inferred** means I drew the conclusion from the sources. The sources do not say it.
- **Unknown** means I found no authoritative source.

Mailing-list posts on `ffmpeg.org` and `freedesktop.org` are official channels
but the authors are not always maintainers. The text says who wrote each one.

## 1. Installed versions

Read with `pkg-config --modversion` and `pacman -Q` on this machine.

| Library | Version | Source tag used for citations |
|---|---|---|
| libvips | 8.18.7 | `v8.18.7` in github.com/libvips/libvips |
| FFmpeg (libavcodec, libavformat) | 9.0.2 (63.1.102) | `n9.0.2` in github.com/FFmpeg/FFmpeg |
| libavfilter, libswscale, libswresample | 12.1.102, 10.1.102, 7.1.102 | `n9.0.2` |
| libcurl | 8.23.0 (OpenSSL 3.6.5, threaded resolver, `threadsafe` feature) | `curl-8_23_0` in github.com/curl/curl |
| cairo | 1.18.6 | `1.18.6` in gitlab.freedesktop.org/cairo/cairo |
| pango and pangocairo | 1.58.2 | `1.58.2` in gitlab.gnome.org/GNOME/pango |
| fontconfig, freetype, glib | 2.18.3, 2.15.0, 2.90.1 | not read |
| stb_image_write | v1.16 at commit `d14d46f6` (pinned in `cmake/host-image-gpu.cmake`) | same commit in github.com/nothings/stb |

The libcurl build has no c-ares in its dynamic link list (`ldd`) and
`curl -V` reports `AsynchDNS`, so name resolution uses the threaded resolver.
That is an inference from `ldd` output. I did not inspect the build options.

## 2. How the hosts use the libraries today

These facts come from the host sources and bound every answer below.

- Images (`src/host/image_vips.cpp`). One call opens, transforms, evaluates
  (`write_to_buffer`, `write_to_memory`) and destroys the `VImage` graph.
  The only global setup is `vips_init` and `vips_cache_set_max(0)` inside a
  `std::call_once` (lines 17 to 23). The code never calls `vips_image_set_kill`
  or `vips_concurrency_set`.
- Media (`src/host/media.cpp`). Persistent `Input` objects hold an
  `AVFormatContext` and `AVCodecContext`. `Filter` holds an `AVFilterGraph`
  and `Encoder` holds a format, codec and graph. The code never calls
  libswscale or libswresample directly, so any `SwsContext` or `SwrContext` is
  created inside the `scale` or audio filters. Codecs and graphs are set to one
  thread (`media.cpp:179`, `254`, `415`, `474`). The only interrupt callback is on
  the input format (`media.cpp:145`). Output files are opened with
  `avio_open` and no callback (`media.cpp:514`, `614`).
- Track staging (`src/host/sandbox_av_tracks.cpp`). Same pattern with an input
  interrupt callback at line 201 and `avio_open` for output at line 258.
- HTTP (`src/host/http.cpp`). Each hop creates, uses and cleans up one easy
  handle inside `fetch` (lines 162 to 197). `curl_global_init` runs in a
  function-local static at line 157. The code sets `CURLOPT_NOSIGNAL` but no
  progress callback.
- Canvas (`src/host/canvas.cpp`). Each `Fonts` object owns one
  `pango_cairo_font_map_new()` and one `FcConfigCreate()` (lines 30 to 46).
  `pixels()` calls `cairo_surface_flush` and copies the surface into a
  `std::vector` (lines 335 to 353). PNG encoding is a separate function.
- PNG encoding (`src/host/image.cpp:74` to `101`). It uses
  `stbi_write_png_to_func` from stb_image_write, with a lambda that appends to
  a local `std::vector`.
- Files and assets (`src/host/files.cpp`, `assets.cpp`, `paths.cpp`). They call
  `open`, `fstat`, `lstat`, `opendir`/`readdir`, `mkdir`, `mkdtemp`, `rename`,
  `unlink` and `realpath`. They never call `chdir`, `umask`, `getcwd`,
  `setenv` or `strerror`. A search of `native/graph-runner/src` for `chdir`,
  `umask`, `fchdir`, `setenv`, `putenv`, `current_path` and `getcwd` found no match.

## 3. libvips (8.18.7)

### Q1.1 Is `vips_image_set_kill(image, TRUE)` safe from another thread?

**Answer: unknown.** The source shows no synchronization at all.

- The flag is a plain `int`. `/usr/include/vips/image.h:230`:
  `int kill; /* set to non-zero to block eval */`.
- The setter is an unsynchronized store.
  [`libvips/iofuncs/image.c:1704-1714`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/iofuncs/image.c#L1704)
  (`image->kill = kill;` plus a copy to `progress_signal->kill`). Its doc
  comment says only "Set the kill flag on an image. Handy for stopping sets of
  threads." (lines 1693 to 1701). The comment gives no thread contract.
- The checker `vips_image_iskilled` (lines 1650 to 1689) reads `image->kill`
  and `image->progress_signal->kill` with no atomics. Its doc says "Handy for
  loops which need to run sets of threads which can fail."
- `doc/using-threads.md` has no section on `kill`.
  [`doc/using-threads.md`](https://github.com/libvips/libvips/blob/v8.18.7/doc/using-threads.md).

Inference: the intended use is a signal handler or another thread telling a
running evaluation to stop. The docs say "stopping sets of threads". The code
has no data-race protection, so on the C11 and C++11 memory model this is a
data race. In practice an aligned `int` store is atomic on the supported
platforms. Nothing in the project's documented contract says so.

**Consequence: needs a maintainer answer.** Keep the hook disabled, as section
4.9 says.

### Q1.2 Does evaluation observe the kill promptly?

**Answer: no, not reliably.** Three source facts limit it.

1. The flag is cleared when evaluation starts, so a kill that arrives before
   the sink begins is lost.
   [`iofuncs/sink.c:359-362`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/iofuncs/sink.c#L359)
   (`/* Always clear kill before we start looping. */ vips_image_set_kill(image, FALSE);`).
   The same happens in `vips_image_write_line` (`image.c:3228-3231`).
2. The sink checks it only on a thread-pool tick, on the thread that called
   the sink. [`sink.c:428-441`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/iofuncs/sink.c#L428)
   (`vips_sink_base_progress` calls `vips_image_iskilled(sink_base->im)` and
   returns -1). [`threadpool.c:663-672`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/iofuncs/threadpool.c#L663)
   shows the loop waits on `pool->tick`, then calls `progress(pool->a)`. A tick
   comes from a worker that finished a work unit, so delay is bounded by the
   slowest tile, not by wall time.
3. Only the image the sink evaluates is checked, plus its `progress_signal`
   image. `progress_signal` is set only by `vips_image_set_progress` or by
   loaders (`foreign.c:1038`, `load->real->progress_signal = load->out`) and
   then propagates downstream (`generate.c:132-134`). For a savers path the
   sunk image is a derived `save->ready` (`foreign.c:1838`), so a kill set on the
   `VImage` the host holds may not reach the image that is being evaluated
   (inferred, I did not trace each saver).

**Consequence: keep synchronous, or accept late finish.** Section 4.9 already
accepts this fallback ("native evaluation may finish late, while mailbox
closure still prevents access to the departed run"). The evidence supports
that wording.

### Q1.3 Cleanup semantics after a kill

**Answer: stated in source.** When `vips_image_iskilled` returns true it sets a
libvips error ("killed for image ...") and clears the kill flag
(`image.c:1681-1686`: "We've picked up the kill message, it's now our caller's
responsibility to pass the message up the chain."). The sink returns -1, the
thread pool sets `pool->error`, waits for all workers
(`threadpool.c:683-690`, "This will block until the last worker completes.")
and frees the pool. So a kill does not abandon workers. It returns after
workers finish their current work unit. The `VImage` wrapper then throws
`vips::VError` from the global error buffer. The result is a normal error
return, with nothing left half-evaluated.

**Consequence:** if the hook were enabled, destruction after a kill would be
the normal destruction path. This answer does not resolve Q1.1.

### Q1.4 Create a pipeline on one thread, evaluate, unref or destroy on another?

**Answer: yes for evaluate and read (stated). Unknown for unref and destroy.**

- Stated. [`doc/using-threads.md`](https://github.com/libvips/libvips/blob/v8.18.7/doc/using-threads.md),
  section "Images": "On startup, you need to call [func@INIT] single-threaded.
  After that, you can freely create images in any thread and read them in any
  other thread." The same page, section "Using Region between threads": "Image
  objects are immutable and can be shared between threads very simply."
- Stated exception. The same section says a `VipsRegion` "keeps a lot of state
  in per-thread storage" and cannot move between threads without
  `vips__region_no_ownership()` and `vips__region_take_ownership()`. The host
  code never holds a region across calls.
- Stated exception. Drawing operators modify their argument and cannot be
  called concurrently on one image. The host does not call them.
- Not stated. The page says "create" and "read". It never says "unref" or
  "destroy" on a thread other than the creator.
- Source. Buffer caches are thread-private only for libvips's own worker
  threads. [`iofuncs/buffer.c:313-326`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/iofuncs/buffer.c#L313)
  ("Get our private VipsBufferThread. NULL for non-worker threads."). Host
  pool threads are not libvips threads, so they use the shared path (inferred
  from that comment, I did not read the shared path).

Inference: because the host evaluates inside one call and every region is
freed by the thread pool before the call returns, destruction on another thread
is probably safe. The documentation does not promise it.

**Consequence: convert with a restriction.** Keep the whole create, evaluate
and destroy sequence inside one worker call (as `image_vips.cpp` does today).
Do not hold a `VImage` across worker jobs or release it on a different thread.
That uses only what the page states.

### Q1.5 What does `vips_concurrency_set` do, is it process-global, is it safe after init?

**Answer: process-global (stated by code). Safe while others evaluate: no
(unsynchronized), and the host does not need it.**

- Doc. [`iofuncs/thread.c:191-206`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/iofuncs/thread.c#L191)
  ("Sets the number of worker threads that vips should use when running
  [func@threadpool_run]. The special value 0 means \"default\"").
- Code. `vips__concurrency = concurrency;` (`thread.c:218`), a plain global
  `int` (`thread.c:66`) with no lock. It is read when a pool is created
  (`threadpool.c:507`, `pool->max_workers = vips_concurrency_get();`).
  A later change affects only pools created afterward, by inference.
- A per-image override exists. `threadpool.c:528`
  (`pool->max_workers = vips_image_get_concurrency(im, pool->max_workers);`)
  reads the image's `concurrency` metadata (`header.c:940-952`, values 1 to 99).
  That would allow a per-job limit without touching the global (inferred, I did
  not test setting it through the C++ API).

**Consequence:** libvips already runs its own worker threads, so a host pool
thread that calls into libvips fans out again. Set the limit once, before any
pool thread starts, or use the per-image `concurrency` metadata. Never call
`vips_concurrency_set` while jobs run.

### Q1.6 Are operations on separate images from multiple threads safe (init, operation cache)?

**Answer: yes after a single-threaded `vips_init` (stated).**

- Stated. `using-threads.md` ("Generally, libvips is threaded and thread-safe,
  with a few exceptions.") with the example "runs many resize in parallel from
  many threads."
- Stated. `vips_init` must be called single-threaded (same page).
- Source. `vips_init` guards re-entry with plain `static gboolean started`
  and `done` (`iofuncs/init.c:460-478`) and is not thread-safe if two threads
  race on first call. The host wraps it in `std::call_once` (`image_vips.cpp:17`),
  which is safe only if no other thread is already inside libvips. Calling it
  before any pool thread starts follows the documentation exactly.
- Source. The operation cache has a global mutex (`iofuncs/cache.c:106`,
  `static GMutex vips_cache_lock;`) and is locked in lookup and trim paths.
  `vips_cache_set_max(0)` writes a plain int and calls `vips_cache_trim()`
  (`cache.c:1153-1157`). The host does that once inside `init()`.
- Stated. Errors go to "a single global error buffer shared by all threads"
  (`using-threads.md`, section "Error handling"). The doc says "when you detect
  an error return you can't be sure that what's in the error buffer is the
  message that matches your error."

**Consequence: convert with a restriction.** Call `init()` once during
single-threaded startup (not lazily from the first pool job). Treat the text
of `VError` messages as unreliable when two image jobs fail at once. The
failure still surfaces as an error. Only the message text may be swapped
(inferred from the shared buffer statement).

## 4. FFmpeg (libavformat, libavcodec, libavfilter, 9.0.2)

### Q2.1 May a context be created on one thread, used, then freed on another, with no concurrent access?

**Answer: yes for `AVFormatContext`, `AVCodecContext`, `AVFilterGraph`.
Stated: no official FFmpeg document. Supported by FFmpeg's own `ffmpeg` tool
and by two mailing-list posts. Unknown for `SwsContext` as a direct object (the
host never creates one).**

Official text. The headers and `doc/` contain no general thread-safety
contract for these contexts. I searched `avformat.h`, `avcodec.h`, `avfilter.h`
and `doc/multithreading.txt` in `n9.0.2`. The only global-state sentence is on
`avformat_network_init`
([`avformat.h`, installed copy `/usr/include/libavformat/avformat.h:1978-1990`](https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavformat/avformat.h)):
"This functions only exists to work around thread-safety issues with older
GnuTLS or OpenSSL libraries ... you need to call this function before any
other threads using them are started."

Maintainer-style statements on the official libav-user list.

- wm4, an FFmpeg contributor, 18 Aug 2014
  ([libav-user 007293](https://ffmpeg.org/pipermail/libav-user/2014-August/007293.html)):
  "All functions that are specific to a certain context (like AVCodecContext)
  are by default not thread-safe. Of course using different contexts at the
  same time from different threads should be perfectly fine." and "FFmpeg (not
  Libav) doesn't require this [lock manager] anymore, if you have compiled
  ffmpeg with threading."
- A user, Jake Eastwood, 18 Aug 2022
  ([libav-user 013146](https://ffmpeg.org/pipermail/libav-user/2022-August/013146.html)):
  "we successfully created stream context from one thread and read packets
  from separated threadpool. It looks like nothing depends on specific
  thread." This is an experience report, not a maintainer statement.

FFmpeg's own `ffmpeg` command line tool, n9.0.2. This is source evidence of
the pattern the plan wants, not a stated guarantee.

| Object | Created or opened | Used | Freed |
|---|---|---|---|
| Demuxer `AVFormatContext` | main thread, `ffmpeg_demux.c:2168` (`avformat_open_input`) | demux thread, `ffmpeg_demux.c:743`, `767` (`input_thread`, `av_read_frame`) | main thread, `ffmpeg_demux.c:925-944` (`ifile_close`), called from `ffmpeg.c:332` |
| Decoder `AVCodecContext` | main thread, `ffmpeg_dec.c:1600` (`dec_open`, reached from `dec_init` at line 1667 before the scheduler starts) | decoder thread (`avcodec_send_packet`, `ffmpeg_dec.c:719`) | main thread, `ffmpeg.c:334-335` (`dec_free`) |
| Encoder `AVCodecContext` | encoder thread, `ffmpeg_enc.c:338` (`avcodec_open2` inside `enc_open`, called from `encoder_thread` at line 868) | encoder thread | main thread, `ffmpeg_mux.c:810` (`enc_free`) |
| Muxer `AVFormatContext` | main thread (`ffmpeg_mux_init.c:3350`) | mux thread (`avformat_write_header`, `ffmpeg_mux.c:557`, `av_write_trailer`, line 765) | main thread, `ffmpeg_mux.c:851` |
| `AVFilterGraph` | filter thread | filter thread | same thread, `ffmpeg_filter.c:3250` (`fg_thread_uninit`) |

Inference. FFmpeg's CLI moves format and codec contexts across threads with
hand-off at thread start and join, which matches the plan's "no concurrent
access" condition. The CLI never moves a filter graph across threads, so
`AVFilterGraph` has only the weaker evidence (contexts are not
thread-affine in the mailing-list posts).

**Consequence: convert with a restriction.** One session owns each context
and runs one job at a time, as section 4.9's serial executor describes. Keep
every context on that discipline, including `AVFilterGraph`. The evidence is
indirect, so the plan's rule "tests cannot establish a library's threading
contract" still holds, and this row needs a maintainer answer if the project
wants a stated guarantee. Ask on ffmpeg-devel or libav-user.

### Q2.2 Global locks and initialization for concurrent use of separate contexts?

**Answer: no host-side initialization is required. Stated and source.**

- Source. No lock manager exists in `n9.0.2`. A search of the installed headers
  for `av_lockmgr` and `avcodec_register` found nothing.
- Source. Codec init that is not thread-safe is serialized inside the library.
  [`libavcodec/avcodec.c:100-112`](https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavcodec/avcodec.c#L100)
  (`static AVMutex codec_mutex`, taken in `lock_avcodec` when the codec has
  `FF_CODEC_CAP_NOT_INIT_THREADSAFE`). The flag is described in
  `libavcodec/codec_internal.h:32-35` ("calling the codec's init function
  needs to be guarded with a lock").
- Source. `av_log` takes a mutex (`libavutil/log.c:49`, `398`). The header
  says a custom log callback "must be thread safe" (`/usr/include/libavutil/log.h:330`).
  The host installs no log callback (search of `media.cpp` found none).
- Stated. `avformat_network_init` is optional and needed only for old TLS
  libraries (header text above). `media.cpp` restricts `protocol_whitelist` to
  `file` (line 156), so no network library is used. The host never calls
  `avformat_network_init`.
- Source. `avfilter_get_by_name` iterates a static read-only table
  (`libavfilter/allfilters.c:652-665`), so it holds no lazy init state.
- Stated. `AVBuffer` reference counting is thread-safe
  (`/usr/include/libavutil/buffer.h:62-63`), so frames and packets may be
  unreferenced on any thread.

**Consequence: convert.** No process-wide setup step is needed.

### Q2.3 What are the semantics of `AVIOInterruptCB`?

**Answer: stated, and narrower than the plan assumes.**

- Stated. [`avio.h:49-62`](https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavformat/avio.h#L49)
  (installed copy): "During blocking operations, callback is called with
  opaque as parameter. If the callback returns 1, the blocking operation will
  be aborted." `AVERROR_EXIT` is the result.
- Stated. `AVFormatContext.interrupt_callback` doc: "demuxing: set by the user
  before avformat_open_input(). muxing: set by the user before
  avformat_write_header() ... The callback should also be passed to avio_open2()
  if it's used to open the file." (`avformat.h:1582-1590`).
- Source. The callback runs on the thread that is inside the library call.
  `ff_check_interrupt` simply invokes `cb->callback(cb->opaque)`
  (`libavformat/avio.c:860-864`). So the flag it reads must be an atomic that
  another thread can set. The FFmpeg tool itself reads a `volatile` counter
  (`fftools/ffmpeg.c:307-312`), which is not an atomic guarantee.
- Source. Call sites are few. A search of `avio.c`, `demux.c`, `network.c`,
  `mux.c`, `file.c` and `seek.c` found `ff_check_interrupt` at
  `avio.c:520` (top of each `retry_transfer_wrapper` iteration, which wraps
  every `avio_read` and `avio_write` retry loop), `demux.c:2719` (each iteration
  of the `avformat_find_stream_info` loop) and in `network.c` wait loops
  (lines 84, 105, 166, 273, 386). `file.c` has no check.
- Inference from the sites above. A single blocking `read()` on a local file
  is not interrupted. The callback fires between reads. Decoding, filtering and
  encoding are CPU work and never check it. It cannot stop a long
  `avcodec_send_packet` or `av_buffersink_get_frame` call.
- Source. The host sets the callback on inputs only. Output
  `avio_open(&pb, path, AVIO_FLAG_WRITE)` passes no callback
  (`media.cpp:514`, `614`, `sandbox_av_tracks.cpp:258`), so output writes are not
  interruptible. Writes go to local files.

**Consequence: convert with a restriction.** Use an atomic read in the
callback. Add token checks between packets and frames, as section 4.9 already
requires. Do not claim bounded stop time inside one codec or filter call.

### Q2.4 Which functions used in `media.cpp` are documented as not thread-safe?

**Answer: none documented individually. Unknown whether any exist.**

I found no per-function "not thread-safe" annotation in the `n9.0.2` headers
for the functions in the list in section 2. The only general statement is the
2014 wm4 post above: functions specific to a context are "by default not
thread-safe", which means they must not run concurrently on the same context.
That is the one-job-at-a-time rule.

`media.cpp` also uses `av_dict_*`, `av_strdup` and `av_channel_layout_*`. These
work on caller-owned data, so the same per-object rule applies (inferred).

**Consequence:** no extra restriction beyond Q2.1.

## 5. libcurl (8.23.0)

### Q3.1 May an easy handle be used from a thread other than the one that created it?

**Answer: yes (stated).**
[`docs/libcurl/libcurl-thread.md`](https://github.com/curl/curl/blob/curl-8_23_0/docs/libcurl/libcurl-thread.md),
section "Handles": "You must **never** share the same handle in multiple
threads. You can pass the handles around among threads, but you must never use
a single handle from more than one thread at any given time."

The page opens with "libcurl is thread-safe but has no internal thread
synchronization." Section "TLS" says "All current TLS libraries libcurl
supports are thread-safe", with an OpenSSL note that cleanup may leak in
rare static-link cases.

**Consequence: convert.** The host already creates, uses and frees each handle
inside one `fetch` call.

### Q3.2 Does returning non-zero from `CURLOPT_XFERINFOFUNCTION` abort promptly, including during DNS and connect?

**Answer: it aborts, but not during DNS or connect. No.**

- Stated. [`CURLOPT_XFERINFOFUNCTION.md`](https://github.com/curl/curl/blob/curl-8_23_0/docs/libcurl/opts/CURLOPT_XFERINFOFUNCTION.md):
  "Return 1 from this callback to make libcurl abort the transfer and return
  CURLE_ABORTED_BY_CALLBACK." and "While data is being transferred it gets
  called frequently, and during slow periods like when nothing is being
  transferred it can slow down to about one call per second." Also
  `CURLOPT_NOPROGRESS` must be 0 (default is 1).
- Source. The call is gated on the connection being up.
  [`lib/multi.c:2401-2403`](https://github.com/curl/curl/blob/curl-8_23_0/lib/multi.c#L2401):
  `/* if there is still a connection to use, call the progress function */`
  `else if(data->conn && Curl_conn_is_connected(data->conn, FIRSTSOCKET)) {`
  `result = Curl_pgrsUpdateX(data, pnow);`. A search of every `lib/*.c` file for
  `Curl_pgrsUpdate` and `Curl_pgrsCheck` found callers only in `multi.c`,
  `transfer.c:418`, `progress.c` and protocol files (FTP, TFTP, FILE, Telnet,
  RTSP, pingpong, HTTP/1 proxy). None is in the resolve or TCP connect code.
- Inference from those sites. While the threaded resolver runs `getaddrinfo`
  or the socket connect waits, the progress callback is not invoked, so a
  non-zero return cannot abort those phases. The transfer ends only at
  `CURLOPT_CONNECTTIMEOUT` (15 s in `http.cpp:172`) or `CURLOPT_TIMEOUT` (120 s).
  I did not test this.
- Source. `curl_easy_perform` loops on `curl_multi_poll(multi, NULL, 0, 1000, NULL)`
  (`lib/easy.c:726`), so wake-ups come at least every second.
- Stated alternative. `curl_multi_wakeup` "can be called from any thread"
  ([`curl_multi_wakeup.md`](https://github.com/curl/curl/blob/curl-8_23_0/docs/libcurl/curl_multi_wakeup.md))
  but it only wakes a poll and does not cancel a transfer. Cancellation would
  also need the multi interface, which the host does not use.

**Consequence: convert with a restriction.** A progress callback can stop an
active download within about a second. It cannot stop DNS or connect, which
the existing timeouts bound at 15 s. Section 4.9's rule that late native
completion is acceptable already covers this. Document the 15 s bound.

### Q3.3 Is `curl_global_init` required before threads start, and does `http.cpp` do it?

**Answer: not required on this build, and `http.cpp` does it.**

- Stated. `libcurl-thread.md`, section "curl_global_* functions": "These
  functions are thread-safe since libcurl 7.84.0 if curl_version_info(3) has
  the CURL_VERSION_THREADSAFE feature bit set (most platforms)." If not,
  "it is especially important that before use you call curl_global_init".
  `curl-config --features` on this machine lists `threadsafe`.
- Source. `http.cpp:157` runs
  `static const bool initialized = curl_global_init(CURL_GLOBAL_DEFAULT) == CURLE_OK;`
  inside `fetch`. C++11 makes the static initialization thread-safe, and
  curl's own call is thread-safe on this build.
- Stated. `CURLOPT_NOSIGNAL` should be 1 in threaded programs. The page says
  setting 0 "does not work in a threaded situation". `http.cpp:171` sets it.
  The page also says without c-ares or the threaded resolver "timeouts cannot
  be honored during DNS lookups". This build uses the threaded resolver
  (inferred from `ldd`), so it does not apply.

**Consequence: convert.** For portability to builds without the `threadsafe`
bit, move `curl_global_init` to startup. That is a hardening step.

## 6. Canvas (cairo 1.18.6, pango 1.58.2, stb_image_write)

### Q4.1 Is drawing on a cairo image surface on one thread while another thread encodes a copy of its pixels safe?

**Answer: yes if the copy is complete before drawing resumes (inferred from
a maintainer rule). Cairo has no written thread-safety contract in its manual
or source.**

- Searched. `cairo.c`, `cairo-surface.c` and `cairo-image-surface.c` in 1.18.6
  contain no thread-safety section. The only matching docs are mailing-list
  posts and one FreeType note.
- Maintainer statement. Carl Worth (cairo lead), quoted by Behdad Esfahbod
  on the cairo list, 23 Feb 2009
  ([list post](https://lists.freedesktop.org/archives/cairo/2009-February/016655.html)):
  "things should work as long as you don't cause multiple threads to access a
  single cairo object simultaneously without your own locks. If each of your
  threads have independent cairo objects, then things should work, (cairo does
  have some shared data like font caches, and it does its own locking for
  these)." Behdad adds that `cairo_font_face_t` and `cairo_scaled_font_t` "do
  their own locking."
- Source. Reference counts are atomic
  (`src/cairo-reference-count-private.h:47-53` use `_cairo_atomic_int_*`,
  built on C11 `atomic_int` at `cairo-atomic-private.h:52-62`) and the library
  uses `pthread_mutex_t` for its caches (`cairo-mutex-impl-private.h:198-206`).
  The 1.18.6 `NEWS` records the font fixes (lines 1402 to 1409, 1441).
- Stated. `cairo_image_surface_get_data` doc: "A call to cairo_surface_flush()
  is required before accessing the pixel data" (`cairo-image-surface.c:573`).
  `canvas.cpp:336` already flushes before the copy.

The encode step touches only the `std::vector` copy and stb. It never touches
cairo. So the question reduces to whether the copy happens on the thread that
owns the surface, with no draw in flight. The plan's design (snapshot pixels
at submission) does exactly that.

**Consequence: convert the encode, keep drawing and `pixels()` synchronous.**
Snapshot on the owning thread, then encode the snapshot on the CPU lane.
Per Worth's rule, never draw into one surface from two threads. That matches
section 5.4 ("Retain ... canvas drawing, canvas toBuffer ... synchronous").

### Q4.2 Is the pango font map thread-safe?

**Answer: no for sharing one font map. Yes for separate font maps, by
inference. Stated only for the default font map.**

- Stated. [`pango/pangocairo-fontmap.c:166-168`](https://gitlab.gnome.org/GNOME/pango/-/blob/1.58.2/pango/pangocairo-fontmap.c#L166)
  ("Note that since Pango 1.32.6, the default fontmap is per-thread. Each
  thread gets its own default fontmap. In this way, PangoCairo can be used
  safely from multiple threads."). The code backs it with a `GPrivate`
  (line 149). The host does not use the default font map. It creates its own
  (`canvas.cpp:31`).
- Source. A search of `pangofc-fontmap.c`, `pango-context.c`,
  `pangocairo-context.c` and `pangofc-font.c` found mutexes only around
  fontconfig initialization and the fontconfig worker queue (`fc_init_mutex`
  at line 120, `pats->mutex` at line 822). The fontset and font caches have no
  lock.
- Inference. A `PangoFcFontMap` and the contexts and layouts derived from it
  are therefore single-owner objects. Two threads laying out text through one
  `fonts->map` would race on those caches. Each canvas `Fonts` object is
  already private to one canvas context, which gives one owner (inferred from
  `canvas.cpp:30-46`).
- Source, a side effect. Each `PangoFcFontMap` starts its own background
  thread, `[pango] fontconfig` (`pangofc-fontmap.c:1527-1545`). That thread
  runs `FcInit`, and sorts and matches patterns against the font map's
  `FcConfig` (`init_in_thread`, `match_in_thread`, `sort_in_thread`, lines
  911 to 990). The host also calls `FcConfigAppFontAddFile(fonts->config, ...)`
  from the JavaScript thread (`canvas.cpp:312`) and then
  `pango_fc_font_map_config_changed`. Whether `FcConfigAppFontAddFile` may run
  while that thread uses the same `FcConfig` is a fontconfig question. I did not
  read the fontconfig documentation. **Unknown**, and it already applies to
  the synchronous code today.
- Stated for ownership. `pango_fc_font_map_set_config` "acquires a reference to
  the FcConfig" (`pangofc-fontmap.c:2610`).

**Consequence: keep drawing and text layout synchronous, one owner per font
map.** The plan does not move them. If a later step wants parallel text
layout, give each worker its own `Fonts` object. Ask the pango or fontconfig
maintainers about `FcConfigAppFontAddFile` against the background thread.

### Q4.3 What does `image.cpp` use for PNG encoding, and is it thread-safe for independent calls?

**Answer: stb_image_write (`stbi_write_png_to_func`). Yes for independent
calls, by source reading. Not stated by the library.**

- Source in the host. `image.cpp:14-17` includes `stb_image.h` and
  `stb_image_write.h`. `image.cpp:98` calls `stbi_write_png_to_func(append, &out,
  ...)` with a per-call `std::vector`. `image.cpp:11-17` defines
  `STBI_NO_HDR`, `STBI_NO_PIC`, `STBI_FAILURE_USERMSG` and `STBI_WRITE_NO_STDIO`.
- Source in stb at commit `d14d46f6`
  ([`stb_image_write.h`](https://github.com/nothings/stb/blob/d14d46f6b44456eb88beac58cba833a4135d4c89/stb_image_write.h)).
  The file states no threading policy (a search for "thread" found nothing).
  The PNG path reads three file-scope variables and writes none.
  `stbi_write_png_compression_level` (line 251), `stbi_write_force_png_filter`
  (253) and `stbi__flip_vertically_on_write` (260) are read at lines 1130, 1176
  and 1099. The only setter is `stbi_flip_vertically_on_write` (line 262), which
  the host never calls (search of `image.cpp` and the repo found no call).
  The `static` arrays on the PNG path (`crc_table` at 1029, `mapping` and
  `firstmap` at 1094, `lengthc`, `distc` at 901 to 904) are initialized with
  constants and only read. Memory comes from `malloc`/`realloc`/`free`
  (`STBIW_MALLOC` at line 228).
- Source for decode. `stb_image.h` (v2.30) stores the failure reason in a
  `thread_local` variable (`stb_image.h:967-970` under `STBI_THREAD_LOCAL`),
  so `stbi_failure_reason()` is per-thread. The host reads it on the failing
  thread (`image.cpp:51`, `68`).

**Consequence: convert.** Independent encodes on the CPU lane are safe as long
as nobody sets the globals concurrently. The source reading supports this.
Library documentation does not state it, so mark it "source only" in the review.
Pin the commit, which the project already does.

## 7. POSIX file operations (`files.cpp`, `assets.cpp`, `paths.cpp`)

### Q5.1 Is there per-process state that concurrent use would race on?

**Answer: not in the current code. Yes in the asset write path, for a
different reason.**

- Stated. [POSIX.1-2024, XSH 2.9.1 Thread-Safety](https://pubs.opengroup.org/onlinepubs/9799919799/functions/V2_chap02.html):
  "All functions defined by this volume of POSIX.1-2024 shall be thread-safe,
  except that the following functions need not be thread-safe." The list
  includes `strerror()` and says "The readdir() function need not be
  thread-safe if concurrent calls are made for the same directory stream."
  It also says `getenv` is unsafe against concurrent environment changes.
- Stated. The cwd and umask are per-process.
  [`chdir`](https://pubs.opengroup.org/onlinepubs/9799919799/functions/chdir.html):
  the page defines the current working directory as the starting point for
  path searches of pathnames that do not begin with a slash.
  [`umask`](https://pubs.opengroup.org/onlinepubs/9799919799/functions/umask.html):
  "set the file mode creation mask of the process".
- Source. The host files never call `chdir`, `umask`, `getcwd`, `strerror`,
  `setenv` or `getenv` (search of `files.cpp`, `assets.cpp`, `paths.cpp` and
  `sandbox_av_tracks.cpp`). Guest relative paths join a configured workspace
  string, not the process cwd (`paths.cpp:150-157`, `absolute = cwd + "/" + path`).
  Only a grant directory given as a relative path is resolved through the
  process cwd, once, in `canonicalRoots` (`paths.cpp:107-116`).
  Errors map through `codeFor(errno)` and a table, not `strerror`.
  Each `readdir` loop uses its own `DIR*`.
- Source. Created modes are subject to the process umask. `open(..., 0644)`
  (`files.cpp:193`, `assets.cpp:117`), `mkdir(..., 0755)` (`files.cpp:276`,
  `assets.cpp:112`) and `mkdtemp` (`files.cpp:290`). Nothing in the runner
  changes the umask, so concurrent use sees a constant. This holds only while
  the embedder never calls `umask` or `chdir` on another thread (inferred,
  and a risk for embedders such as a host application that changes cwd).
- Not per-process state, but a real race. `assets.cpp:116-117` builds the
  temporary path as `r.real + ".tmp-" + getpid()` and opens it with `O_TRUNC`.
  Two concurrent writes to one key in one process use the same temporary file.
  The plan already names this (section 4.8) and requires `O_EXCL` unique
  names plus a destination queue. This evidence confirms the requirement.
- Stated for rename. `rename` "requires that the action of the function be
  atomic" ([rename](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html))
  for the replacement of an existing target. This supports the plan's
  "readers see a complete old or new file" claim, within one file system.
  I did not verify the same-directory or cross-mount edge cases beyond the page.

**Consequence: convert with the plan's restrictions.** Files can move to a
worker lane if each handle has one owner and the asset write adopts unique
temporary names and the destination queue. Document that the embedder must not
call `chdir` or `umask` while jobs run.

## 8. Summary per host

"Convert" means the evidence supports moving the host to a pool.
"Restriction" lists what the move must keep.

| Host | Decision | Basis | Restriction | Still unknown |
|---|---|---|---|---|
| Images (libvips) | Convert with a restriction | Stated: images may be created in any thread and read in any other (`using-threads.md`). Stated: `vips_init` single-threaded. | Run `vips_init` and `vips_cache_set_max` at startup before any pool thread. Keep create, evaluate and destroy in one worker call. Never call `vips_concurrency_set` or `vips_image_set_kill` while jobs run. Treat `VError` text as possibly mixed under concurrent failures. | Destruction of an image on a thread other than its creator is not stated. Cross-thread `vips_image_set_kill` safety and promptness are not stated, and the code shows an unsynchronized `int` that is cleared at sink start. Needs a maintainer answer. Keep the kill hook off. |
| Media (libav*) | Convert with a restriction | Source: FFmpeg's own CLI opens, uses and frees format and codec contexts on different threads with hand-off. Official libav-user post: separate contexts on different threads are fine, one context is not safe for concurrent use. | One session owns a context and runs one job at a time. Atomic interrupt flag. Token checks between packets and frames. Interrupt only reaches I/O retry loops and the stream-info loop, not codec or filter work. Output writes are not interruptible. | No official statement of cross-thread create and free. `AVFilterGraph` cross-thread move has no example in the CLI. No per-function thread-safety list. Needs a maintainer answer if a stated guarantee is wanted. |
| Track staging | Convert with a restriction | Same FFmpeg evidence as media. Filesystem part follows files. | Same as media. Dependents release before staging-directory removal, as the plan says. | Same as media. |
| HTTP (libcurl) | Convert with a restriction | Stated: handles may pass between threads, never concurrent (`libcurl-thread.md`). Stated: `curl_global_init` is thread-safe with the `threadsafe` feature, which this build has. | Document that the progress callback cannot stop DNS or connect, which end only at the 15 s connect timeout. Keep `CURLOPT_NOSIGNAL`. Move `curl_global_init` to startup for builds without the feature. | Prompt abort during DNS and connect is not available. This is a limit, not an unknown. |
| Canvas encode | Convert the encode only | Maintainer statement (Carl Worth, 2009): no simultaneous access to one cairo object, independent objects are fine. Source: stb PNG encoder reads only constant globals. | Snapshot with `cairo_surface_flush` and a copy on the owning thread, then encode the copy. Keep drawing, text layout and `toBuffer` synchronous. One owner per `Fonts` object. | Cairo has no written thread-safety contract. A shared `PangoFcFontMap` is not documented safe. `FcConfigAppFontAddFile` against Pango's fontconfig thread is not documented. stb has no threading statement, only source reading. |
| Files and assets | Convert with the plan's restrictions | Stated: POSIX 2.9.1 makes these calls thread-safe. Source: no `chdir`, `umask`, `strerror` or `getenv` in the host. | One owner per descriptor. Asset writes use `O_EXCL` unique temporary names and the destination queue. Embedder must not change cwd or umask while jobs run. | None for the calls used. The PID-only temporary name is a known defect that the plan already covers. |

## 9. Questions that remain unknown

1. **Q1.1 and Q1.2.** Is `vips_image_set_kill` supported from another thread,
   and does the image that `write_to_buffer` evaluates carry the flag? The
   code has no synchronization, clears the flag at sink start and checks it only
   at thread-pool ticks. Ask the libvips maintainers (GitHub discussion).
2. **Q1.4.** Is unref and destroy of a `VipsImage` on a thread other than its
   creator supported, after evaluation finished? The documentation names only
   create and read.
3. **Q2.1.** Does FFmpeg promise that an `AVFormatContext`, `AVCodecContext` or
   `AVFilterGraph` may be created on one thread and freed on another when access
   is not concurrent? The sources show only the CLI's behavior and a 2014
   statement about separate contexts. Ask on ffmpeg-devel or libav-user.
4. **Q2.4.** Does FFmpeg keep a list of functions that are not safe across
   separate contexts? I found none.
5. **Q4.1.** Does cairo document thread behavior beyond the 2009 maintainer
   statement? I found no page in the manual.
6. **Q4.2.** May `FcConfigAppFontAddFile` and `pango_fc_font_map_config_changed`
   run while the Pango fontconfig thread uses the same `FcConfig`? This applies
   to the synchronous code today. Ask fontconfig and pango.
7. **Q4.3.** Does stb state that `stbi_write_png_to_func` is thread-safe? It
   does not. The conclusion rests on reading the code at one commit.
