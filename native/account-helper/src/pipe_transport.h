// The HttpTransport of the account helper. The helper has no network stack:
// each request goes to Electron's main process as an `http` message on
// stdout, and the answer comes back as an `httpResponse` line on stdin
// (README, "Protocol"). The main process sends it with Chromium's network
// stack and applies its own origin and redirect rules.
#pragma once

#include "nodetool/account/http_transport.h"

#include <nlohmann/json.hpp>

#include <condition_variable>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>

namespace nodetool::account_helper {

// Thread affinity: thread-safe. send() blocks the calling thread. deliver()
// and close() run on the thread that reads stdin. `mutex_` guards
// `waiting_`, `nextId_` and `closed_`.
class PipeTransport final : public account::HttpTransport {
public:
  using Emit = std::function<void(const nlohmann::json&)>;
  explicit PipeTransport(Emit emit) : emit_(std::move(emit)) {}

  account::HttpResponse send(const account::HttpRequest& request) override;

  // send(), with `fields` added to the `http` message, such as the id of
  // the main process's request it answers (`request` or `transfer`), and a
  // second flag that stops it, such as the main process's cancel.
  account::HttpResponse send(const account::HttpRequest& request, const nlohmann::json& fields,
                             std::shared_ptr<const account::RequestCancel> alsoCancel);

  // An `httpResponse` line. Unknown ids are ignored: the request already
  // ended by its deadline or its cancel.
  void deliver(uint64_t id, account::HttpResponse response);

  // stdin closed. Every waiting request answers status 0, and later ones
  // are not sent.
  void close();

private:
  Emit emit_;
  std::mutex mutex_;
  std::condition_variable answered_;
  std::map<uint64_t, std::optional<account::HttpResponse>> waiting_;
  uint64_t nextId_ = 1;
  bool closed_ = false;
};

// A transport that sends every request through a PipeTransport with the
// same fields and second cancel flag, for a client of the library that
// takes an HttpTransport, such as LocalTransferClient.
//
// Thread affinity: as PipeTransport. Ownership: borrows the PipeTransport,
// which must outlive it.
class TaggedTransport final : public account::HttpTransport {
public:
  TaggedTransport(PipeTransport& pipe, nlohmann::json fields, std::shared_ptr<const account::RequestCancel> cancel)
      : pipe_(pipe), fields_(std::move(fields)), cancel_(std::move(cancel)) {}
  account::HttpResponse send(const account::HttpRequest& request) override {
    return pipe_.send(request, fields_, cancel_);
  }

private:
  PipeTransport& pipe_;
  const nlohmann::json fields_;
  const std::shared_ptr<const account::RequestCancel> cancel_;
};

} // namespace nodetool::account_helper
