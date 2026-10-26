# Sanitizer baseline

GPU evidence is in `/home/mg/Projects/nodetool-gaps/briefs/V-evidence/`.
Entries also identify reports from earlier local offscreen runs. Project ownership comes
from the `owns` patterns in [gaps-manifest.json](../../docs/gaps-manifest.json).
V-TSAN-2 is a test report across
standard-library synchronization that needs an instrumented-library check.
The deep-unwind logs attribute the remaining leak groups to Qt Quick
pixmap-reader teardown (V-EXT-4) and expected Vulkan failure-path retention
(V-LEAK-2). Both are suppressed with the scope limits documented below.

## V-TSAN-2: CPU usage test latch synchronization

File: `tests/tst_cpuusage.cpp:93` (read) and `:81` (worker write).
Kind: TSan data-race report. Owner: **unowned** in the manifest.
Top project frame: `TstCpuUsage::nativeQueryKeepsThreadIdentity`.
Source: local offscreen TSan run.

```text
Read by main: TstCpuUsage::nativeQueryKeepsThreadIdentity() tst_cpuusage.cpp:93:44
Write by T6: registerWorker lambda in nativeQueryKeepsThreadIdentity() :81:20
Thread created by std::jthread at tst_cpuusage.cpp:87
```

The worker writes the handle, calls `std::latch::count_down`, and the main
thread calls `ready.wait()` before reading it. This source ordering includes
standard synchronization, so this report alone does not establish a C++ race.
The installed GCC 16 `bits/atomic_wait.h` implements `_M_on_wake` by returning
a value loaded in `std::__detail::__wait_impl` without repeating the caller's
acquire load when `_M_has_val` is true. That implementation lives in the
uninstrumented libstdc++. The likely cause is an acquire invisible to TSan.
Confirm with an instrumented standard library before changing the test.

The narrow exemption is `race:TstCpuUsage::nativeQueryKeepsThreadIdentity`.
It also masks other races in that one test function. No file-wide CpuUsage
or standard-library suppression is added. No test implementation is changed.

## V-EXT-1: libdbus platform teardown

Kind: direct and indirect leaks, 1,310 bytes per reported process in GPU run 1.
Tests: `tst_editpreview`, `tst_vulkaninterop`, `tst_tracksui` (including its
scene-graph child). Top project frame: none. Owner: third-party libdbus.

```text
calloc -> dbus_message_new_empty_header dbus-message.c:1263
_dbus_message_loader_queue_messages -> _dbus_transport_get_dispatch_status
socket_do_iteration -> dbus_connection_send_with_reply_and_block
internal_bus_get -> libnvidia-glcore.so.610.57.04+0xa196a6
realloc -> reallocate_for_length -> _dbus_string_copy_len -> load_message
```

The complete run-1 stacks stay in libdbus and the NVIDIA platform library.
The run-2 log confirms `leak:libdbus-1.so` removes these reports. No project
allocation or missing project release is identified by these stacks.

## V-EXT-2: NVIDIA VAAPI 0.0.18 list storage

Kind: direct leaks in `nvidia-vaapi-driver-0.0.18/src/list.c:24`.
Top project frame: none. Owner: third-party NVIDIA VAAPI driver.
Source: `ctest-sanitize-2.log`. Each row is a complete leak group in that log.

| Test | Bytes / objects | Stack after `realloc -> ensure_capacity -> add_element` | Suppression |
|---|---:|---|---|
| tst_sourcepool | 384 / 3 | direct_realiseSurface:924 -> direct_exportCudaPtr:947 -> resolveSurfaces:654 -> asan_thread_start | direct_realiseSurface |
| tst_sourcepool | 384 / 3 | allocateObject:453 -> nvCreateConfig:956 -> vaCreateConfig -> vaapi_decode_make_config | nvCreateConfig |
| tst_ffmpegsource | 3584 / 28 | direct_realiseSurface:924 -> direct_exportCudaPtr:947 -> resolveSurfaces:654 -> asan_thread_start | direct_realiseSurface |
| tst_ffmpegsource | 3456 / 27 | allocateObject:453 -> nvCreateConfig:956 -> vaCreateConfig -> vaapi_decode_make_config | nvCreateConfig |
| tst_ffmpegsource | 192 / 1 | allocateObject:453 -> nvCreateBuffer:1995 -> vaCreateBuffer -> ff_vaapi_decode_make_slice_buffer | nvCreateBuffer |
| tst_vulkaninterop | 384 / 3 | direct_realiseSurface:924 -> direct_exportCudaPtr:947 -> resolveSurfaces:654 -> asan_thread_start | direct_realiseSurface |
| tst_vulkaninterop | 384 / 3 | allocateObject:453 -> nvCreateConfig:956 -> vaCreateConfig -> vaapi_decode_make_config | nvCreateConfig |

