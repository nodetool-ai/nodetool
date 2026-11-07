#pragma once
#include "kernel/state_executor.h"
#include "nodetool/supervisor_options.h"
namespace gr {
// Explicit host grant translated into a fresh run-scoped kernel policy.
void configurePublicSupervisor(ExecutionPolicy& policy,
                               SupervisorOptions options, std::string jobId);
}
