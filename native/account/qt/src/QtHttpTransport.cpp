#include "nodetool/account/qt/QtHttpTransport.h"

#include <QByteArray>
#include <QEventLoop>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>

#include <memory>

namespace nodetool::account::qt {

HttpResponse QtHttpTransport::send(const HttpRequest& request) {
  QNetworkAccessManager network;
  QNetworkRequest out(QUrl(QString::fromStdString(request.url)));
  out.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  out.setTransferTimeout(static_cast<int>(request.timeout.count()));
  for (const auto& [name, value] : request.headers) {
    out.setRawHeader(QByteArray::fromStdString(name), QByteArray::fromStdString(value));
  }
  // The reply is deleted with this scope, before the manager.
  const std::unique_ptr<QNetworkReply> reply(
      network.sendCustomRequest(out, QByteArray::fromStdString(request.method), QByteArray::fromStdString(request.body)));
  QEventLoop loop;
  QObject::connect(reply.get(), &QNetworkReply::finished, &loop, &QEventLoop::quit);
  if (!reply->isFinished()) {
    loop.exec();
  }
  HttpResponse response;
  const QVariant status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute);
  if (!status.isValid()) {
    // No HTTP answer arrived: the host is unreachable, the connection failed
    // or the timeout passed.
    return response;
  }
  response.status = status.toInt();
  response.body = reply->readAll().toStdString();
  return response;
}

} // namespace nodetool::account::qt
