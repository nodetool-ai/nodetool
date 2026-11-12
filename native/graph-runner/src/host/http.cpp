// `__host.http`: fetching media refs over https, off unless the embedder sets
// HostOptions::allowHttpFetch. The policy is in http.h.
//
//   getAsync(url) -> promise of {status, url, contentType, body: Uint8Array}
//   get(url)      -> the same, synchronously, for calls outside a run
//   bound()       -> whether a run is bound, so getAsync can be used
//
// GET only, no cookies, no proxy, at most 5 redirects and kMaxHttpBodyBytes
// of body. A refused URL or address throws "Refusing to fetch unsafe URL
// ...". getAsync checks the grant and the first URL at the call, then runs
// the fetch on the run's network lane (docs/plans/graph-runner-async-host.md,
// sections 4.7 to 4.9): the job owns the curl handle, the response it
// stores and its stop token, and the progress callback ends the transfer
// when the run cancels it.
//
// libcurl (evidence in docs/plans/graph-runner-async-host-evidence.md,
// section 5): each hop's easy handle is created, used and cleaned up by one
// call on one thread, and never shared. CURLOPT_NOSIGNAL stays set, as
// threaded programs need. The progress callback cannot end name resolution
// or the TCP connect, for which libcurl reports no progress: a stop in those
// phases takes effect when they end, at the latest at the 15 s connect
// timeout. curl_global_init runs once, from installHttp() on the worker,
// before the first fetch can be submitted, so a libcurl built without the
// `threadsafe` feature is still initialized before a lane uses it.
#include "host/capabilities.h"
#include "host/http.h"
#include "kernel/job_inputs.h"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#endif

#include <algorithm>
#include <cctype>
#include <cstring>
#include <memory>
#include <optional>
#include <stdexcept>
#include <stop_token>

#ifdef GR_HAVE_CURL
#include <curl/curl.h>
#endif

using nodetool::jobs::JobOutcome;
using nodetool::jobs::NativeJob;

namespace gr::host {
namespace {

bool isPrivateIpv4(uint32_t addr) {  // host byte order
  uint8_t a = addr >> 24, b = (addr >> 16) & 0xff;
  if (a == 0 || a == 10 || a == 127) return true;
  if (a == 169 && b == 254) return true;
  if (a == 172 && b >= 16 && b <= 31) return true;
  if (a == 192 && b == 168) return true;
  if (a == 100 && b >= 64 && b <= 127) return true;
  if (a == 198 && (b == 18 || b == 19)) return true;
  return false;
}

bool isBlockedIpv6(const uint8_t* b) {
  auto zero = [b](int from, int to) {
    for (int i = from; i < to; ++i) {
      if (b[i] != 0) return false;
    }
    return true;
  };
  auto v4At = [b](int i) {
    return (uint32_t(b[i]) << 24) | (uint32_t(b[i + 1]) << 16) | (uint32_t(b[i + 2]) << 8) | b[i + 3];
  };
  if (zero(0, 15) && (b[15] == 0 || b[15] == 1)) return true;  // :: and ::1
  if ((b[0] & 0xfe) == 0xfc) return true;                         // fc00::/7
  if (b[0] == 0xfe && (b[1] & 0xc0) == 0x80) return true;         // fe80::/10
  if (b[0] == 0x20 && b[1] == 0x02) return isPrivateIpv4(v4At(2));  // 6to4
  if (zero(0, 10) && b[10] == 0xff && b[11] == 0xff) return isPrivateIpv4(v4At(12));  // mapped
  if (zero(0, 12)) return isPrivateIpv4(v4At(12));  // IPv4-compatible
  if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b && zero(4, 12)) {
    return isPrivateIpv4(v4At(12));  // NAT64 64:ff9b::/96
  }
  return false;
}

std::string lower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return char(std::tolower(c)); });
  return s;
}

bool endsWith(const std::string& s, const std::string& suffix) {
  return s.size() >= suffix.size() && s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

[[noreturn]] void refuse(const std::string& url) {
  throw std::runtime_error("Refusing to fetch unsafe URL (must be https to a public host): " + url);
}

}  // namespace

