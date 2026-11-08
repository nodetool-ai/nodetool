#include "nodetool/provider_jobs.h"
#include <algorithm>
#include <atomic>
#include <deque>
#include <iterator>
#include <map>
#include <mutex>
#include <nlohmann/json.hpp>
#include <optional>
#include <stdexcept>
#include <thread>
#include <utility>
namespace gr::host {
using Json = nlohmann::json;
using Outcome = ProviderJobs::Outcome;
using Completion = ProviderJobs::Completion;
namespace {
const std::vector<std::string> kMethods = {"callEndpoint", "uploadMedia",
                                           "downloadMedia"};
constexpr const char *kPendingNext = "Provider job already has a pending next()";
constexpr const char *kStoppedMessage = "Provider job was stopped";
constexpr const char *kClosedMessage = "Provider job was closed";

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

enum class JobState { Running, Finished, Failed, Stopped, Closed };

// What a worker thread may reach besides its job. It owns no thread and no
// job, so the last reference may drop on any thread.
struct Shared {
  ProviderJobs::Worker worker;
  ProviderJobs::Limits limits;
  // Workers that have not returned. Counts toward Limits::maxJobs.
  std::atomic<size_t> executing{0};
  // Job objects in memory.
  std::atomic<size_t> aliveJobs{0};
};

// One provider call. The registry, the worker thread and the progress
// callback share it, so none of them holds a raw pointer.
struct Job {
  Job(std::shared_ptr<Shared> shared, std::string provider, std::string run)
      : shared(std::move(shared)), provider(std::move(provider)), run(std::move(run)),
        partBytes(this->shared->limits.partBytes),
        maxEvents(this->shared->limits.maxQueuedEvents) {
    ++this->shared->aliveJobs;
  }
  ~Job() { --shared->aliveJobs; }
  Job(const Job &) = delete;
  Job &operator=(const Job &) = delete;

  const std::shared_ptr<Shared> shared;
  const std::string provider;
  const std::string run;
  const size_t partBytes;
  const size_t maxEvents;
  // Requested by stop() and close() outside `mutex`.
  std::stop_source stopSource;
  // Set by the worker thread as its last step, so the registry can join it
  // without waiting on the worker.
  std::atomic<bool> exited{false};

  std::mutex mutex;
  // Everything below is guarded by `mutex`.
  JobState state = JobState::Running;
  std::deque<std::string> events;
  // Finished: the result JSON text. Failed: the error message.
  std::string result;
  size_t resultOffset = 0;
  // The terminal result (done or error) was handed to a reader.
  bool terminalTaken = false;
  Completion waiter;

  // Takes the next item for a reader, or nothing while the job runs with an
  // empty queue. Stopped and Closed win over queued items. Then progress in
  // order, then result parts, then the terminal result, which stays the
  // answer once taken. Caller holds `mutex`.
  std::optional<Outcome> takeLocked() {
    if (state == JobState::Stopped)
      return Outcome{Outcome::Kind::Stopped, kStoppedMessage};
    if (state == JobState::Closed)
      return Outcome{Outcome::Kind::Stopped, kClosedMessage};
    if (!events.empty()) {
      auto event = std::move(events.front());
      events.pop_front();
      return Outcome{Outcome::Kind::Value, R"({"state":"progress","event":)" + event + "}"};
    }
    if (state == JobState::Running)
      return std::nullopt;
    if (state == JobState::Failed) {
      terminalTaken = true;
      return Outcome{Outcome::Kind::Error, result};
    }
    if (resultOffset == 0 && result.size() <= partBytes) {
      terminalTaken = true;
      return Outcome{Outcome::Kind::Value, R"({"state":"done","value":)" + result + "}"};
    }
    if (resultOffset < result.size()) {
      const auto length = partLength(result, resultOffset, partBytes);
      auto data = result.substr(resultOffset, length);
      resultOffset += length;
      return Outcome{Outcome::Kind::Value,
                     Json{{"state", "part"}, {"data", std::move(data)}}.dump()};
    }
    terminalTaken = true;
    return Outcome{Outcome::Kind::Value, R"({"state":"done"})"};
  }

