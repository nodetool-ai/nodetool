#include "nodetool/provider_jobs.h"
#include "host/provider_job_grants.h"
#include "kernel/async_jobs.h"
#include "kernel/host_lanes.h"
#include "nodetool/jobs/admission.h"
#include <algorithm>
#include <atomic>
#include <deque>
#include <map>
#include <mutex>
#include <nlohmann/json.hpp>
#include <optional>
#include <stdexcept>
#include <string_view>
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
constexpr const char *kNotRun = "Provider job was cancelled before it ran";
constexpr const char *kShutDown = "Provider jobs are shut down";

constexpr const char *kNoRun = "Provider jobs need a run in progress";

// The envelope next() wraps a progress event in.
constexpr std::string_view kProgressOpen = R"({"state":"progress","event":)";
constexpr std::string_view kProgressClose = "}";
// The bytes a progress event of `size` bytes takes once wrapped.
constexpr size_t progressBytes(size_t size) { return kProgressOpen.size() + size + kProgressClose.size(); }

// Refuses a call outside a run, and a request that names a run other than
// the caller's. The guest no longer names the run: the host stamps it.
void checkRun(const Json &request, const RunIdentity &run) {
  if (!run)
    throw std::runtime_error(kNoRun);
  const auto named = request.find("run");
  if (named != request.end() &&
      !(named->is_string() && named->get<std::string>() == run->jobId))
    throw std::runtime_error("Provider job requests cannot name another run");
}

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

// What a worker may reach besides its job. It owns no thread and no job, so
// the last reference may drop on any thread.
//
// Thread affinity: thread-safe. `worker` and `limits` are set before the
// first job and immutable after, the counters are atomic.
struct Shared {
  ProviderJobs::Worker worker;
  ProviderJobs::Limits limits;
  // Workers that have not returned, queued ones included. Counts toward
  // Limits::maxJobs.
  std::atomic<size_t> executing{0};
  // Job objects in memory.
  std::atomic<size_t> aliveJobs{0};
};

// One provider call. The registry, the lane job running the worker and the
// progress callback share it, so none of them holds a raw pointer.
//
// Thread affinity: thread-safe. `mutex` guards the state fields below it.
// The stop source is thread-safe and requested outside `mutex`.
struct Job {
  Job(std::shared_ptr<Shared> shared, std::string provider, RunIdentity run)
      : shared(std::move(shared)), provider(std::move(provider)), run(std::move(run)),
        partBytes(this->shared->limits.partBytes),
        maxEvents(this->shared->limits.maxQueuedEvents),
        outputCap(this->shared->limits.maxResultBytes) {
    ++this->shared->aliveJobs;
  }
  ~Job() { --shared->aliveJobs; }
  Job(const Job &) = delete;
  Job &operator=(const Job &) = delete;

  const std::shared_ptr<Shared> shared;
  const std::string provider;
  // Keeps the run's tag alive, so its address names no other run meanwhile.
  const RunIdentity run;
  const size_t partBytes;
  const size_t maxEvents;
  // The output bytes the job's reservation holds: the most its result and
  // queued events may keep together.
  const size_t outputCap;
  // Requested by stop() and close() outside `mutex`. The lane forwards it to
  // the running worker's token through its reaper.
  std::stop_source stopSource;

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
  // Bytes of `events`.
  size_t eventBytes = 0;
  // A reference to the job's admission charge, shared with the lane job
  // running the worker. Dropped, outside `mutex`, when the job's data is.
  nodetool::jobs::Reservation reservation;

