#include "host/capabilities.h"
#include "host/media.h"
#include "host/sandbox_av_tracks.h"

#include "host/sqlite.h"
#include "host/gpu.h"
#include "host/image.h"
#include "host/intl.h"
#include "host/context.h"
#include "host/sandbox.h"
#include "host/canvas.h"
#include "host/webassembly.h"

namespace gr::host {

// Each defined in src/host/<name>.cpp.
void installFiles(js::Engine&, const js::Value&, const HostOptions&);
void installAssets(js::Engine&, const js::Value&, const HostOptions&);
void installPackageAssets(js::Engine&, const js::Value&, const HostOptions&);
void installBundleAssets(js::Engine&, const js::Value&, const HostOptions&);
void installSecrets(js::Engine&, const js::Value&, const HostOptions&);
void installHttp(js::Engine&, const js::Value&, const HostOptions&);
void installProcess(js::Engine&, const js::Value&, const HostOptions&);
void installTimers(js::Engine&, const js::Value&, const HostOptions&);
void installKernels(js::Engine&, const js::Value&, const HostOptions&);

const std::vector<Capability>& capabilities() {
  // One line per capability: {"name", installName}.
  static const std::vector<Capability> list = {
      {"webassembly", [](js::Engine& e, const js::Value& o, const HostOptions& options) { installWebAssembly(e, o, options.context.cancelled); }},
      {"sqlite", installSqlite},
      {"sandbox", [](js::Engine& e, const js::Value& o, const HostOptions& options) { installSandbox(e, o, options.context.cancelled); }},
      {"files", installFiles},
      {"assets", installAssets},
      {"secrets", installSecrets},
      {"http", installHttp},
      {"process", installProcess},
      {"timers", installTimers},
      {"kernels", installKernels},
      {"image", installImage},
      {"media", [](js::Engine& e, const js::Value& o, const HostOptions& options) {
        MediaOptions media;
        media.enabled = options.allowMedia;
        media.encoders.insert(options.mediaEncoders.begin(), options.mediaEncoders.end());
        media.cancelled = options.context.cancelled;
        installMedia(e, o, options, media);
        installSandboxAvTracks(e, o, options, media);
      }},
      {"canvas", installCanvas},
      {"intl", [](js::Engine& e, const js::Value& o, const HostOptions&) { installIntl(e, o); }},
      {"packageAssets", installPackageAssets},
      {"bundleAssets", installBundleAssets},
      {"providers", [](js::Engine& e, const js::Value& o, const HostOptions& options) {
        const bool fake = options.fakeProviders;
        e.set(o, "fake", e.function("fake", 0, [fake](js::Engine& en, const std::vector<js::Value>&) { return en.boolean(fake); }));
      }},
      {"context", [](js::Engine& e, const js::Value& o, const HostOptions& options) {
        if (!options.fakeProviders) return installContext(e, o, options.context);
        // A name in both maps is an error in either mode.
        checkGrantMaps(options.context);
        // Fake providers: no provider call may reach an embedder callback,
        // through either transport.
        ContextOptions grants = options.context;
        dropProviderGrants(grants.operations);
        dropProviderGrants(grants.asyncOperations);
        installContext(e, o, grants);
      }},
      {"gpu", installGpu, gpuBoundary, gpuEndRun},
  };
  return list;
}

std::optional<Json> atBoundary(js::Engine& engine, const Json& message) {
  std::optional<Json> rewritten;
  for (const auto& capability : capabilities()) {
    if (!capability.boundary) continue;
    if (auto next = capability.boundary(engine, rewritten ? *rewritten : message)) rewritten = std::move(next);
  }
  return rewritten;
}

void endRun(js::Engine& engine, const std::string& jobId) {
  for (const auto& capability : capabilities()) {
    if (capability.endRun) capability.endRun(engine, jobId);
  }
}

}  // namespace gr::host
