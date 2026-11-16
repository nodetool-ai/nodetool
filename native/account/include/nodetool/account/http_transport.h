// The one HTTP call this library needs from the app. Each app implements it
// with its own network stack (QNetworkAccessManager in the Qt apps), so the
// library needs no HTTP or TLS dependency. Tests use a fake.
#pragma once

#include <chrono>
#include <string>
#include <utility>
#include <vector>

namespace nodetool::account {

struct HttpRequest {
  std::string method = "GET";
  // Absolute URL, such as https://api.nodetool.ai/oauth/token.
  std::string url;
  std::vector<std::pair<std::string, std::string>> headers;
  std::string body;
  std::chrono::milliseconds timeout{10000};
};

struct HttpResponse {
  // 0 when no response arrived: the host is unreachable, the connection
  // failed or the timeout passed.
  int status = 0;
  std::string body;
};

// Thread affinity: implementations are thread-safe. send() blocks until the
// response or the request's timeout.
class HttpTransport {
public:
  virtual ~HttpTransport() = default;
  virtual HttpResponse send(const HttpRequest& request) = 0;
};

} // namespace nodetool::account
