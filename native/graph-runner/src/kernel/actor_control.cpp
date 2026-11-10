#include "kernel/actor.h"
#include "kernel/state_executor.h"
#include <algorithm>
#include <cmath>

namespace gr {
namespace {
bool truthy(const Json& value) {
  if (value.is_null()) return false;
  if (value.is_boolean()) return value.get<bool>();
  if (value.is_number()) return value.get<double>() != 0;
  if (value.is_string()) return !value.get<std::string>().empty();
  return true;
}
void merge(Json& target, const Json& source) {
  if (source.is_object()) for (const auto& [k,v] : source.items()) target[k] = v;
}
}

Task<void> Actor::runControlled() {
  Json cached = Json::object();
  std::set<std::string> pending;
  for (const auto& h : inbox_.handles()) if (h != "__control__") pending.insert(h);
  std::vector<Envelope> held;
  while (!pending.empty() && !host_.cancelled()) {
    for (auto it = pending.begin(); it != pending.end();) {
      if (!inbox_.isOpen(*it) && !inbox_.hasBuffered(*it)) it = pending.erase(it);
      else ++it;
    }
    if (pending.empty()) break;
    auto popped = inbox_.tryPopAny();
    if (popped) {
      if (popped->first == "__control__") held.push_back(std::move(popped->second));
      else { cached[popped->first] = *popped->second.data; pending.erase(popped->first); }
    } else {
      if (inbox_.isClosed()) break;
      co_await inbox_.waitForActivity();
    }
  }
  for (auto it = held.rbegin(); it != held.rend(); ++it) inbox_.prepend("__control__", *it);
  while (!host_.cancelled()) {
    auto event = co_await inbox_.nextInput("__control__");
    if (!event || host_.cancelled()) break;
    const auto kind = event->data->value("event_type", std::string());
    if (kind == "stop") break;
    if (kind != "run") continue;
    for (const auto& h : inbox_.handles()) {
      if (h == "__control__") continue;
      auto values = inbox_.drainHandle(h);
      if (!values.empty()) cached[h] = *values.back().data;
    }
    Json inputs = Json::object();
    merge(inputs, node_.properties); merge(inputs, node_.dynamicProperties);
    merge(inputs, appendStaticItems(cached));
    merge(inputs, event->data->value("properties", Json::object()));
    inputs = host_.prepareInputs(node_,std::move(inputs));
    executor_.beginInvocation(lineageToJson(event->lineage).dump());
    Json outputs;
    bool skipped = false;
    try { outputs = co_await executor_.process(inputs); }
    catch (const InvocationSkipped&) { skipped = true; }
    if (skipped) {
      RoutingHints hints;
      hints.invocationLineage = event->lineage;
      hints.perSlotLineage.emplace();
      for (const auto& [slot, unused] : node_.outputs.items()) {
        (void)unused;
        hints.lineageDoneSlots.insert(slot);
        hints.perSlotLineage->emplace(slot, event->lineage);
      }
      co_await host_.sendOutputs(node_.id, Json::object(), std::move(hints));
      continue;
    }
    latestResult_ = outputs;
    co_await host_.sendOutputs(node_.id, outputs, {});
    emitGenerationComplete(outputs, nullptr);
  }
}

Task<void> Actor::runLoop() {
  if (!correlation_) throw NodeError("Missing Loop correlation analysis");
  const auto& parentScope = correlation_->invocationScope;
  const auto root = node_.id + ":loop";
  double raw = 10;
  if (node_.properties.is_object() && node_.properties.contains("max_iterations")) {
    const auto& v = node_.properties["max_iterations"];
    if (v.is_number()) raw = v.get<double>();
    else if (v.is_null()) raw = 10;
    else if (v.is_boolean()) raw = v.get<bool>() ? 1 : 0;
    else if (v.is_string()) {
      try { size_t end; const auto s = v.get<std::string>(); raw = std::stod(s, &end); if (end != s.size()) raw = 10; }
      catch (const std::exception&) { raw = 10; }
    }
  }
  const int maximum = std::isnan(raw) ? 10 : static_cast<int>(std::clamp(std::floor(raw), 1.0, 1000.0));
  const auto& handles = inbox_.handles();
  const bool initialWired = std::find(handles.begin(),handles.end(),"initial") != handles.end();
  const bool conditionWired = std::find(handles.begin(),handles.end(),"condition") != handles.end();
  struct Run { Lineage parent; int iteration = 0; std::optional<Envelope> next, condition; };
  std::map<std::string,Run> runs;
  std::set<std::string> started;
  bool closed = false;
  auto emitValue = [this](const std::string& slot, Json value, const Lineage& lineage) -> Task<void> {
    Json outputs = Json::object(); outputs[slot] = value;
    if (!latestResult_) latestResult_ = Json::object();
    (*latestResult_)[slot] = value;
    RoutingHints hints; hints.perSlotLineage = std::map<std::string,Lineage>{{slot,lineage}};
    co_await host_.sendOutputs(node_.id, outputs, hints);
  };
  auto iteration = [&](Run& run, Json value) -> Task<void> {
    auto lineage = run.parent; lineage[root] = run.iteration;
    co_await emitValue("value", value, lineage);
    co_await emitValue("index", run.iteration, lineage);
  };
  auto start = [&](const Lineage& lineage, Json value) -> Task<void> {
    const auto key = tryProjectLineageKey(lineage,parentScope).value_or("");
    if (!started.insert(key).second) co_return;
    Run run;
    for (const auto& r : parentScope) { auto it = lineage.find(r); if (it != lineage.end()) run.parent[r] = it->second; }
    auto [it,ok] = runs.emplace(key,std::move(run));
    co_await iteration(it->second,value);
  };
  if (!initialWired) co_await start({},node_.properties.value("initial",Json(nullptr)));
  while (!host_.cancelled()) {
    auto popped = inbox_.tryPopAny();
    if (popped) {
      const auto& [handle,env] = *popped;
      if (handle == "initial") co_await start(env.lineage,*env.data);
      else if (handle == "next" || handle == "condition") {
        const auto key = tryProjectLineageKey(env.lineage,parentScope);
        auto it = key ? runs.find(*key) : runs.end();
        auto token = env.lineage.find(root);
        if (it == runs.end() || token == env.lineage.end() || token->second != it->second.iteration) continue;
        auto& run = it->second;
        (handle == "next" ? run.next : run.condition) = env;
        if (run.next && (!conditionWired || run.condition)) {
          Json value = *run.next->data;
          const bool again = !conditionWired || truthy(*run.condition->data);
          if (again && run.iteration + 1 < maximum) {
            ++run.iteration; run.next.reset(); run.condition.reset();
            co_await iteration(run,value);
          } else {
            if (again && conditionWired) emitNodeStatus("warning",nullptr,"Loop stopped after max_iterations (" + std::to_string(maximum) + ") while its condition was still true.");
            auto parent = run.parent; runs.erase(it);
            co_await emitValue("done",value,parent);
          }
        }
      }
      continue;
    }
    if (inbox_.isClosed()) break;
    if (inbox_.takeQuiescent()) runs.clear();
    auto closedEmpty = [&](const std::string& h) { return !inbox_.isOpen(h) && !inbox_.hasBuffered(h); };
    for (auto it = runs.begin(); it != runs.end();) {
      if ((!it->second.next && closedEmpty("next")) || (conditionWired && !it->second.condition && closedEmpty("condition"))) it = runs.erase(it);
      else ++it;
    }
    if (!closed && runs.empty() && (!initialWired || closedEmpty("initial"))) {
      closed = true; host_.signalSlotEos(node_.id,"value"); host_.signalSlotEos(node_.id,"index");
    }
    if (inbox_.isFullyDrained()) break;
    co_await inbox_.waitForActivity();
  }
}
} // namespace gr