These allocations are the driver's growable list arrays, rather than a project
`AVBufferRef`, codec, VA display or surface allocation. `FfmpegSource.cpp`
uses `Stream::hwDevice` with `BufferUnref` and `Stream::ctx` with `CodecCloser`.
`tests/tst_vulkaninterop.cpp` uses `VaapiFixture::device` with `BufferFree`
and `decoder` with `CodecFree`. Linux setup transfers the returned device
to these owners and gives the codec its own `av_buffer_ref`. Their deleters
unref the device and free the codec. The GPU tests finish their normal teardown.
These stacks support suppressing the driver's list bookkeeping, not all VAAPI
allocations or project functions. The interop failure-injection tests also
retain some mappings deliberately, as discussed in V-LEAK-2.

## V-EXT-3: uninstrumented FFmpeg frame threading

Kind: TSan interceptor race in H.264 frame threading. Owner: third-party
FFmpeg. Sources: `ctest-tsan-1.log` and the two `tsan-nohw-*.log` files.

```text
Read: memcpy -> h264_copy_picture_params libavcodec/h264_picture.c:88
Write: memset -> ff_h264_unref_picture libavcodec/h264_picture.c:47
       -> h264_frame_start libavcodec/h264_slice.c:535
```

The decoder's worker starts the codec, but both conflicting accesses are in
uninstrumented libavcodec. `called_from_lib:libavcodec.so` suppresses intercepted
library accesses. The local offscreen preset run also reports:

```text
Atomic read: pthread_mutex_lock -> av_buffer_pool_get libavutil/buffer.c:395
Previous write/allocation: posix_memalign -> av_malloc libavutil/mem.c:107
Threads created by init_thread -> ff_frame_thread_init -> avcodec_open2
```

Both conflicting accesses are inside the uninstrumented FFmpeg buffer pool.
`called_from_lib:libavutil.so` covers this additional local-run report.
No evidence required a libavformat suppression.
These suppressions do not disable instrumentation of project reads and writes.

## V-EXT-4: Qt Quick pixmap reader teardown (formerly V-LEAK-1)

Kind: indirect leaks only, with no direct leak or identified project owner.
Owner: third-party Qt Quick pixmap reader and Qt SVG image plugin.
Sources: `deep-cut.log`, `deep-handAndZoomToolsActOnTheLanes.log`,
`deep-dropModesAreOneChoice.log` and `leakmap/` in the evidence directory above.
These logs use `fast_unwind_on_malloc=0:malloc_context_size=40`.

The 78 per-function processes in `leakmap/` report leaks only for
`cutToolSplitsAtThePointer`, `handAndZoomToolsActOnTheLanes` and
`dropModesAreOneChoice`. Their deep logs contain 29, 28 and 22 indirect leak
records respectively. Every record follows one of these allocation paths
(arrows point from the allocation toward its callers):

```text
QThread::QThread -> libQt6Quick -> QQuickPixmap::load
  -> QQuickImageBase::loadPixmap -> QML incubation
  -> TestTracksUi::load tests/tst_tracksui.cpp:269
QArrayData::reallocateUnaligned -> QCoreApplication::postEvent
  -> libQt6Quick -> QQuickPixmap::load -> QQuickImageBase::loadPixmap
QImageData::create / QRasterPaintEngine / QBezier::addToPolygon
  -> SVG rendering -> libqsvg.so -> QImageReader::read
  -> libQt6Quick -> Qt event dispatch -> QEventLoop::exec -> QThread::exec
QObject::QObject -> QQuickTextureFactory::QQuickTextureFactory
  -> QQuickTextureFactory::textureFactoryForImage -> libQt6Quick
  -> Qt event dispatch -> QEventLoop::exec -> QThread::exec
QBindingStorage::QBindingStorage -> QObjectPrivate::QObjectPrivate
  -> QAbstractEventDispatcherPrivate -> QEventDispatcherGlibPrivate
  -> QEventDispatcherGlib::QEventDispatcherGlib
  -> Qt thread startup
QArrayData::reallocateUnaligned -> QCoreApplication::postEvent
  -> QObject::deleteLater -> libQt6Quick -> Qt event dispatch -> QThread::exec
QArrayData::allocate -> libQt6Core -> QEventLoop::exec
  -> QThread::exec -> libQt6Quick
```

