#pragma once
#include "server/ServerClient.h"

namespace nt::assets {
struct ImportResult {
    QJsonObject asset;
    QString error;
    QString proxyError;
    bool proxyAvailable = false;
    bool ok() const { return error.isEmpty() && !asset.isEmpty(); }
};
ImportResult importFile(nt::server::ServerClient& client, const QString& file, const QJsonObject& fields = {});
}
