#include "kernel/subgraph.h"
namespace gr {
namespace {
class SubgraphExecutor final : public Executor {
public:
  SubgraphExecutor(NodeCatalog& catalog, Runner& parent, std::string nodeId, RunOptions options)
    : catalog_(catalog),parent_(parent),nodeId_(std::move(nodeId)),options_(std::move(options)) {}
  void beginInvocation(const std::string& key) override {
    const auto lineage = nlohmann::json::parse(key.empty() ? "{}" : key);
    if (!lineage.is_object()) throw NodeError("Subgraph invocation lineage must be an object");
    auto scope = Json::parse(options_.executionScope);
    if (!scope.is_array()) throw NodeError("Subgraph execution scope must be a path");
    auto& occurrence = occurrences_[lineage.dump()];
    scope.push_back(Json::array({nodeId_,Json::parse(lineage.dump()),occurrence++}));
    invocationScope_ = scope.dump();
  }
  Task<void> initialize() override { co_return; }
  Task<void> preProcess() override { co_return; }
  Task<void> finalize() override { co_return; }
  Task<Json> process(Json inputs) override {
    auto graph = inputs.value("graph",Json::object());
    if (!graph.is_object() || !graph.contains("nodes") || !graph["nodes"].is_array() || !graph.contains("edges") || !graph["edges"].is_array() || graph["nodes"].empty()) co_return Json::object();
    graph = catalog_.prepareInnerGraph(std::move(graph));
    if (options_.innerGraphDepth >= 8) throw NodeError("Inner graphs are nested more than 8 levels deep.");
    auto catalog = catalog_.forkContext();
    if (!catalog) throw NodeError("Subgraph context cloning is unavailable");
    for (auto& node : graph["nodes"]) {
      if (!node.contains("properties") && node.contains("data")) {
        const auto& data = node["data"];
        node["properties"] = data.is_object() ? data.value("properties",data) : Json::object(); node.erase("data");
      }
      const auto type = node.value("type",std::string());
      if (type.rfind("nodetool.output.",0) == 0) {
        const auto props = node.value("properties",Json::object());
        auto name = props.value("name",std::string());
        const auto first = name.find_first_not_of(" \t\r\n");
        if (first != std::string::npos) { const auto last=name.find_last_not_of(" \t\r\n"); node["name"]=name.substr(first,last-first+1); }
      }
    }
    if (!invocationScope_) beginInvocation("{}");
    auto options = options_; ++options.innerGraphDepth;
    options.executionScope = *invocationScope_;
    if (!options.rootJobId) options.rootJobId = options_.jobId;
    if (options.executionPolicy) options.executionPolicy = std::make_shared<ExecutionPolicy>(*options.executionPolicy);
    // Display IDs may vary. Persistence and callback identity use executionScope.
    // native-rules #14: thread_local mutable job counter
    static thread_local unsigned long long nextJob = 0;
    options.jobId += "/sub-" + std::to_string(++nextJob);
    std::string childError;
    Runner child(*catalog,[this,&childError](const Json& message) {
      if (message.value("type",std::string()) != "job_update") parent_.emitMessage(message);
      else if (message.value("status",std::string()) == "failed") childError = message.value("error",std::string("unknown error"));
    },options);
    struct CancellationWatch {
      Runner& parent; size_t token;
      ~CancellationWatch() { parent.removeCancelListener(token); }
    } watch{parent_,parent_.onCancel([&child] { child.cancel(); })};
    Json params = inputs; params.erase("graph");
    std::exception_ptr failure;
    std::optional<RunStatus> status;
    try { status = co_await child.run(graph,params); } catch (...) { failure = std::current_exception(); }
    if (failure) std::rethrow_exception(failure);
    if (*status == RunStatus::Cancelled) throw NodeError("Subgraph cancelled");
    if (*status == RunStatus::Failed) throw NodeError("Subgraph failed: " + childError);
    Json outputs = Json::object();
    for (const auto& [name,values] : child.outputs().items()) {
      if (!values.is_array()) continue;
      if (values.size() == 1) outputs[name] = values.front();
      else if (values.size() > 1) outputs[name] = values;
    }
    co_return outputs;
  }
  class Frames final : public FrameIterator {
  public:
    Frames(SubgraphExecutor& executor, Json inputs) : executor_(executor),inputs_(std::move(inputs)) {}
    Task<std::optional<Json>> next() override {
      if (done_) co_return std::nullopt;
      done_ = true; co_return co_await executor_.process(inputs_);
    }
  private:
    SubgraphExecutor& executor_; Json inputs_; bool done_ = false;
  };
  std::unique_ptr<FrameIterator> genProcess(Json inputs) override { return std::make_unique<Frames>(*this,std::move(inputs)); }
  bool hasRun() const override { return false; }
  Task<Json> run(StreamIO&) override { throw NodeError("Subgraph is a buffered node"); co_return Json::object(); }
private:
  NodeCatalog& catalog_; Runner& parent_; std::string nodeId_; RunOptions options_;
  std::map<std::string,unsigned long long> occurrences_;
  std::optional<std::string> invocationScope_;
};
}
std::unique_ptr<Executor> makeSubgraphExecutor(NodeCatalog& catalog, Runner& parent, std::string nodeId, RunOptions options) {
  return std::make_unique<SubgraphExecutor>(catalog,parent,std::move(nodeId),std::move(options));
}
}
