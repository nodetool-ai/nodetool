// The one place the native apps attach their NodeTool server's token to a
// request (technical design RF13, WP1.10). A cloud document's requests go
// through CloudClient, which attaches the account's credential. Every other
// request to the app's own server, local or self-hosted, calls
// attachServerToken(), which sends the token to that server's origin only.
#pragma once

#include <QByteArray>
#include <QNetworkRequest>
#include <QString>
#include <QUrl>

namespace nodetool::account::qt {

// The HTTP origin a URL belongs to: `ws` counts as `http` and `wss` as
// `https`, so a socket to the server shares the server's origin. The port
// is the scheme's default when the URL names none.
inline bool sameServerOrigin(const QUrl& a, const QUrl& b) {
  const auto http = [](const QString& scheme) {
    return scheme == u"wss" ? QStringLiteral("https") : scheme == u"ws" ? QStringLiteral("http") : scheme;
  };
  const QString schemeA = http(a.scheme());
  const QString schemeB = http(b.scheme());
  if (schemeA != schemeB || (schemeA != u"http" && schemeA != u"https") || a.host().isEmpty()) {
    return false;
  }
  const int port = schemeA == u"https" ? 443 : 80;
  return a.host().compare(b.host(), Qt::CaseInsensitive) == 0 && a.port(port) == b.port(port);
}

// Sets `Authorization: Bearer <token>` when the token is not empty and the
// request goes to `server`'s origin. Returns whether it did. A request to
// another host, such as a media URL from a provider, never carries it.
inline bool attachServerToken(QNetworkRequest& request, const QUrl& server, const QString& token) {
  if (token.isEmpty() || !sameServerOrigin(request.url(), server)) {
    return false;
  }
  request.setRawHeader("Authorization", "Bearer " + token.toUtf8());
  return true;
}

} // namespace nodetool::account::qt
