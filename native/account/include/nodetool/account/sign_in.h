// The sign-in flow (technical design, "Sign-in protocol"): a loopback
// listener, PKCE, the authorize URL the system browser opens, the callback
// check, and the code exchange.
#pragma once

#include "nodetool/account/account_session.h"
#include "nodetool/account/token_endpoint.h"

#include <chrono>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>

namespace nodetool::account {

inline constexpr std::string_view kNativeClientId = "nodetool-native";
inline constexpr std::string_view kNativeScope = "native";

struct Pkce {
  std::string verifier;
  // base64url(SHA-256(verifier)), method S256.
  std::string challenge;
};

Pkce makePkce();
std::string pkceChallenge(std::string_view verifier);

// Percent-encoding for a query component (RFC 3986 unreserved characters
// pass through).
std::string urlEncode(std::string_view value);
std::string urlDecode(std::string_view value);

struct AuthorizeRequest {
  std::string serverOrigin;
  std::string redirectUri;
  std::string codeChallenge;
  std::string state;
  // `node-editor` or `timeline`.
  std::string app;
  std::string deviceName;
};

std::string authorizeUrl(const AuthorizeRequest& request);

// What the browser brought back to the loopback listener.
struct CallbackResult {
  enum class Kind {
    Code,
    // The person chose Deny, or the server refused, for example because
    // desktop sign-in is turned off there.
    Denied,
    // The callback's `state` is not the one this flow sent.
    StateMismatch,
    // Not a callback, such as a browser's favicon request.
    NotCallback,
  };
  Kind kind = Kind::NotCallback;
  std::string code;
  std::string error;
  std::string errorDescription;
};

// Parse an HTTP request target such as `/callback?code=..&state=..`.
CallbackResult parseCallback(std::string_view target, std::string_view expectedState);

// A TCP listener on 127.0.0.1 at a free port, for one sign-in.
//
// Thread affinity: one thread uses it. `cancel()` may be called from any
// thread and wakes a waiting `waitForCallback`.
//
// Ownership: the listener owns its socket and the pipe or socket pair that
// cancel() writes to, and closes them in its destructor.
class LoopbackListener {
  struct Private {
    explicit Private() = default;
  };

public:
  static std::unique_ptr<LoopbackListener> open();
  // Use open(). Public only so std::make_unique can reach it.
  explicit LoopbackListener(Private) {}
  ~LoopbackListener();
  LoopbackListener(const LoopbackListener&) = delete;
  LoopbackListener& operator=(const LoopbackListener&) = delete;

  uint16_t port() const { return port_; }
  std::string redirectUri() const;

  // Accept connections until one carries a callback for `expectedState`,
  // answering each with a short page. Nullopt on timeout or cancel.
  std::optional<CallbackResult> waitForCallback(std::string_view expectedState,
                                                std::chrono::milliseconds timeout);
  void cancel();

private:
  intptr_t socket_ = -1;
  intptr_t wakeRead_ = -1;
  intptr_t wakeWrite_ = -1;
  uint16_t port_ = 0;
};

enum class SignInStatus {
  SignedIn,
  Denied,
  TimedOut,
  // The code exchange failed, or the sign-in could not be stored.
  Failed,
};

struct SignInResult {
  SignInStatus status = SignInStatus::Failed;
  std::string userId;
  std::string displayName;
  // The server's reason on Denied or Failed, shown to the person.
  std::string message;
};

// One sign-in from start to stored session.
//
// Thread affinity: one thread runs begin() and finish(). cancel() may be
// called from any thread.
//
// Ownership: the flow owns its listener. It borrows the store and the
// endpoint, which must outlive it.
class SignInFlow {
public:
  SignInFlow(SecretStore& store, TokenEndpoint& endpoint, AccountSessionOptions options);

  // Open the listener and return the URL to open in the system browser.
  // Nullopt when no loopback port could be opened.
  std::optional<std::string> begin(std::string_view app, std::string_view deviceName);

  // Wait for the browser, exchange the code and store the session.
  SignInResult finish(std::chrono::milliseconds timeout);

  void cancel();

private:
  SecretStore& store_;
  TokenEndpoint& endpoint_;
  AccountSessionOptions options_;
  // Guards listener_. begin() and finish() set and destroy it on their
  // thread. cancel() reaches it from any thread.
  std::mutex listenerMutex_;
  std::unique_ptr<LoopbackListener> listener_;
  Pkce pkce_;
  std::string state_;
};

} // namespace nodetool::account
