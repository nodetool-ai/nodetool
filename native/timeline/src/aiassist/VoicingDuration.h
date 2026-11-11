#pragma once
#include "server/ServerClient.h"
namespace nt::aiassist {
// Metadata first, then a headless probe of the original audio. Never plays sound.
double voicingDurationMs(nt::server::ServerClient& client, const QJsonObject& asset);
}