bool isBlockedIpLiteral(const std::string& host) {
  std::string h = lower(host);
  if (!h.empty() && h.front() == '[') h.erase(0, 1);
  if (!h.empty() && h.back() == ']') h.pop_back();
  auto zone = h.find('%');
  if (zone != std::string::npos) h.erase(zone);
  in_addr v4{};
  if (inet_pton(AF_INET, h.c_str(), &v4) == 1) return isPrivateIpv4(ntohl(v4.s_addr));
  in6_addr v6{};
  if (inet_pton(AF_INET6, h.c_str(), &v6) == 1) return isBlockedIpv6(v6.s6_addr);
  return false;
}

bool isPublicSocketAddress(const sockaddr* address) {
  if (address->sa_family == AF_INET) {
    auto* sin = reinterpret_cast<const sockaddr_in*>(address);
    return !isPrivateIpv4(ntohl(sin->sin_addr.s_addr));
  }
  if (address->sa_family == AF_INET6) {
    auto* sin6 = reinterpret_cast<const sockaddr_in6*>(address);
    return !isBlockedIpv6(sin6->sin6_addr.s6_addr);
  }
  return false;
}

#ifdef GR_HAVE_CURL

namespace {

struct UrlParts {
  std::string scheme;
  std::string host;
};

bool parseUrl(const std::string& url, UrlParts& out) {
  std::unique_ptr<CURLU, void (*)(CURLU*)> u(curl_url(), curl_url_cleanup);
  if (!u || curl_url_set(u.get(), CURLUPART_URL, url.c_str(), 0) != CURLUE_OK) return false;
  char* scheme = nullptr;
  char* host = nullptr;
  bool ok = curl_url_get(u.get(), CURLUPART_SCHEME, &scheme, 0) == CURLUE_OK &&
            curl_url_get(u.get(), CURLUPART_HOST, &host, 0) == CURLUE_OK;
  if (ok) {
    out.scheme = lower(scheme);
    out.host = lower(host);
  }
  curl_free(scheme);
  curl_free(host);
  return ok;
}

constexpr int kMaxRedirects = 5;
// Room for the final URL and the content type, which libcurl bounds by its
// header size limit.
constexpr uint64_t kResponseMetadataBytes = 256 * 1024;

// curl_global_init, once per process. The function-local static is
// initialized once, thread-safely, and never changes after.
bool curlReady() {
  static const bool initialized = curl_global_init(CURL_GLOBAL_DEFAULT) == CURLE_OK;
  return initialized;
}

// One hop's receiving side: the body so far and the transfer's stop.
//
// Thread affinity: the thread running the transfer, through libcurl's
// callbacks, which run inside curl_easy_perform on that thread.
struct Body {
  std::vector<uint8_t> data;
  bool tooLarge = false;
  const std::stop_token* stop = nullptr;
};

size_t onData(char* ptr, size_t size, size_t n, void* user) {
  auto* body = static_cast<Body*>(user);
  // Returning short of `len` ends the transfer with CURLE_WRITE_ERROR.
  if (body->stop->stop_requested()) return 0;
  size_t len = size * n;
  // Checked before the append, so the body never passes its reservation.
  if (body->data.size() + len > kMaxHttpBodyBytes) {
    body->tooLarge = true;
    return 0;
  }
  body->data.insert(body->data.end(), ptr, ptr + len);
  return len;
}

// The stop reaches the transfer here: libcurl calls this while data flows,
// and about once a second when it does not, but not during name resolution
// or the TCP connect. Nonzero aborts with CURLE_ABORTED_BY_CALLBACK.
int onProgress(void* stop, curl_off_t, curl_off_t, curl_off_t, curl_off_t) {
  return static_cast<const std::stop_token*>(stop)->stop_requested() ? 1 : 0;
}

// What the socket callback needs: the policy's address check, and whether
// it refused one.
//
// Thread affinity: as Body.
struct Connect {
  bool (*allowed)(const sockaddr*);
  bool refused = false;
};

// Refuses a connection to a blocked address, whatever name led to it.
curl_socket_t openSocket(void* user, curlsocktype, struct curl_sockaddr* address) {
  auto* connect = static_cast<Connect*>(user);
  if (!connect->allowed(&address->addr)) {
    connect->refused = true;
    return CURL_SOCKET_BAD;
  }
  return ::socket(address->family, address->socktype, address->protocol);
}

// Fetches `start` on the calling thread. Returns nullopt when `stop` was
// requested. Each hop's handle lives inside one loop iteration.
std::optional<HttpResponse> fetch(const std::string& start, const HttpFetchPolicy& policy,
                                  const std::stop_token& stop) {
  if (!curlReady()) throw std::runtime_error("libcurl failed to initialize");
  std::string current = start;
  for (int hop = 0; hop <= kMaxRedirects; ++hop) {
    if (stop.stop_requested()) return std::nullopt;
    if (!policy.urlAllowed(current)) refuse(current);
    std::unique_ptr<CURL, void (*)(CURL*)> curl(curl_easy_init(), curl_easy_cleanup);
    if (!curl) throw std::runtime_error("libcurl failed to start a request");
    Body body;
    body.stop = &stop;
    Connect connect{policy.addressAllowed};
    char error[CURL_ERROR_SIZE] = {0};
    CURL* c = curl.get();
    curl_easy_setopt(c, CURLOPT_URL, current.c_str());
    curl_easy_setopt(c, CURLOPT_PROTOCOLS_STR, policy.protocols);
    curl_easy_setopt(c, CURLOPT_FOLLOWLOCATION, 0L);
    curl_easy_setopt(c, CURLOPT_PROXY, "");
    curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT, 15L);
    curl_easy_setopt(c, CURLOPT_TIMEOUT, 120L);
    curl_easy_setopt(c, CURLOPT_OPENSOCKETFUNCTION, openSocket);
    curl_easy_setopt(c, CURLOPT_OPENSOCKETDATA, &connect);
    curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, onData);
    curl_easy_setopt(c, CURLOPT_WRITEDATA, &body);
    curl_easy_setopt(c, CURLOPT_NOPROGRESS, 0L);
    curl_easy_setopt(c, CURLOPT_XFERINFOFUNCTION, onProgress);
    curl_easy_setopt(c, CURLOPT_XFERINFODATA, &stop);
    curl_easy_setopt(c, CURLOPT_ERRORBUFFER, error);
    curl_easy_setopt(c, CURLOPT_USERAGENT, "nodetool-graph-runner");
    CURLcode rc = curl_easy_perform(c);
    if (stop.stop_requested()) return std::nullopt;
    if (body.tooLarge) throw std::runtime_error("Response too large while fetching: " + current);
    if (connect.refused && rc != CURLE_OK) refuse(current);
    if (rc != CURLE_OK) {
      throw std::runtime_error(std::string("fetch failed: ") + (error[0] ? error : curl_easy_strerror(rc)));
    }
    HttpResponse r;
    curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &r.status);
    char* location = nullptr;
    curl_easy_getinfo(c, CURLINFO_REDIRECT_URL, &location);
    if (r.status >= 300 && r.status < 400 && location) {
      current = location;
      continue;
    }
    char* type = nullptr;
    curl_easy_getinfo(c, CURLINFO_CONTENT_TYPE, &type);
    r.url = current;
    r.contentType = type ? type : "";
    r.body = std::move(body.data);
    return r;
  }
  throw std::runtime_error("Too many redirects while fetching: " + start);
}

