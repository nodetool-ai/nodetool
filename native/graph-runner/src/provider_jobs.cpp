#include "nodetool/provider_jobs.h"
#include <algorithm>
#include <atomic>
#include <deque>
#include <map>
#include <mutex>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <thread>
#include <utility>
namespace gr::host {
using Json = nlohmann::json;
namespace {
const std::vector<std::string> kMethods = {"callEndpoint", "uploadMedia",
                                           "downloadMedia"};

// The longest prefix of `text` from `offset` that is at most `limit` bytes
// and does not split a UTF-8 sequence.
size_t partLength(const std::string &text, size_t offset, size_t limit) {
  size_t length = std::min(limit, text.size() - offset);
  while (length > 0 && offset + length < text.size() &&
         (static_cast<unsigned char>(text[offset + length]) & 0xC0) == 0x80)
    --length;
  if (length == 0)
    throw std::runtime_error("Provider job part size is too small");
  return length;
}
} // namespace

struct ProviderJobs::State {
  struct Job {
    std::string provider;
    std::thread thread;
    std::atomic<bool> cancel{false};
    std::mutex mutex;
    std::deque<std::string> events;
    bool finished = false;
    std::string result, error;
    size_t resultOffset = 0;
  };

  Worker worker;
  Limits limits;
  std::mutex mutex;
  std::atomic<bool> shutdown{false};
  std::map<std::string, std::shared_ptr<Job>> jobs;
  std::map<std::string, std::pair<std::string, std::string>> uploads;
  uint64_t nextId = 0;

  ~State() { stopAll(); }

  void stopAll() {
    shutdown = true;
    std::map<std::string, std::shared_ptr<Job>> running;
    {
      std::lock_guard lock(mutex);
      running.swap(jobs);
      uploads.clear();
    }
    for (auto &[id, job] : running) {
      job->cancel = true;
      if (job->thread.joinable())
        job->thread.join();
    }
  }

  std::shared_ptr<Job> find(const std::string &provider, const Json &request) {
    const auto id = request.at("job").get<std::string>();
    std::lock_guard lock(mutex);
    auto found = jobs.find(id);
    if (found == jobs.end() || found->second->provider != provider)
      throw std::runtime_error("Unknown provider job: " + id);
    return found->second;
  }

  std::string put(const std::string &provider, const std::string &payload) {
    const auto request = Json::parse(payload);
    const auto data = request.at("data").get<std::string>();
    std::lock_guard lock(mutex);
    std::string id;
    if (request.contains("upload") && !request.at("upload").is_null()) {
      id = request.at("upload").get<std::string>();
      auto found = uploads.find(id);
      if (found == uploads.end() || found->second.first != provider)
        throw std::runtime_error("Unknown provider upload: " + id);
      if (found->second.second.size() + data.size() > limits.maxRequestBytes)
        throw std::runtime_error("Provider request is too large");
      found->second.second += data;
    } else {
      id = "u" + std::to_string(++nextId);
      uploads[id] = {provider, data};
    }
    return Json{{"upload", id}}.dump();
  }

