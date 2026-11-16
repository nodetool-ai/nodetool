// The one request layer that attaches the cloud credential (WP1.10). It
// replaces the apps' scattered `Authorization` header writes: every request
// to the cloud server goes through send(), which applies the request rule of
// the account session first.
#pragma once

#include "nodetool/account/account_session.h"
#include "nodetool/account/http_transport.h"

#include <string>

namespace nodetool::account {

enum class CloudSendStatus {
  // The request went out. `response` holds what came back, which may be an
  // error status.
  Sent,
  // The session is signed out, or the server ended it. Nothing was sent,
  // or the one retry after a refresh was refused.
  SignedOut,
  // The token could not be renewed, or the server did not answer.
  Offline,
  // The URL is not on this session's server, or the session's server is
  // not an HTTPS origin. Nothing was sent, so the credential never reaches
  // another host.
  WrongServer,
  // The session moved to signed out while the request was out, and the
  // request was stopped.
  Cancelled,
};

struct CloudSendResult {
  CloudSendStatus status = CloudSendStatus::Offline;
  HttpResponse response;
};

// Thread affinity: thread-safe. AccountSession and the transport are
// thread-safe, and this class holds no mutable state.
class CloudClient {
public:
  // The client sends only to the session's own origin
  // (AccountSession::serverOrigin), so it cannot be pointed at another host.
  CloudClient(AccountSession& session, HttpTransport& transport);

  // Attaches `Authorization: Bearer <access token>` and sends, with the
  // session's origin as the request's required origin and the session's
  // cancel flag. A redirect is returned as the response, never followed.
  // On a 401 it renews the token, refusing to reuse the rejected one, and
  // sends once more with a different token. Any `Authorization` header in
  // `request` is replaced.
  CloudSendResult send(HttpRequest request);

  const std::string& serverOrigin() const { return session_.serverOrigin(); }

private:
  AccountSession& session_;
  HttpTransport& transport_;
};

} // namespace nodetool::account
