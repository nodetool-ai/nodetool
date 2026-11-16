// HttpTransport over QNetworkAccessManager, for the Qt apps.
#pragma once

#include "nodetool/account/http_transport.h"

namespace nodetool::account::qt {

// Thread affinity: thread-safe. Each send() creates its own network access
// manager and event loop on the calling thread, so calls share nothing.
// send() blocks, so it runs on a worker thread, never the UI thread.
//
// Redirects are never followed: a redirect would carry the credential to
// another URL. A redirect status is returned to the caller as it is.
class QtHttpTransport final : public HttpTransport {
public:
  HttpResponse send(const HttpRequest& request) override;
};

} // namespace nodetool::account::qt