Qt starts the asynchronous pixmap reader for SVG icons and still holds jobs
when the test destroys its `QQuickView`. The thread, queued events, dispatcher,
decoded images and texture factories form the retained Qt object graph. The
startup stacks pass through project QML loading, but the allocations and
reader-thread work belong to Qt. No project object retaining this graph is
identified. The view has a `std::unique_ptr` and `unload()` resets it.

`lsan.supp` matches `QQuickPixmap::load`, `libqsvg.so`,
`QQuickTextureFactory::textureFactoryForImage` and
`QEventDispatcherGlib::QEventDispatcherGlib`. The remaining event-storage
record uses `QObject::deleteLater`. The 32-byte-per-loop allocation uses
`QThread::exec`, which excludes main-thread event loops that a
`QEventLoop::exec` suppression would also match. These last two stacks have
no named pixmap-reader function with which to narrow the suppression further.

LSan matches any single frame, so these exemptions cannot require the whole
Qt Quick call chain. They can also hide project-triggered image-load leaks,
project-retained SVG images or texture factories, dispatchers of project-owned
Qt threads, deferred-deletion event leaks, and allocations made in project Qt
worker event loops. Each suppression comment states its scope. No generic
Qt-library, QImage, QObject-constructor or QThread-constructor exemption is added.

## V-LEAK-2: expected Vulkan failure-path retention

File: `src/preview/hw/VulkanInterop.cpp`. Kind: deliberate process-lifetime
retention of Vulkan driver allocations, reported as direct and indirect leaks.
Owner action: **none**. Source: `deep-tst_vulkaninterop.log` in the evidence
directory above, using `fast_unwind_on_malloc=0:malloc_context_size=40`.

All 110 records belong to exactly two failure-injection tests:
`TestVulkanInterop::teardownRequiresConfirmedFenceWait` (66 records) and
`TestVulkanInterop::teardownRetainsUnreleasedImagesAfterUnconfirmedAcquire`
(44 records). The total is 332,500 bytes in 164 allocations. Representative
stacks, from allocation toward caller:

```text
malloc -> NVIDIA Vulkan driver (<unknown module>)
  -> VulkanInterop::wrap VulkanInterop.cpp:803 (image import)
  -> TestVulkanInterop::teardownRequiresConfirmedFenceWait tst_vulkaninterop.cpp:314
malloc/calloc -> NVIDIA Vulkan driver (<unknown module>)
  -> VulkanInterop::Vk::submit VulkanInterop.cpp:296 / :306
  -> VulkanInterop::wrap -> either failure-injection test
```

Other records include memory import at `wrap:839`, command-buffer allocation
at `Vk::submit:289` and command-pool creation at `create:699`. The destructor
cannot confirm a fence wait or acquire completion in these injected failures.
It deliberately retains images, memory, the command pool and pending submission
resources for process lifetime because the GPU may still use them. The log
includes "retaining unreleased images and memory for process lifetime".

The B3 test checks `destructionStats` before and after teardown to prove images
and memory were retained. Removing the retention would break that test and
could free resources still in use. `lsan.supp` therefore exempts only
`TestVulkanInterop::teardownRequiresConfirmedFenceWait` and
`TestVulkanInterop::teardownRetainsUnreleasedImagesAfterUnconfirmedAcquire`.
These function-level exemptions can hide other leaks within those two tests.
They do not exempt `VulkanInterop::wrap`, `Vk::submit`, the driver as a whole,
or other tests.

## Runtime restrictions

The NVIDIA VAAPI driver uses CUDA mappings that overlap ASan's protected
shadow gap. The sanitize and fuzz presets set `protect_shadow_gap=0`.
Run 2 confirms hardware decode then works. This option does not suppress
an ASan report.

Both GPU TSan runs crashed the runtime at
`tsan_interceptors_posix.cpp:2206`, `((thr->slot)) != (0)`, during NVIDIA/CUDA
hardware decoding. The tsan preset sets `NT_NO_HW_DECODE=1`. The supplied
no-hardware logs pass the source-pool and FFmpeg-source tests with hardware
cases skipped. This is a runtime coverage limit, not a suppressed race.