  // Producer side. Late output after stop or close is ignored. A waiting
  // next() is moved out under the mutex and completed outside it.
  void progress(std::string event) {
    Completion ready;
    std::string answer;
    {
      std::lock_guard lock(mutex);
      if (state != JobState::Running)
        return;
      if (waiter) {
        ready = std::move(waiter);
        answer = R"({"state":"progress","event":)" + event + "}";
      } else {
        if (events.size() >= maxEvents)
          events.pop_front();
        events.push_back(std::move(event));
      }
    }
    if (ready)
      std::move(ready)(Outcome{Outcome::Kind::Value, std::move(answer)});
  }

  void finish(bool succeeded, std::string text) {
    Completion ready;
    std::optional<Outcome> outcome;
    {
      std::lock_guard lock(mutex);
      if (state != JobState::Running)
        return;
      state = succeeded ? JobState::Finished : JobState::Failed;
      result = std::move(text);
      // A waiter implies an empty queue, so it gets the first result part or
      // the terminal result.
      if (waiter) {
        ready = std::move(waiter);
        outcome = takeLocked();
      }
    }
    if (ready)
      std::move(ready)(std::move(*outcome));
  }

  // Stop side, shared by stop(), close() and the destructor. Drops queued
  // output, moves the waiter out under the mutex, then requests stop and
  // completes the waiter outside it. A taken terminal result survives stop
  // but not close.
  void cancel(bool closing) {
    Completion stopped;
    {
      std::lock_guard lock(mutex);
      const bool terminal = state == JobState::Stopped || state == JobState::Closed;
      if (closing && state != JobState::Closed)
        state = JobState::Closed;
      else if (!closing && !terminal && !terminalTaken)
        state = JobState::Stopped;
      if (state == JobState::Stopped || state == JobState::Closed) {
        events.clear();
        std::string().swap(result);
        stopped = std::move(waiter);
      }
    }
    stopSource.request_stop();
    if (stopped)
      std::move(stopped)(
          Outcome{Outcome::Kind::Stopped, closing ? kClosedMessage : kStoppedMessage});
  }
};

// One unit of Limits::maxJobs, held by a worker until it returns.
class ExecutionTicket {
public:
  explicit ExecutionTicket(std::shared_ptr<Shared> shared) : shared_(std::move(shared)) {
    ++shared_->executing;
  }
  ExecutionTicket(ExecutionTicket &&other) noexcept = default;
  ExecutionTicket &operator=(ExecutionTicket &&) = delete;
  ~ExecutionTicket() { release(); }
  void release() {
    if (auto shared = std::move(shared_))
      --shared->executing;
  }

private:
  std::shared_ptr<Shared> shared_;
};
} // namespace

struct ProviderJobs::State {
  struct Runner {
    std::shared_ptr<Job> job;
    std::jthread thread;
  };

  std::shared_ptr<Shared> shared = std::make_shared<Shared>();
  std::mutex mutex;
  // Everything below is guarded by `mutex`.
  bool shutdown = false;
  // Live jobs and the tombstones of stopped and closed ones, until their run
  // is retired.
  std::map<std::string, std::shared_ptr<Job>> jobs;
  // Worker threads not yet joined.
  std::vector<Runner> runners;
  struct Upload {
    std::string provider, run, data;
  };
  std::map<std::string, Upload> uploads;
  uint64_t nextId = 0;

  ~State() { stopAll(); }

  void stopAll() {
    std::vector<std::shared_ptr<Job>> all;
    std::vector<Runner> joining;
    {
      std::lock_guard lock(mutex);
      shutdown = true;
      uploads.clear();
      for (auto &[id, job] : jobs)
        all.push_back(job);
      joining.swap(runners);
    }
    for (auto &job : all)
      job->cancel(false);
    // Destroying each jthread joins it.
    joining.clear();
  }

  // Moves out runners whose worker has returned, so the caller joins them
  // after releasing `mutex`. Caller holds `mutex`.
  std::vector<Runner> takeExitedLocked() {
    std::vector<Runner> exited;
    auto keep = std::partition(runners.begin(), runners.end(), [](const Runner &runner) {
      return !runner.job->exited.load(std::memory_order_acquire);
    });
    std::move(keep, runners.end(), std::back_inserter(exited));
    runners.erase(keep, runners.end());
    return exited;
  }

  void reapExited() {
    std::vector<Runner> exited;
    {
      std::lock_guard lock(mutex);
      exited = takeExitedLocked();
    }
  }

