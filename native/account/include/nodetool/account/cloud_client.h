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
  // The URL is not on this session's server. Nothing was sent, so the
  // credential never reaches another host.
  WrongServer,
};

struct CloudSendResult {
  CloudSendStatus status = CloudSendStatus::Offline;
  HttpResponse response;
};

// Thread affinity: thread-safe. AccountSession and the transport are
// thread-safe, and this class holds no mutable state.
class CloudClient {
public:
  // `serverOrigin` must be the origin the session signed in to.
  CloudClient(AccountSession& session, HttpTransport& transport, std::string serverOrigin);

  // Attaches `Authorization: Bearer <access token>` and sends. On a 401 it
  // renews the token once and sends again, so a token that expired in
  // flight costs one retry. Any `Authorization` header in `request` is
  // replaced.
  CloudSendResult send(HttpRequest request);

  const std::string& serverOrigin() const { return origin_; }

private:
  bool onServer(const std::string& url) const;

  AccountSession& session_;
  HttpTransport& transport_;
  const std::string origin_;
};

} // namespace nodetool::account