  // Caller holds `mutex`. Drops the oldest events until `incoming` more
  // bytes fit the output cap with the result.
  void makeRoomLocked(size_t incoming) {
    while (!events.empty() && eventBytes + result.size() + incoming > outputCap) {
      eventBytes -= events.front().size();
      events.pop_front();
    }
  }

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
      eventBytes -= event.size();
      return Outcome{Outcome::Kind::Value, std::string(kProgressOpen) + event + std::string(kProgressClose)};
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
      // The output cap holds before the event is kept or wrapped for a
      // waiting reader: an event that does not fit it with its envelope is
      // dropped.
      if (progressBytes(event.size()) > outputCap)
        return;
      if (waiter) {
        ready = std::move(waiter);
        answer = std::string(kProgressOpen) + event + std::string(kProgressClose);
      } else {
        // Older events make room for this one.
        if (events.size() >= maxEvents) {
          eventBytes -= events.front().size();
          events.pop_front();
        }
        makeRoomLocked(event.size());
        eventBytes += event.size();
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
      // The output cap holds before the result is kept.
      if (text.size() > outputCap) {
        const auto size = text.size();
        std::string().swap(text);
        if (succeeded) {
          succeeded = false;
          text = "Provider job result of " + std::to_string(size) + " bytes exceeds its reserved " +
                 std::to_string(outputCap) + " bytes";
        }
        if (text.size() > outputCap)
          text = "Provider job failed";
      }
      makeRoomLocked(text.size());
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
    // Released after the mutex, with the data it charged.
    nodetool::jobs::Reservation released;
    {
      std::lock_guard lock(mutex);
      const bool terminal = state == JobState::Stopped || state == JobState::Closed;
      if (closing && state != JobState::Closed)
        state = JobState::Closed;
      else if (!closing && !terminal && !terminalTaken)
        state = JobState::Stopped;
      if (state == JobState::Stopped || state == JobState::Closed) {
        events.clear();
        eventBytes = 0;
        std::string().swap(result);
        stopped = std::move(waiter);
        released = std::move(reservation);
      }
    }
    released = {};
    stopSource.request_stop();
    if (stopped)
      std::move(stopped)(
          Outcome{Outcome::Kind::Stopped, closing ? kClosedMessage : kStoppedMessage});
  }
};

// One unit of Limits::maxJobs, held from start() until the worker returns
// or its lane job is destroyed unrun.
//
// Thread affinity: one thread at a time. The count it changes is atomic.
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

// Runs one provider call on a lane thread. The lane's stop token reaches
// the worker as Call::stop, so the worker's stop callbacks run where the lane
// requests stop: on its reaper thread.
//
// Thread affinity: the lane thread that runs it, then the thread that
// destroys it (that lane thread or the lane's reaper). A refused job is told
// on the refusing thread, then destroyed on the process disposer, after the
// disposer's queue handed it over. One thread at a time.
class ProviderCall final : public nodetool::jobs::NativeJob {
public:
  ProviderCall(std::shared_ptr<Job> job, std::shared_ptr<Shared> shared,
               ExecutionTicket ticket, std::string method, std::string args,
               nodetool::jobs::Reservation reservation)
      : job_(std::move(job)), shared_(std::move(shared)),
        ticket_(std::move(ticket)), reservation_(std::move(reservation)),
        method_(std::move(method)), args_(std::move(args)) {}
  ProviderCall(const ProviderCall &) = delete;
  ProviderCall &operator=(const ProviderCall &) = delete;
  // A job destroyed unrun fails, so a waiter still hears from it, unless
  // refused() already failed it. A stopped or closed job ignores that. The
  // ticket goes after, with the members.
  ~ProviderCall() override {
    if (!ran_ && !reported_)
      job_->finish(false, kNotRun);
  }

  // The lane refused the job: fail it now, waking its waiter, instead of
  // when the disposer gets to destroying it.
  void refused(const nodetool::jobs::JobOutcome &outcome) override {
    reported_ = true;
    job_->finish(false, outcome.error.empty() ? std::string(kNotRun) : outcome.error);
  }

