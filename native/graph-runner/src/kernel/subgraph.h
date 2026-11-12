#pragma once
#include "kernel/runner.h"
namespace gr {
std::unique_ptr<Executor> makeSubgraphExecutor(NodeCatalog&, Runner&, std::string nodeId, RunOptions);
}