  // Looks the job up under the registry mutex and releases it before the
  // caller takes the job mutex.
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
    const auto run = request.value("run", std::string());
    std::lock_guard lock(mutex);
    if (shutdown)
      throw std::runtime_error("Provider jobs are shut down");
    std::string id;
    if (request.contains("upload") && !request.at("upload").is_null()) {
      id = request.at("upload").get<std::string>();
      auto found = uploads.find(id);
      if (found == uploads.end() || found->second.provider != provider ||
          found->second.run != run)
        throw std::runtime_error("Unknown provider upload: " + id);
      if (found->second.data.size() + data.size() > shared->limits.maxRequestBytes)
        throw std::runtime_error("Provider request is too large");
      found->second.data += data;
    } else {
      id = "u" + std::to_string(++nextId);
      uploads[id] = {provider, run, data};
    }
    return Json{{"upload", id}}.dump();
  }

  std::string start(const std::string &provider, const std::string &payload) {
    const auto request = Json::parse(payload);
    const auto method = request.at("method").get<std::string>();
    if (std::find(kMethods.begin(), kMethods.end(), method) == kMethods.end())
      throw std::runtime_error("Unknown provider job method: " + method);
    const auto &limits = shared->limits;
    auto job = std::make_shared<Job>(shared, provider, request.value("run", std::string()));
    // Declared before the lock, so reaped threads are joined after it is
    // released.
    std::vector<Runner> exited;
    std::lock_guard lock(mutex);
    if (shutdown)
      throw std::runtime_error("Provider jobs are shut down");
    exited = takeExitedLocked();
    std::string args;
    if (request.contains("upload")) {
      const auto upload = request.at("upload").get<std::string>();
      auto found = uploads.find(upload);
      if (found == uploads.end() || found->second.provider != provider ||
          found->second.run != job->run)
        throw std::runtime_error("Unknown provider upload: " + upload);
      args = std::move(found->second.data);
      uploads.erase(found);
    } else {
      args = request.value("args", Json::object()).dump();
    }
    // Workers only decrement the count, so checking and taking a ticket under
    // the registry mutex cannot admit more than maxJobs.
    if (shared->executing.load() >= limits.maxJobs)
      throw std::runtime_error("Too many provider jobs are running");
    ExecutionTicket ticket(shared);

    Call call;
    call.provider = provider;
    call.run = job->run;
    call.method = method;
    call.argsJson = std::move(args);
    std::weak_ptr<Job> weak = job;
    call.progress = [weak](const std::string &eventJson) {
      // Validate here, so a malformed event fails the worker, not the guest.
      auto event = Json::parse(eventJson).dump();
      if (auto target = weak.lock())
        target->progress(std::move(event));
    };
    call.stop = job->stopSource.get_token();
    call.cancelled = [token = call.stop] { return token.stop_requested(); };

    // The thread starts under the registry mutex, so stopAll() either sees
    // it in `runners` or start() sees `shutdown`. The worker never takes the
    // registry mutex. Reserving first keeps the push_back below from throwing
    // with a running thread in hand.
    runners.reserve(runners.size() + 1);
    const auto id = "j" + std::to_string(++nextId);
    jobs[id] = job;
    try {
      std::jthread thread([job, shared = shared, ticket = std::move(ticket),
                           call = std::move(call)]() mutable {
        std::string text;
        bool succeeded = false;
        try {
          text = Json::parse(shared->worker(call)).dump();
          succeeded = true;
        } catch (const std::exception &e) {
          text = e.what();
        } catch (...) {
        }
        if (!succeeded && text.empty())
          text = "Provider job failed";
        job->finish(succeeded, std::move(text));
        ticket.release();
        job->exited.store(true, std::memory_order_release);
      });
      runners.push_back({job, std::move(thread)});
    } catch (...) {
      jobs.erase(id);
      throw;
    }
    return Json{{"job", id}}.dump();
  }

  std::string poll(const std::string &provider, const std::string &payload) {
    auto job = find(provider, Json::parse(payload));
    std::lock_guard lock(job->mutex);
    auto outcome = job->takeLocked();
    if (!outcome)
      return R"({"state":"pending"})";
    if (outcome->kind == Outcome::Kind::Value)
      return std::move(outcome->text);
    // The current guest knows "error" but not "stopped".
    return Json{{"state", "error"}, {"message", std::move(outcome->text)}}.dump();
  }

