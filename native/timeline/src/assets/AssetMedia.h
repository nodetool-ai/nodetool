#pragma once
#include "model/TimelineTypes.h"
#include "server/ServerClient.h"

namespace nt::assets {
nt::Clip resolveDroppedMedia(nt::server::ServerClient& client, const QString& cacheRoot,
                             const QJsonObject& asset, const QJsonObject& clip);
}