  nodetool::jobs::JobOutcome run(std::stop_token stop) override {
    ran_ = true;
    ProviderJobs::Call call;
    call.provider = job_->provider;
    call.run = job_->run->jobId;
    call.method = std::move(method_);
    call.argsJson = std::move(args_);
    std::weak_ptr<Job> weak = job_;
    call.progress = [weak, cap = job_->outputCap](const std::string &eventJson) {
      // An event that cannot fit the output cap is dropped before it is
      // parsed. progress() checks again after the canonical dump.
      if (progressBytes(eventJson.size()) > cap)
        return;
      // Validate here, so a malformed event fails the worker, not the guest.
      auto event = Json::parse(eventJson).dump();
      if (auto target = weak.lock())
        target->progress(std::move(event));
    };
    call.cancelled = [jobStop = job_->stopSource.get_token(), stop] {
      return jobStop.stop_requested() || stop.stop_requested();
    };
    call.stop = std::move(stop);
    std::string text;
    bool succeeded = false;
    try {
      text = Json::parse(shared_->worker(call)).dump();
      succeeded = true;
    } catch (const std::exception &e) {
      text = e.what();
    } catch (...) {
    }
    if (!succeeded && text.empty())
      text = "Provider job failed";
    job_->finish(succeeded, std::move(text));
    ticket_.release();
    // Nothing reads it: the job is detached from every run mailbox, and the
    // waiter heard from finish().
    return nodetool::jobs::JobOutcome::value(nullptr);
  }

private:
  const std::shared_ptr<Job> job_;
  const std::shared_ptr<Shared> shared_;
  ExecutionTicket ticket_;
  // The job's admission charge while the worker may still use its request
  // and produce output. Declared before the request, so it is released
  // after it.
  nodetool::jobs::Reservation reservation_;
  std::string method_;
  std::string args_;
  bool ran_ = false;
  bool reported_ = false;
};

// Forwards one outcome of next() to the context call that asked for it. A
// stopped or closed job answers {"state":"stopped"}, which the guest turns
// into an AbortError. Meets Completion's contract: noexcept, callable once
// from any thread, and safe after the run's mailbox closed, which
// ContextCompletion guarantees.
Completion toContext(ContextCompletion done) {
  return [done = std::move(done)](Outcome outcome) mutable noexcept {
    try {
      switch (outcome.kind) {
      case Outcome::Kind::Value:
        done(ContextResult::value(std::move(outcome.text)));
        break;
      case Outcome::Kind::Error:
        done(ContextResult::error(std::move(outcome.text)));
        break;
      case Outcome::Kind::Stopped:
        done(ContextResult::value(
            Json{{"state", "stopped"}, {"message", std::move(outcome.text)}}.dump()));
        break;
      }
    } catch (...) {
      // Only allocation throws here. A `done` still uncalled fails the call
      // with an Error when this callback is destroyed.
    }
  };
}
} // namespace

// The registry behind one ProviderJobs. Owned by it, and locked weakly by the
// grants for the length of a call.
//
// Thread affinity: thread-safe. `mutex` guards the fields below it, and is
// never held while a job mutex is taken, a completion runs, stop is
// requested or a lane job is submitted.
struct ProviderJobs::State {
  std::shared_ptr<Shared> shared = std::make_shared<Shared>();
  std::mutex mutex;
  // Everything below is guarded by `mutex`.
  bool shutdown = false;
  // Where workers run, borrowed and attached to. Null until the first
  // start() on the process lanes, whose owner `processLanes` keeps them.
  nodetool::jobs::JobExecutor *lane = nullptr;
  std::shared_ptr<gr::HostLanes> processLanes;
  // Live jobs and the tombstones of stopped and closed ones, until their run
  // is retired.
  std::map<std::string, std::shared_ptr<Job>> jobs;
  struct Upload {
    std::string provider;
    RunIdentity run;
    std::string data;
    // The charge of each appended part, taken before it was appended.
    std::vector<nodetool::jobs::Reservation> reserved;
  };
  std::map<std::string, Upload> uploads;
  uint64_t nextId = 0;
  // For runs whose identity carries no admission account: a runner account
  // on a private ledger with the default limits, created on first use, and
  // one run account per run until it is retired.
  std::shared_ptr<nodetool::jobs::RunnerAccount> fallbackRunner;
  std::map<RunIdentity, std::shared_ptr<nodetool::jobs::RunAccount>>
      fallbackRuns;

  ~State() {
    stopAll();
    if (lane)
      lane->detach();
  }