  void next(const std::string &provider, const std::string &payload, Completion done) {
    std::optional<Outcome> ready;
    try {
      auto job = find(provider, Json::parse(payload));
      std::lock_guard lock(job->mutex);
      ready = job->takeLocked();
      if (!ready) {
        if (job->waiter)
          ready = Outcome{Outcome::Kind::Error, kPendingNext};
        else
          job->waiter = std::move(done);
      }
    } catch (const std::exception &e) {
      ready = Outcome{Outcome::Kind::Error, e.what()};
    }
    if (ready)
      std::move(done)(std::move(*ready));
  }

  void stop(const std::string &provider, const std::string &payload) {
    const auto id = Json::parse(payload).at("job").get<std::string>();
    std::shared_ptr<Job> job;
    {
      std::lock_guard lock(mutex);
      auto found = jobs.find(id);
      if (found == jobs.end() || found->second->provider != provider)
        return;
      job = found->second;
    }
    job->cancel(false);
  }

  void retireRun(const std::string &run) {
    std::vector<std::shared_ptr<Job>> retired;
    std::vector<Runner> exited;
    {
      std::lock_guard lock(mutex);
      for (auto it = jobs.begin(); it != jobs.end();) {
        if (it->second->run == run) {
          retired.push_back(std::move(it->second));
          it = jobs.erase(it);
        } else {
          ++it;
        }
      }
      std::erase_if(uploads, [&](const auto &entry) { return entry.second.run == run; });
      exited = takeExitedLocked();
    }
    // A running worker holds its own reference and is joined once it
    // returns, by a later start(), close(), retireRun() or stats().
    for (auto &job : retired)
      job->cancel(true);
  }

  ProviderJobs::Stats stats() {
    std::vector<Runner> exited;
    ProviderJobs::Stats counts;
    {
      std::lock_guard lock(mutex);
      exited = takeExitedLocked();
      counts.registered = jobs.size();
    }
    exited.clear();
    counts.executing = shared->executing.load();
    counts.alive = shared->aliveJobs.load();
    return counts;
  }

  std::string close(const std::string &provider, const std::string &payload) {
    const auto id = Json::parse(payload).at("job").get<std::string>();
    std::shared_ptr<Job> job;
    {
      std::lock_guard lock(mutex);
      auto found = jobs.find(id);
      if (found == jobs.end() || found->second->provider != provider)
        return "null";
      job = found->second;
    }
    // The worker keeps its maxJobs ticket until it returns. The thread is
    // joined later by start(), close() or the destructor.
    job->cancel(true);
    reapExited();
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
  if (limits.maxQueuedEvents == 0)
    throw std::invalid_argument("ProviderJobs must queue at least one event");
  state_->shared->worker = std::move(worker);
  state_->shared->limits = limits;
}

ProviderJobs::~ProviderJobs() { state_->stopAll(); }

void ProviderJobs::grant(ContextOptions &options,
                         const std::vector<std::string> &providers) {
  // Weak, so the grants keep no job or tombstone alive after this object.
  const std::weak_ptr<State> weak = state_;
  const auto live = [weak] {
    auto state = weak.lock();
    if (!state)
      throw std::runtime_error("Provider jobs are shut down");
    return state;
  };
  for (const auto &provider : providers) {
    const auto prefix = "provider:" + provider + ":jobs:";
    options.operations[prefix + "put"] = [live, provider](const std::string &p) {
      return live()->put(provider, p);
    };
    options.operations[prefix + "start"] = [live, provider](const std::string &p) {
      return live()->start(provider, p);
    };
    options.operations[prefix + "poll"] = [live, provider](const std::string &p) {
      return live()->poll(provider, p);
    };
    options.operations[prefix + "close"] = [weak, provider](const std::string &p) {
      auto state = weak.lock();
      return state ? state->close(provider, p) : std::string("null");
    };
  }
}

void ProviderJobs::next(const std::string &provider, const std::string &payload,
                        Completion done) {
  state_->next(provider, payload, std::move(done));
}

void ProviderJobs::stop(const std::string &provider, const std::string &payload) {
  state_->stop(provider, payload);
}

void ProviderJobs::retireRun(const std::string &run) { state_->retireRun(run); }

ProviderJobs::Stats ProviderJobs::stats() { return state_->stats(); }
} // namespace gr::host