  std::string start(const std::string &provider, const std::string &payload) {
    if (shutdown)
      throw std::runtime_error("Provider jobs are shut down");
    const auto request = Json::parse(payload);
    const auto method = request.at("method").get<std::string>();
    if (std::find(kMethods.begin(), kMethods.end(), method) == kMethods.end())
      throw std::runtime_error("Unknown provider job method: " + method);
    std::string args;
    auto job = std::make_shared<Job>();
    job->provider = provider;
    std::string id;
    {
      std::lock_guard lock(mutex);
      if (request.contains("upload")) {
        const auto upload = request.at("upload").get<std::string>();
        auto found = uploads.find(upload);
        if (found == uploads.end() || found->second.first != provider)
          throw std::runtime_error("Unknown provider upload: " + upload);
        args = std::move(found->second.second);
        uploads.erase(found);
      } else {
        args = request.value("args", Json::object()).dump();
      }
      size_t running = 0;
      for (const auto &[jobId, existing] : jobs) {
        std::lock_guard jobLock(existing->mutex);
        if (!existing->finished)
          ++running;
      }
      if (running >= limits.maxJobs)
        throw std::runtime_error("Too many provider jobs are running");
      id = "j" + std::to_string(++nextId);
      jobs[id] = job;
    }
    Call call;
    call.provider = provider;
    call.method = method;
    call.argsJson = std::move(args);
    const size_t maxEvents = limits.maxQueuedEvents;
    std::weak_ptr<Job> weak = job;
    call.progress = [weak, maxEvents](const std::string &eventJson) {
      auto target = weak.lock();
      if (!target)
        return;
      // Validate here, so a malformed event fails the worker, not the guest.
      auto event = Json::parse(eventJson).dump();
      std::lock_guard lock(target->mutex);
      if (target->events.size() >= maxEvents)
        target->events.pop_front();
      target->events.push_back(std::move(event));
    };
    Job *raw = job.get();
    call.cancelled = [raw] { return raw->cancel.load(); };
    job->thread = std::thread([this, raw, call = std::move(call)] {
      std::string result, error;
      try {
        result = Json::parse(worker(call)).dump();
      } catch (const std::exception &e) {
        error = e.what();
      } catch (...) {
        error = "Provider job failed";
      }
      std::lock_guard lock(raw->mutex);
      raw->result = std::move(result);
      raw->error = std::move(error);
      raw->finished = true;
    });
    return Json{{"job", id}}.dump();
  }

  std::string poll(const std::string &provider, const std::string &payload) {
    auto job = find(provider, Json::parse(payload));
    std::lock_guard lock(job->mutex);
    if (!job->events.empty()) {
      auto event = std::move(job->events.front());
      job->events.pop_front();
      return R"({"state":"progress","event":)" + event + "}";
    }
    if (!job->finished)
      return R"({"state":"pending"})";
    if (!job->error.empty())
      return Json{{"state", "error"}, {"message", job->error}}.dump();
    if (job->result.size() <= limits.partBytes && job->resultOffset == 0) {
      return R"({"state":"done","value":)" + job->result + "}";
    }
    if (job->resultOffset < job->result.size()) {
      const auto length =
          partLength(job->result, job->resultOffset, limits.partBytes);
      auto data = job->result.substr(job->resultOffset, length);
      job->resultOffset += length;
      return Json{{"state", "part"}, {"data", std::move(data)}}.dump();
    }
    return R"({"state":"done"})";
  }

  std::string close(const std::string &provider, const std::string &payload) {
    const auto request = Json::parse(payload);
    const auto id = request.at("job").get<std::string>();
    std::shared_ptr<Job> job;
    {
      std::lock_guard lock(mutex);
      auto found = jobs.find(id);
      if (found == jobs.end() || found->second->provider != provider)
        return "null";
      job = found->second;
      jobs.erase(found);
    }
    job->cancel = true;
    // The worker is expected to notice cancelled() promptly. Joining keeps
    // threads from outliving their job.
    if (job->thread.joinable())
      job->thread.join();
    return "null";
  }
};

ProviderJobs::ProviderJobs(Worker worker) : ProviderJobs(std::move(worker), Limits{}) {}

ProviderJobs::ProviderJobs(Worker worker, Limits limits)
    : state_(std::make_shared<State>()) {
  if (!worker)
    throw std::invalid_argument("ProviderJobs requires a worker");
  if (limits.partBytes < 16)
    throw std::invalid_argument("ProviderJobs part size is too small");
  state_->worker = std::move(worker);
  state_->limits = limits;
}

ProviderJobs::~ProviderJobs() { state_->stopAll(); }

void ProviderJobs::grant(ContextOptions &options,
                         const std::vector<std::string> &providers) {
  for (const auto &provider : providers) {
    const auto prefix = "provider:" + provider + ":jobs:";
    std::shared_ptr<State> state = state_;
    options.operations[prefix + "put"] = [state, provider](const std::string &p) {
      return state->put(provider, p);
    };
    options.operations[prefix + "start"] = [state, provider](const std::string &p) {
      return state->start(provider, p);
    };
    options.operations[prefix + "poll"] = [state, provider](const std::string &p) {
      return state->poll(provider, p);
    };
    options.operations[prefix + "close"] = [state, provider](const std::string &p) {
      return state->close(provider, p);
    };
  }
}
} // namespace gr::host