  // Stops every job outside `mutex`, without waiting for workers.
  void stopAll() {
    std::vector<std::shared_ptr<Job>> all;
    // Released after the mutex, with their charges.
    std::map<std::string, Upload> dropped;
    std::map<RunIdentity, std::shared_ptr<nodetool::jobs::RunAccount>> accounts;
    {
      std::lock_guard lock(mutex);
      shutdown = true;
      dropped.swap(uploads);
      accounts.swap(fallbackRuns);
      for (auto &[id, job] : jobs)
        all.push_back(job);
    }
    for (auto &job : all)
      job->cancel(false);
  }

  // The lane workers run on. Caller holds `mutex`, which nests the process
  // lanes' own mutex and the lane's mutex (leaves) on the first call.
  nodetool::jobs::JobExecutor &laneLocked() {
    if (!lane) {
      processLanes = gr::processHostLanes({});
      lane = &processLanes->network();
      lane->attach();
    }
    return *lane;
  }

  // Looks the job up under the registry mutex and releases it before the
  // caller takes the job mutex. With `run`, a job of another run is unknown.
  std::shared_ptr<Job> find(const std::string &provider, const RunTag *run, const Json &request) {
    const auto id = request.at("job").get<std::string>();
    std::lock_guard lock(mutex);
    auto found = jobs.find(id);
    if (found == jobs.end() || found->second->provider != provider ||
        (run && found->second->run.get() != run))
      throw std::runtime_error("Unknown provider job: " + id);
    return found->second;
  }

  // The admission account of `run`. Accounts are opened outside `mutex`.
  std::shared_ptr<nodetool::jobs::RunAccount>
  accountFor(const RunIdentity &run) {
    if (run && run->account)
      return run->account;
    std::shared_ptr<nodetool::jobs::RunnerAccount> runner;
    {
      std::lock_guard lock(mutex);
      if (auto found = fallbackRuns.find(run); found != fallbackRuns.end())
        return found->second;
      runner = fallbackRunner;
    }
    if (!runner) {
      // The first published runner wins, before any run account is opened
      // on it, so every fallback run shares one private ledger. A losing
      // runner is released after the mutex.
      auto created =
          std::make_shared<nodetool::jobs::AdmissionLedger>()->openRunner();
      std::lock_guard lock(mutex);
      if (!fallbackRunner)
        fallbackRunner = std::move(created);
      runner = fallbackRunner;
    }
    // Released after the mutex when another thread opened one for this run
    // first.
    auto made = runner->openRun();
    std::lock_guard lock(mutex);
    return fallbackRuns.try_emplace(run, std::move(made)).first->second;
  }

