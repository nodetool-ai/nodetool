#pragma once
#include "server/ServerClient.h"

namespace nt::assets {
QJsonObject withProbedVideoDuration(nt::server::ServerClient& client, QJsonObject asset);
}