// Thread affinity: the network lane thread that runs it, or the worker in
// inline mode. Ownership: unique, through its SubmittedJob. Owns the URL;
// the transfer's handle, body and stop live inside run().
class HttpGetJob final : public NativeJob {
public:
  HttpGetJob(std::string url, HttpFetchPolicy policy) : url_(std::move(url)), policy_(policy) {}

  nodetool::jobs::JobCost cost() const override { return {url_.size(), kMaxHttpBodyBytes + kResponseMetadataBytes, 0}; }

  JobOutcome run(std::stop_token stop) override {
    if (stop.stop_requested()) return JobOutcome::stopped();
    std::optional<HttpResponse> response = fetch(url_, policy_, stop);
    if (!response) return JobOutcome{JobOutcome::Kind::Stopped, nullptr, "The fetch was cancelled"};
    return JobOutcome::value(std::make_unique<HttpResponse>(std::move(*response)));
  }

private:
  std::string url_;
  HttpFetchPolicy policy_;
};

js::Value responseObject(js::Engine& en, const HttpResponse& r, js::Value body) {
  js::Value out = en.object();
  en.set(out, "status", en.number(double(r.status)));
  en.set(out, "url", en.string(r.url));
  en.set(out, "contentType", en.string(r.contentType));
  en.set(out, "body", std::move(body));
  return out;
}

}  // namespace

