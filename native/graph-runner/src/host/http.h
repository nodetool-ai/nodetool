// The media fetch policy of `__host.http` (http.cpp), exposed for tests. It
// is `safeFetch` from packages/runtime-core/src/safe-url.ts: https only, to
// a host that is not loopback, link-local, private, CGNAT or benchmarking,
// with every redirect hop checked again. The native runner also checks the
// address each connection is made to, so a name that resolves to a blocked
// address is refused too (the TypeScript side leaves DNS rebinding to the
// deployment's egress control).
#pragma once

#include "kernel/async_jobs.h"

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

struct sockaddr;

namespace gr::host {

// Whether an IP literal (IPv4, or IPv6 with or without brackets and zone id)
// is an internal address. Not an IP literal: false.
bool isBlockedIpLiteral(const std::string& host);

// Whether `url` is https to a host the policy allows, before DNS.
bool isSafePublicHttpsUrl(const std::string& url);

// Whether a connection to `address` (AF_INET or AF_INET6) is allowed: not an
// internal address. Any other family is refused.
bool isPublicSocketAddress(const sockaddr* address);

// The most body bytes a fetch keeps. A larger response fails.
constexpr uint64_t kMaxHttpBodyBytes = uint64_t(512) << 20;

// Where a fetch may go. The host function always uses the default, the
// policy above. Tests pass another to reach a loopback server inside their
// sandbox. Guest code cannot choose a policy.
//
// Thread affinity: none. Plain immutable data, copied into each job.
struct HttpFetchPolicy {
  // CURLOPT_PROTOCOLS_STR of every hop.
  const char* protocols = "https";
  // Checked for the first URL and every redirect target.
  bool (*urlAllowed)(const std::string& url) = isSafePublicHttpsUrl;
  // Checked for every address a connection is made to.
  bool (*addressAllowed)(const sockaddr* address) = isPublicSocketAddress;
};

// The Value of a fetch.
//
// Thread affinity: none. Created on the network lane, it travels in its
// JobResult to the worker, or is destroyed where its result is disposed.
struct HttpResponse final : nodetool::jobs::JobPayload {
  long status = 0;
  std::string url;
  std::string contentType;
  std::vector<uint8_t> body;
};

// A GET of `url` under `policy`, following at most 5 redirects, each hop
// checked again. Run it on the network lane. Its cost reserves
// kMaxHttpBodyBytes for the body, 256 KiB for the final URL and content type,
// and the URL: more than half of the default 1 GiB run limit, so a run with
// that limit runs one fetch at a time. It fails with "Refusing to fetch unsafe
// URL ..." for a refused URL or address, and ends Stopped when its stop is
// requested during the transfer: the progress callback sees the stop within
// about a second while data flows. It cannot end name resolution or connect,
// which libcurl does not report progress for: those end at the 15 s connect
// timeout at the latest. Without libcurl, the job fails.
std::unique_ptr<nodetool::jobs::NativeJob> makeHttpGetJob(std::string url, HttpFetchPolicy policy = {});

}  // namespace gr::host
