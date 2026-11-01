#pragma once

#include "server/AutosaveController.h"
#include <QProcessEnvironment>

namespace nt::server {
inline QProcessEnvironment timelineLaunchEnvironment(const SaveTarget& target) {
    auto environment = QProcessEnvironment::systemEnvironment();
    environment.insert(QStringLiteral("NODETOOL_API_TOKEN"), target.token);
    return environment;
}
}
