// The three calls the account module makes to the server's authorization
// server: the code exchange and the refresh at `/oauth/token`, and
// `/oauth/session/end`. The HTTP implementation belongs to the request layer
// (WP1.10); tests use a fake.
#pragma once

#include <cstdint>
#include <string>
#include <string_view>

namespace nodetool::account {

// What `/oauth/token` returns for the native scope.
struct TokenSet {
  std::string accessToken;
  std::string refreshToken;
  int64_t expiresInSeconds = 0;
  std::string sessionId;
  // The code exchange only: who signed in, and the revocation handle. A
  // refresh leaves them empty.
  std::string userId;
  std::string displayName;
  std::string revocationHandle;
};

enum class TokenStatus {
  Ok,
  // The server refused the grant: the session ended, or the code is spent.
  InvalidGrant,
  // The server could not be reached, or did not answer in time.
  Offline,
  // Any other refusal, such as desktop sign-in turned off on the server.
  Refused,
};

struct TokenResult {
  TokenStatus status = TokenStatus::Offline;
  TokenSet tokens;
  // The server's error description, shown to the person on a refusal.
  std::string message;
};

struct CodeExchange {
  std::string code;
  std::string codeVerifier;
  std::string redirectUri;
  std::string resource;
};

enum class EndSessionStatus {
  // 200: the session is ended, or was already.
  Ended,
  // 404: the server does not know the handle.
  Unknown,
  Offline,
};

// Thread affinity: implementations are thread-safe. Each call blocks until
// the server answered or the call's limit passed (10 seconds for a refresh).
class TokenEndpoint {
public:
  virtual ~TokenEndpoint() = default;
  virtual TokenResult exchangeCode(const CodeExchange& exchange) = 0;
  virtual TokenResult refresh(std::string_view refreshToken) = 0;
  virtual EndSessionStatus endSession(std::string_view revocationHandle) = 0;
};

} // namespace nodetool::account
