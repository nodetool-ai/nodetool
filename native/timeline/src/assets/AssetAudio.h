#pragma once
#include "server/ServerClient.h"

namespace nt::assets {
// Blocking download, decode and upload. Runs in AssetBrowser's worker.
QJsonObject extractLinkedAudio(nt::server::ServerClient& client, const QJsonObject& video);
}