bool isSafePublicHttpsUrl(const std::string& url) {
  UrlParts parts;
  if (!parseUrl(url, parts) || parts.scheme != "https") return false;
  std::string host = parts.host;
  if (!host.empty() && host.front() == '[') host.erase(0, 1);
  if (!host.empty() && host.back() == ']') host.pop_back();
  while (!host.empty() && host.back() == '.') host.pop_back();
  if (host.empty()) return false;
  if (host == "localhost" || host == "ip6-localhost" || host == "ip6-loopback" ||
      endsWith(host, ".localhost") || endsWith(host, ".local") || endsWith(host, ".internal")) {
    return false;
  }
  return !isBlockedIpLiteral(host);
}

std::unique_ptr<NativeJob> makeHttpGetJob(std::string url, HttpFetchPolicy policy) {
  return std::make_unique<HttpGetJob>(std::move(url), policy);
}

void installHttp(js::Engine& e, const js::Value& object, const HostOptions& options) {
  const bool allowed = options.allowHttpFetch;
  // Before any fetch can be submitted to a lane.
  if (allowed) curlReady();
  // Shared with the engine's host state and every function that submits.
  const std::shared_ptr<RunBinding> binding = RunBinding::of(e);
  auto refuseOff = [allowed] {
    if (!allowed) {
      throw std::runtime_error(
          "fetching http(s) URLs is turned off in the native runner (HostOptions::allowHttpFetch)");
    }
  };
  e.set(object, "get", e.function("get", 1, [refuseOff](js::Engine& en, const std::vector<js::Value>& a) {
    refuseOff();
    std::stop_source never;
    std::optional<HttpResponse> r = fetch(a.empty() ? std::string() : en.toString(a[0]), {}, never.get_token());
    return responseObject(en, *r, en.bytes(r->body.data(), r->body.size()));
  }));
  e.set(object, "bound", e.function("bound", 0, [binding](js::Engine& en, const std::vector<js::Value>&) {
    return en.boolean(binding->run() != nullptr);
  }));
  // Cancellable: the run's cancellation rejects it with an AbortError and
  // stops the transfer.
  e.set(object, "getAsync", e.function("getAsync", 1, [refuseOff, binding](js::Engine& en, const std::vector<js::Value>& a) {
    refuseOff();
    AsyncRun* run = binding->run();
    nodetool::jobs::JobExecutor* network = binding->network();
    if (!run) throw std::runtime_error("asynchronous fetches need a running graph");
    if (!network) throw std::runtime_error("asynchronous fetches need a network lane, and the run bound none");
    nodetool::jobs::Reservation reservation = run->reserve();
    if (a.empty() || !en.isString(a[0])) throw std::invalid_argument("url must be a string");
    std::string url = snapshotString(en, a[0], "url", reservation);
    if (!isSafePublicHttpsUrl(url)) refuse(url);
    auto convert = [](ResultConversion& conversion) -> js::Value {
      auto* r = dynamic_cast<HttpResponse*>(conversion.payload());
      if (!r) throw std::logic_error("a fetch delivered an unexpected payload");
      conversion.chargeCopy(r->url.size() + r->contentType.size());
      js::Value body = conversion.adoptBytes(std::move(r->body));
      return responseObject(conversion.engine(), *r, std::move(body));
    };
    return run->submit(*network, makeHttpGetJob(std::move(url)), convert, true, std::move(reservation));
  }));
}

#else

bool isSafePublicHttpsUrl(const std::string&) { return false; }

std::unique_ptr<NativeJob> makeHttpGetJob(std::string, HttpFetchPolicy) {
  return nodetool::jobs::makeJob([](std::stop_token) {
    return JobOutcome::failure("fetching URLs is unavailable: the native runner was built without libcurl");
  });
}

void installHttp(js::Engine& e, const js::Value& object, const HostOptions&) {
  auto unavailable = [](js::Engine&, const std::vector<js::Value>&) -> js::Value {
    throw std::runtime_error("fetching URLs is unavailable: the native runner was built without libcurl");
  };
  e.set(object, "get", e.function("get", 1, unavailable));
  e.set(object, "getAsync", e.function("getAsync", 1, unavailable));
  e.set(object, "bound", e.function("bound", 0, [](js::Engine& en, const std::vector<js::Value>&) {
    return en.boolean(false);
  }));
}

#endif

}  // namespace gr::host
