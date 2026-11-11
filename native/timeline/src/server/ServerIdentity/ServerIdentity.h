#pragma once

#include "server/ServerClient.h"
#include <QString>
#include <functional>

namespace nt::server::identity {
using BeforeWriteHook = std::function<QString()>;
void setBeforeWriteHook(BeforeWriteHook hook);
QString beforeWrite();
struct WriteResult {
    HttpResponse response;
    QString code;
    QString error;
};
// The optional file is streamed between body and tail, after proof succeeds.
WriteResult write(QNetworkRequest request, const QByteArray& secret, const QByteArray& body, QIODevice* file,
                  const QByteArray& tail, int timeoutMs, int deadlineMs);
}  // namespace nt::server::identity