  std::string put(const std::string &provider, const RunIdentity &run,
                  const std::string &payload) {
    const auto request = Json::parse(payload);
    checkRun(request, run);
    const auto data = request.at("data").get<std::string>();
    // Charged before it is appended, and released, outside the mutex, if
    // the append fails.
    nodetool::jobs::Reservation part(accountFor(run));
    part.reserveSnapshot(data.size());
    // Only a start or the run's retirement releases it.
    part.retain();
    std::lock_guard lock(mutex);
    if (shutdown)
      throw std::runtime_error(kShutDown);
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
      found->second.reserved.push_back(std::move(part));
    } else {
      id = "u" + std::to_string(++nextId);
      Upload upload{provider, run, data, {}};
      upload.reserved.push_back(std::move(part));
      uploads[id] = std::move(upload);
    }
    return Json{{"upload", id}}.dump();
  }

  std::string start(const std::string &provider, const RunIdentity &run,
                    const std::string &payload) {
    const auto request = Json::parse(payload);
    checkRun(request, run);
    const auto method = request.at("method").get<std::string>();
    if (std::find(kMethods.begin(), kMethods.end(), method) == kMethods.end())
      throw std::runtime_error("Unknown provider job method: " + method);
    const auto &limits = shared->limits;
    auto job = std::make_shared<Job>(shared, provider, run);
    const auto account = accountFor(run);
    std::unique_ptr<ProviderCall> call;
    nodetool::jobs::JobExecutor *target = nullptr;
    std::string id;
    std::string args;
    // An upload stays registered until every check passed, so a start that
    // fails leaves it for a later start.
    const std::optional<std::string> upload =
        request.contains("upload") ? std::optional(request.at("upload").get<std::string>()) : std::nullopt;
    auto findUpload = [&]() {
      auto found = uploads.find(*upload);
      if (found == uploads.end() || found->second.provider != provider || found->second.run != job->run)
        throw std::runtime_error("Unknown provider upload: " + *upload);
      return found;
    };
    {
      std::lock_guard lock(mutex);
      if (shutdown)
        throw std::runtime_error(kShutDown);
      // Checked again below, after admission. Checked here too, so a start
      // over maxJobs reports that rather than the admission ledger's limits.
      if (shared->executing.load() >= limits.maxJobs)
        throw std::runtime_error("Too many provider jobs are running");
      if (upload)
        findUpload();
    }
    // Admission (design section 4.7), outside the mutex: the result cap and
    // one operation slot, with inline arguments their bytes too, now or
    // never, since a start cannot wait. An upload's bytes are charged
    // already, in its parts.
    nodetool::jobs::Reservation reservation(account);
    if (!upload) {
      args = request.value("args", Json::object()).dump();
      reservation.reserveSnapshot(args.size());
    }
    if (reservation.admit({args.size(), limits.maxResultBytes, 0},
                          nodetool::jobs::Reservation::Order::Immediate) ==
        nodetool::jobs::Reservation::Admission::Blocked)
      throw std::runtime_error("Provider job cannot start: the host job budget is exhausted");
    job->reservation = reservation.share();
    // Takes over the upload's parts after the mutex, so no ledger lock nests
    // under it.
    nodetool::jobs::Reservation charge = reservation.share();
    std::vector<nodetool::jobs::Reservation> parts;
    {
      std::lock_guard lock(mutex);
      if (shutdown)
        throw std::runtime_error(kShutDown);
      // Lane jobs only decrement the count, so checking and taking a ticket
      // under the registry mutex cannot admit more than maxJobs. A closed
      // job keeps its ticket until its worker returns.
      if (shared->executing.load() >= limits.maxJobs)
        throw std::runtime_error("Too many provider jobs are running");
      if (upload) {
        auto found = findUpload();
        args = std::move(found->second.data);
        parts = std::move(found->second.reserved);
        uploads.erase(found);
      }
      ExecutionTicket ticket(shared);
      target = &laneLocked();
      call = std::make_unique<ProviderCall>(job, shared, std::move(ticket), method, std::move(args),
                                            std::move(reservation));
      id = "j" + std::to_string(++nextId);
      jobs[id] = job;
    }
    for (auto &part : parts)
      charge.absorb(std::move(part));
    charge = {};
    // Outside the mutex: an executor may run the job here or refuse it, and
    // either runs worker or job code. stopAll() racing this sees the job in
    // `jobs` and stops it, and the lane then destroys it unrun.
    target->submit(nodetool::jobs::SubmittedJob(
        0, std::move(call), nullptr, job->stopSource.get_token(), {}));
    return Json{{"job", id}}.dump();
  }

  void next(const std::string &provider, const RunTag *run, const std::string &payload,
            Completion done) {
    std::optional<Outcome> ready;
    try {
      auto job = find(provider, run, Json::parse(payload));
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

  void retireRun(const RunIdentity &run) {
    std::vector<std::shared_ptr<Job>> retired;
    // Released after the mutex, with their charges.
    std::vector<Upload> dropped;
    std::shared_ptr<nodetool::jobs::RunAccount> account;
    {
      std::lock_guard lock(mutex);
      if (auto found = fallbackRuns.find(run); found != fallbackRuns.end()) {
        account = std::move(found->second);
        fallbackRuns.erase(found);
      }
      for (auto it = jobs.begin(); it != jobs.end();) {
        if (it->second->run == run) {
          retired.push_back(std::move(it->second));
          it = jobs.erase(it);
        } else {
          ++it;
        }
      }
      for (auto it = uploads.begin(); it != uploads.end();) {
        if (it->second.run == run) {
          dropped.push_back(std::move(it->second));
          it = uploads.erase(it);
        } else {
          ++it;
        }
      }
    }
    // A queued or running lane job holds its own reference until it ends.
    for (auto &job : retired)
      job->cancel(true);
  }

  ProviderJobs::Stats stats() {
    ProviderJobs::Stats counts;
    std::shared_ptr<nodetool::jobs::RunnerAccount> fallback;
    {
      std::lock_guard lock(mutex);
      counts.registered = jobs.size();
      fallback = fallbackRunner;
    }
    // Outside the mutex: the ledger lock never nests under it.
    if (fallback)
      counts.fallbackBytes = fallback->ledger()->usage().bytes;
    counts.executing = shared->executing.load();
    counts.alive = shared->aliveJobs.load();
    return counts;
  }

  // A job of another run, like an unknown one, answers null and stays.
  std::string close(const std::string &provider, const RunIdentity &run,
                    const std::string &payload) {
    const auto id = Json::parse(payload).at("job").get<std::string>();
    std::shared_ptr<Job> job;
    {
      std::lock_guard lock(mutex);
      auto found = jobs.find(id);
      if (found == jobs.end() || found->second->provider != provider || !run ||
          found->second->run != run)
        return "null";
      job = found->second;
    }
    // The worker keeps its maxJobs ticket until it returns.
    job->cancel(true);
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

ProviderJobs::ProviderJobs(Worker worker, Limits limits,
                           nodetool::jobs::JobExecutor &lane)
    : ProviderJobs(std::move(worker), limits) {
  state_->lane = &lane;
  lane.attach();
}

ProviderJobs::~ProviderJobs() { state_->stopAll(); }

void ProviderJobs::grant(ContextOptions &options, const std::vector<std::string> &providers,
                         RunSource run) {
  if (!run)
    throw std::invalid_argument("ProviderJobs::grant requires a run source");
  // Weak, so the grants keep no job or tombstone alive after this object.
  const std::weak_ptr<State> weak = state_;
  const auto live = [weak] {
    auto state = weak.lock();
    if (!state)
      throw std::runtime_error(kShutDown);
    return state;
  };
  for (const auto &provider : providers) {
    const auto prefix = "provider:" + provider + ":jobs:";
    for (const char *name : {"put", "start", "close"})
      options.asyncOperations.erase(prefix + name);
    options.operations.erase(prefix + "next");
    options.operations[prefix + "put"] = [live, provider, run](const std::string &p) {
      return live()->put(provider, run(), p);
    };
    options.operations[prefix + "start"] = [live, provider, run](const std::string &p) {
      return live()->start(provider, run(), p);
    };
    options.operations[prefix + "close"] = [weak, provider, run](const std::string &p) {
      auto state = weak.lock();
      return state ? state->close(provider, run(), p) : std::string("null");
    };
    // Runs on the context's I/O lane, possibly after its run ended, so it
    // authorizes with the run its call was submitted in, never the current
    // one. The completion becomes the job's waiter when no item is ready, and
    // the producing or stopping thread completes it later.
    options.asyncOperations[prefix + "next"] = [weak, provider](std::string request,
                                                                std::stop_token,
                                                                ContextCompletion done) {
      const RunIdentity submitted = done.run();
      auto state = weak.lock();
      if (!state) {
        done(ContextResult::error(kShutDown));
        return;
      }
      if (!submitted) {
        done(ContextResult::error(kNoRun));
        return;
      }
      state->next(provider, submitted.get(), request, toContext(std::move(done)));
    };
  }
}

void ProviderJobs::next(const std::string &provider, const std::string &payload,
                        Completion done) {
  state_->next(provider, nullptr, payload, std::move(done));
}

void ProviderJobs::stop(const std::string &provider, const std::string &payload) {
  state_->stop(provider, payload);
}

void ProviderJobs::retireRun(const RunIdentity &run) { state_->retireRun(run); }

void grantProviderJobs(const gr::HostOptions &options, ContextOptions &context,
                       ProviderJobs::RunSource run) {
  if (!options.providerJobs || options.fakeProviders)
    return;
  options.providerJobs->grant(context, options.providerJobProviders, std::move(run));
}

ProviderJobs::Stats ProviderJobs::stats() { return state_->stats(); }
} // namespace gr::host
