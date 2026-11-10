// PT13: bytes cross an edge between two nodes as a C++ blob, not as base64
// inside the JSON text. Runs fixture graphs (blob-values-node.mjs) through
// the public runner and checks the contracts of the value path:
//   C1  a host still receives {"__bytes__": "<base64>"} with the same tags
//   C2  every byte type keeps its type across an edge
//   C3  a consumer or the producer never changes another reader's value
//   C5  blob bytes are charged to the admission ledger, a stream stays
//       flat, nothing stays charged after the run, and an output over the
//       run's byte limit fails its node
// and prints the time of a 50 MB output that fans out to 4 edges.
#include "nodetool/graph_runner.h"
#include "nodetool/jobs/admission.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <functional>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

using Json = nlohmann::ordered_json;
using nodetool::jobs::kMiB;

namespace {

// The messages of one job. Large messages keep only their head, so a 50 MB
// output does not stay in memory once per message.
//
// Thread affinity: thread-safe. `mutex` guards every member. The runner's
// worker thread writes through handler(), and the test thread reads after
// wait().
struct Messages {
  static constexpr size_t kKeep = 64 * 1024;
  std::mutex mutex;
  std::condition_variable changed;
  std::vector<std::string> rows;
  std::string terminal;
  bool finished = false;
  // Called on the worker for each message, before it is stored.
  std::function<void()> sample;

  gr::GraphRunner::MessageHandler handler() {
    // The test keeps this object alive until wait() returns, and the runner
    // calls no handler after the terminal message.
    return [this](const std::string& text, bool last) {
      if (sample) sample();
      std::lock_guard lock(mutex);
      rows.push_back(text.size() > kKeep ? text.substr(0, 256) : text);
      if (last) {
        terminal = text;
        finished = true;
        changed.notify_all();
      }
    };
  }
  void wait() {
    std::unique_lock lock(mutex);
    if (!changed.wait_for(lock, std::chrono::seconds(120), [&] { return finished; })) {
      throw std::runtime_error("the job did not end");
    }
  }
  // Throws with the job's error unless it completed.
  void requireCompleted(const std::string& what) {
    const Json last = Json::parse(terminal);
    if (last.value("status", std::string()) != "completed") {
      throw std::runtime_error(what + ": " + last.dump());
    }
  }
  // The first stored message that contains every needle.
  std::string find(std::initializer_list<const char*> needles) {
    std::lock_guard lock(mutex);
    for (const auto& row : rows) {
      if (std::all_of(needles.begin(), needles.end(), [&](const char* n) { return row.find(n) != std::string::npos; })) {
        return row;
      }
    }
    return {};
  }
};

Json node(const std::string& id, const std::string& type, Json properties = Json::object()) {
  return {{"id", id}, {"type", type}, {"properties", std::move(properties)}};
}

Json edge(const std::string& source, const std::string& target) {
  return {{"id", source + "-" + target}, {"source", source}, {"sourceHandle", "output"},
          {"target", target}, {"targetHandle", "input"}};
}

std::string graph(std::vector<Json> nodes, std::vector<Json> edges) {
  return Json{{"nodes", std::move(nodes)}, {"edges", std::move(edges)}}.dump();
}

// The checks that failed. Thread affinity: the test thread only.
std::vector<std::string>& failures() {
  static std::vector<std::string> list;
  return list;
}

// Records a failed check and goes on, so one run reports every contract.
void require(bool ok, const std::string& what) {
  if (ok) return;
  std::fprintf(stderr, "FAIL: %s\n", what.c_str());
  failures().push_back(what);
}

void run(gr::GraphRunner& runner, const std::string& job, const std::string& graphJson, Messages& messages) {
  runner.submit(job, "workflow", graphJson, "{}", messages.handler());
  messages.wait();
  messages.requireCompleted(job);
}

// Waits for the ledger to hold no byte: the worker frees a run's values
// after it sent the terminal message.
uint64_t settledBytes(const nodetool::jobs::AdmissionLedger& ledger) {
  for (int i = 0; i < 400 && ledger.usage().bytes != 0; ++i) {
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }
  return ledger.usage().bytes;
}

}  // namespace

