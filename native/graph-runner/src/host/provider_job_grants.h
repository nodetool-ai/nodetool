// The provider job grants GraphRunner installs (nodetool/provider_jobs.h).
#pragma once

#include "nodetool/graph_runner.h"

namespace gr::host {

// Adds the grants of options.providerJobs for options.providerJobProviders
// to `context`, stamped with the runs `run` answers. Adds none without
// providerJobs, and none with fakeProviders.
void grantProviderJobs(const gr::HostOptions& options, ContextOptions& context, ProviderJobs::RunSource run);

}  // namespace gr::host
