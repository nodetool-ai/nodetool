// `__host.http`: fetching media refs over https, off unless the embedder sets
// HostOptions::allowHttpFetch. The policy is in http.h.
//
//   get(url) -> {status, url, contentType, body: Uint8Array}
//
// GET only, no cookies, no proxy, at most 5 redirects and kMaxBytes of body.
// A refused URL or address throws "Refusing to fetch unsafe URL ...".
#include "host/capabilities.h"
#include "host/http.h"

#include <arpa/inet.h>
#include <netinet/in.h>

#include <algorithm>
#include <cctype>
#include <cstring>
#include <memory>
#include <stdexcept>

#ifdef GR_HAVE_CURL
#include <curl/curl.h>
#endif

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

constexpr size_t kMaxBytes = size_t(512) << 20;
constexpr int kMaxRedirects = 5;

struct Body {
  std::vector<uint8_t> data;
  bool tooLarge = false;
};

size_t onData(char* ptr, size_t size, size_t n, void* user) {
  auto* body = static_cast<Body*>(user);
  size_t len = size * n;
  if (body->data.size() + len > kMaxBytes) {
    body->tooLarge = true;
    return 0;
  }
  body->data.insert(body->data.end(), ptr, ptr + len);
  return len;
}

// Refuses a connection to a blocked address, whatever name led to it.
curl_socket_t openSocket(void* refused, curlsocktype, struct curl_sockaddr* address) {
  bool blocked = true;
  if (address->family == AF_INET) {
    auto* sin = reinterpret_cast<const sockaddr_in*>(&address->addr);
    blocked = isPrivateIpv4(ntohl(sin->sin_addr.s_addr));
  } else if (address->family == AF_INET6) {
    auto* sin6 = reinterpret_cast<const sockaddr_in6*>(&address->addr);
    blocked = isBlockedIpv6(sin6->sin6_addr.s6_addr);
  }
  if (blocked) {
    *static_cast<bool*>(refused) = true;
    return CURL_SOCKET_BAD;
  }
  return ::socket(address->family, address->socktype, address->protocol);
}

struct Response {
  long status = 0;
  std::string url;
  std::string contentType;
  std::vector<uint8_t> body;
};

Response fetch(const std::string& start) {
  static const bool initialized = curl_global_init(CURL_GLOBAL_DEFAULT) == CURLE_OK;
  if (!initialized) throw std::runtime_error("libcurl failed to initialize");
  std::string current = start;
  for (int hop = 0; hop <= kMaxRedirects; ++hop) {
    if (!isSafePublicHttpsUrl(current)) refuse(current);
    std::unique_ptr<CURL, void (*)(CURL*)> curl(curl_easy_init(), curl_easy_cleanup);
    if (!curl) throw std::runtime_error("libcurl failed to start a request");
    Body body;
    char error[CURL_ERROR_SIZE] = {0};
    CURL* c = curl.get();
    curl_easy_setopt(c, CURLOPT_URL, current.c_str());
    curl_easy_setopt(c, CURLOPT_PROTOCOLS_STR, "https");
    curl_easy_setopt(c, CURLOPT_FOLLOWLOCATION, 0L);
    curl_easy_setopt(c, CURLOPT_PROXY, "");
    curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT, 15L);
    curl_easy_setopt(c, CURLOPT_TIMEOUT, 120L);
    bool refusedAddress = false;
    curl_easy_setopt(c, CURLOPT_OPENSOCKETFUNCTION, openSocket);
    curl_easy_setopt(c, CURLOPT_OPENSOCKETDATA, &refusedAddress);
    curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, onData);
    curl_easy_setopt(c, CURLOPT_WRITEDATA, &body);
    curl_easy_setopt(c, CURLOPT_ERRORBUFFER, error);
    curl_easy_setopt(c, CURLOPT_USERAGENT, "nodetool-graph-runner");
    CURLcode rc = curl_easy_perform(c);
    if (body.tooLarge) throw std::runtime_error("Response too large while fetching: " + current);
    if (refusedAddress && rc != CURLE_OK) refuse(current);
    if (rc != CURLE_OK) {
      throw std::runtime_error(std::string("fetch failed: ") + (error[0] ? error : curl_easy_strerror(rc)));
    }
    Response r;
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

void installHttp(js::Engine& e, const js::Value& object, const HostOptions& options) {
  const bool allowed = options.allowHttpFetch;
  e.set(object, "get", e.function("get", 1, [allowed](js::Engine& en, const std::vector<js::Value>& a) {
    if (!allowed) {
      throw std::runtime_error(
          "fetching http(s) URLs is turned off in the native runner (HostOptions::allowHttpFetch)");
    }
    Response r = fetch(a.empty() ? std::string() : en.toString(a[0]));
    js::Value out = en.object();
    en.set(out, "status", en.number(double(r.status)));
    en.set(out, "url", en.string(r.url));
    en.set(out, "contentType", en.string(r.contentType));
    en.set(out, "body", en.bytes(r.body.data(), r.body.size()));
    return out;
  }));
}

#else

bool isSafePublicHttpsUrl(const std::string&) { return false; }

void installHttp(js::Engine& e, const js::Value& object, const HostOptions&) {
  e.set(object, "get", e.function("get", 1, [](js::Engine&, const std::vector<js::Value>&) -> js::Value {
    throw std::runtime_error("fetching URLs is unavailable: the native runner was built without libcurl");
  }));
}

#endif

}  // namespace gr::host