int main(int argc, char** argv) {
  try {
    if (argc != 2) throw std::runtime_error("expected the blob fixture bundle");
    gr::HostOptions options;
    options.admissionLedger = gr::newAdmissionLedger();
    const auto ledger = options.admissionLedger;
    gr::GraphRunner runner(argv[1], options);
    if (!runner.waitUntilLoaded(120000)) throw std::runtime_error("guest load: " + runner.loadError());

    // C1: the host sees tagged base64, byte for byte, with the type tags.
    {
      Messages small;
      run(runner, "c1-bytes", graph({node("source", "fixture.BlobSource", {{"size", 3}}),
                                     node("sink", "fixture.BlobSink", {{"size", 3}})},
                                    {edge("source", "sink")}), small);
      require(!small.find({R"("type":"generation_complete")", R"("node_id":"source")",
                           R"("outputs":{"output":{"__bytes__":"AQcC"}})"}).empty(),
              "C1: the generation_complete of a Uint8Array is not {\"__bytes__\":\"AQcC\"}");
      require(!small.find({R"("type":"node_update")", R"("node_id":"source")",
                           R"("result":{"output":{"__bytes__":"AQcC"}})"}).empty(),
              "C1: the node_update result of a Uint8Array is not {\"__bytes__\":\"AQcC\"}");
      Messages typed;
      run(runner, "c1-typed", graph({node("source", "fixture.TypedSource"), node("sink", "fixture.TypedSink")},
                                    {edge("source", "sink")}), typed);
      const std::string update = typed.find({R"("type":"generation_complete")", R"("node_id":"source")"});
      for (const char* expected : {
               R"("Uint8Array":{"__bytes__":"AQL6"})",
               R"("sliced":{"__bytes__":"BQYH"})",
               R"("empty":{"__bytes__":""})",
               R"("ArrayBuffer":{"__typed__":"ArrayBuffer","__bytes__":"AwQFBgcICQo="})",
               R"("Float32Array":{"__typed__":"Float32Array","__bytes__":"AADAPwAAEMA="})",
               R"("DataView":{"__typed__":"DataView","__bytes__":"AgMEBQY="})",
               R"("nested":{"list":[{"__bytes__":"CQ=="},"text",4,{"deep":{"__typed__":"Float32Array","__bytes__":"AAAAPw=="}}]})",
               R"("plain":{"__bytes__":"AA==","other":true})",
               R"("marker":{"__blob__":0,"other":true})",
           }) {
        require(update.find(expected) != std::string::npos, std::string("C1: the typed generation_complete lacks ") + expected);
      }
      if (update.find(R"("Buffer":)") != std::string::npos) {
        require(update.find(R"("Buffer":{"__bytes__":"BAUG","__buffer__":true})") != std::string::npos,
                "C1: a Buffer is not {\"__bytes__\":\"BAUG\",\"__buffer__\":true}");
      }
    }

    // C2: every byte type keeps its type across an edge, a streaming
    // output, a streaming input and an emit.
    {
      Messages streamed;
      run(runner, "c2-stream", graph({node("source", "fixture.TypedStream", {{"frames", 3}}),
                                      node("relay", "fixture.TypedRelay"), node("last", "fixture.TypedRelay")},
                                     {edge("source", "relay"), edge("relay", "last")}), streamed);
    }

    // C3: one consumer overwrites its value, and the producer overwrites its
    // buffer after it returned. The other consumer still reads the value.
    {
      Messages isolated;
      const int size = 4096;
      run(runner, "c3", graph({node("source", "fixture.BlobSource", {{"size", size}, {"mutateLater", true}}),
                               node("writer", "fixture.BlobSink", {{"size", size}, {"mode", "mutate"}}),
                               node("reader", "fixture.BlobSink", {{"size", size}, {"mode", "isolated"}})},
                              {edge("source", "writer"), edge("source", "reader")}), isolated);
    }

    // C5: a stream of 48 frames of 1 MiB. The ledger holds a few frames at
    // a time, never the stream, and nothing after the run.
    {
      Messages frames;
      uint64_t peak = 0;
      frames.sample = [&] { peak = std::max(peak, ledger->usage().bytes); };
      run(runner, "c5-stream", graph({node("source", "fixture.FrameSource", {{"frames", 48}, {"size", kMiB}}),
                                      node("sink", "fixture.FrameSink", {{"frames", 48}, {"size", kMiB}})},
                                     {edge("source", "sink")}), frames);
      std::fprintf(stderr, "PT13 stream of 48 x 1 MiB: peak %llu bytes charged\n", static_cast<unsigned long long>(peak));
      require(peak >= kMiB, "C5: blob bytes are not charged to the admission ledger");
      require(peak <= 8 * kMiB, "C5: the stream's blobs pile up: " + std::to_string(peak) + " bytes charged");
      require(settledBytes(*ledger) == 0, "C5: bytes stay charged after the streaming run");
    }

    // PT13: 50 MB of bytes cross a fan-out of 4 edges. The edges share one
    // blob, so the ledger never holds two.
    {
      const uint64_t size = 50 * kMiB;
      Messages fanOut;
      uint64_t peak = 0;
      fanOut.sample = [&] { peak = std::max(peak, ledger->usage().bytes); };
      std::vector<Json> nodes{node("source", "fixture.BlobSource", {{"size", size}})};
      std::vector<Json> edges;
      for (int i = 0; i < 4; ++i) {
        const std::string id = "sink" + std::to_string(i);
        nodes.push_back(node(id, "fixture.BlobSink", {{"size", size}}));
        edges.push_back(edge("source", id));
      }
      const auto start = std::chrono::steady_clock::now();
      run(runner, "pt13", graph(std::move(nodes), std::move(edges)), fanOut);
      const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
      std::fprintf(stderr, "PT13 fan-out of 50 MiB of bytes to 4 edges: %lld ms, peak %llu bytes charged\n",
                   static_cast<long long>(ms), static_cast<unsigned long long>(peak));
      require(peak >= size, "PT13: the 50 MiB output did not travel as a blob");
      require(peak < 2 * size, "PT13: the fan-out holds more than one blob: " + std::to_string(peak));
      require(settledBytes(*ledger) == 0, "C5: bytes stay charged after the fan-out run");
    }
    // C5: an output that does not fit the run's byte limit fails its node
    // before the copy, and a later run of the same runner is not affected.
    {
      gr::HostOptions small;
      small.admissionLedger = gr::newAdmissionLedger();
      small.hostJobLimits.runBytes = 4 * kMiB;
      const auto smallLedger = small.admissionLedger;
      gr::GraphRunner limited(argv[1], small);
      if (!limited.waitUntilLoaded(120000)) throw std::runtime_error("guest load: " + limited.loadError());
      Messages over;
      limited.submit("over", "workflow", graph({node("source", "fixture.BlobSource", {{"size", 8 * kMiB}}),
                                                node("sink", "fixture.BlobSink", {{"size", 8 * kMiB}})},
                                               {edge("source", "sink")}), "{}", over.handler());
      over.wait();
      const Json last = Json::parse(over.terminal);
      std::fprintf(stderr, "PT13 output over the run limit: %s\n", last.value("error", std::string("no error")).c_str());
      require(last.value("status", std::string()) == "failed", "C5: an output over the run's byte limit did not fail the run");
      require(settledBytes(*smallLedger) == 0, "C5: bytes stay charged after the refused output");
      Messages under;
      run(limited, "under", graph({node("source", "fixture.BlobSource", {{"size", kMiB}}),
                                   node("sink", "fixture.BlobSink", {{"size", kMiB}})},
                                  {edge("source", "sink")}), under);
    }
    if (!failures().empty()) return 1;
    std::puts("blob value tests passed");
    return 0;
  } catch (const std::exception& e) {
    std::fprintf(stderr, "FAIL: %s\n", e.what());
    return 1;
  }
}
