#include "nodetool/account/qt/QtHttpTransport.h"

#include "nodetool/account/origin.h"

#include <QByteArray>
#include <QEventLoop>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QTimer>
#include <QUrl>

#include <chrono>
#include <memory>

namespace nodetool::account::qt {
namespace {

// How often a request in flight checks its cancel flag.
constexpr std::chrono::milliseconds kCancelPoll{25};

// Whether the reply failed below HTTP: the connection, the proxy, TLS, a
// body cut short after the headers, or the abort of a deadline or cancel.
// An HTTP error status also sets an error, in the content and server
// ranges, and is a complete response.
bool transportFailed(QNetworkReply::NetworkError error) {
  if (error == QNetworkReply::NoError) {
    return false;
  }
  return error < QNetworkReply::ContentAccessDenied || error == QNetworkReply::ProtocolFailure ||
         error == QNetworkReply::UnknownNetworkError || error == QNetworkReply::UnknownProxyError;
}

} // namespace

HttpResponse QtHttpTransport::send(const HttpRequest& request) {
  HttpResponse response;
  if (request.cancel && request.cancel->cancelled()) {
    return response;
  }
  if (!request.requiredOrigin.empty()) {
    // A request that carries a credential goes only to its own origin.
    const std::optional<std::string> origin = httpsOriginOfUrl(request.url);
    if (!origin || *origin != request.requiredOrigin) {
      return response;
    }
  }
  QNetworkAccessManager network;
  QNetworkRequest out(QUrl(QString::fromStdString(request.url)));
  out.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  // Qt's transfer timeout measures inactivity. The deadline below bounds
  // the whole request, so a server that sends a byte at a time cannot hold
  // it open.
  out.setTransferTimeout(static_cast<int>(request.timeout.count()));
  for (const auto& [name, value] : request.headers) {
    out.setRawHeader(QByteArray::fromStdString(name), QByteArray::fromStdString(value));
  }
  // The reply is deleted with this scope, before the manager. The timers
  // are declared after it, so they stop before it goes.
  const std::unique_ptr<QNetworkReply> reply(
      network.sendCustomRequest(out, QByteArray::fromStdString(request.method), QByteArray::fromStdString(request.body)));
  QEventLoop loop;
  QObject::connect(reply.get(), &QNetworkReply::finished, &loop, &QEventLoop::quit);
  QTimer deadline;
  deadline.setSingleShot(true);
  QObject::connect(&deadline, &QTimer::timeout, reply.get(), &QNetworkReply::abort);
  QTimer cancelPoll;
  if (request.cancel) {
    QObject::connect(&cancelPoll, &QTimer::timeout, reply.get(), [&reply, &request] {
      if (request.cancel->cancelled()) {
        reply->abort();
      }
    });
    cancelPoll.start(kCancelPoll);
  }
  if (!reply->isFinished()) {
    deadline.start(request.timeout);
    loop.exec();
  }
  if (transportFailed(reply->error())) {
    // No complete answer arrived: the host is unreachable, the connection
    // failed or broke after the headers, the deadline passed, or the
    // request was cancelled.
    return response;
  }
  const QVariant status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute);
  if (!status.isValid()) {
    return response;
  }
  response.status = status.toInt();
  response.body = reply->readAll().toStdString();
  return response;
}

} // namespace nodetool::account::qt
