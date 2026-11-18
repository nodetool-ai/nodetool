// TokenEndpoint over HTTP: the code exchange and the refresh at
// `/oauth/token`, and `/oauth/session/end`, as the server's authorization
// server serves them for the `nodetool-native` client.
#pragma once

#include "nodetool/account/http_transport.h"
#include "nodetool/account/token_endpoint.h"

#include <string>

namespace nodetool::account {

// Thread affinity: thread-safe. It holds no mutable state, and the
// transport is thread-safe.
class HttpTokenEndpoint final : public TokenEndpoint {
public:
  // `serverOrigin` must be an HTTPS origin (see origin.h). Any other value
  // leaves the endpoint refusing every call without sending, so a code,
  // verifier or refresh token never travels in plain text.
  HttpTokenEndpoint(HttpTransport& transport, std::string_view serverOrigin);

  TokenResult exchangeCode(const CodeExchange& exchange) override;
  TokenResult refresh(std::string_view refreshToken) override;
  EndSessionStatus endSession(std::string_view revocationHandle) override;
  std::string serverOrigin() const override { return origin_; }

private:
  TokenResult postToken(std::string body);

  HttpTransport& transport_;
  const std::string origin_;
};

// The result of one `/oauth/token` response, by status and body. Exposed for
// the tests.
TokenResult parseTokenResponse(const HttpResponse& response);

} // namespace nodetool::account
