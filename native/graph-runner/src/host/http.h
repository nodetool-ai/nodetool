// The media fetch policy of `__host.http` (http.cpp), exposed for tests. It
// is `safeFetch` from packages/runtime-core/src/safe-url.ts: https only, to
// a host that is not loopback, link-local, private, CGNAT or benchmarking,
// with every redirect hop checked again. The native runner also checks the
// address each connection is made to, so a name that resolves to a blocked
// address is refused too (the TypeScript side leaves DNS rebinding to the
// deployment's egress control).
#pragma once

#include <string>

namespace gr::host {

// Whether an IP literal (IPv4, or IPv6 with or without brackets and zone id)
// is an internal address. Not an IP literal: false.
bool isBlockedIpLiteral(const std::string& host);

// Whether `url` is https to a host the policy allows, before DNS.
bool isSafePublicHttpsUrl(const std::string& url);

}  // namespace gr::host
