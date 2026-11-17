// The one HTTP call this library needs from the app. Each app implements it
// with its own network stack (QNetworkAccessManager in the Qt apps), so the
// library needs no HTTP or TLS dependency. Tests use a fake.
#pragma once

#include <atomic>
#include <chrono>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace nodetool::account {

// Set when the session that authorized a request moves to signed out. The
// request layer checks it before it sends, and aborts a request in flight
// when it turns true.
//
// Thread affinity: thread-safe, an atomic flag.
class RequestCancel {
public:
  bool cancelled() const { return cancelled_.load(std::memory_order_acquire); }
  void cancel() { cancelled_.store(true, std::memory_order_release); }

private:
  std::atomic<bool> cancelled_{false};
};

struct HttpRequest {
  std::string method = "GET";
  // Absolute URL, such as https://api.nodetool.ai/oauth/token.
  std::string url;
  std::vector<std::pair<std::string, std::string>> headers;
  std::string body;
  // A deadline on the whole request, from the start of the send to the end
  // of the body, not a limit on inactivity.
  std::chrono::milliseconds timeout{10000};
  // Set on a request that carries a credential: the canonical HTTPS origin
  // (see origin.h) the request may go to. A transport sends nothing when
  // the URL's origin differs, and answers status 0.
  std::string requiredOrigin;
  // When set, the transport stops the request once the flag turns true and
  // answers status 0. A request whose flag is already set is not sent.
  std::shared_ptr<const RequestCancel> cancel;
};

struct HttpResponse {
  // 0 when no response arrived: the host is unreachable, the connection
  // failed or the timeout passed.
  int status = 0;
  std::string body;
};

// A transport never follows a redirect. A 3xx is returned as the response,
// so a credential never reaches the host a redirect names.
//
// Thread affinity: implementations are thread-safe. send() blocks until the
// response, the request's deadline or its cancellation.
class HttpTransport {
public:
  virtual ~HttpTransport() = default;
  virtual HttpResponse send(const HttpRequest& request) = 0;
};

} // namespace nodetool::account
