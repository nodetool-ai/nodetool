#pragma once
#include "edit/ClipOps.h"

namespace nt::edit::groups {
ClipList moveGroup(const ClipList &clips, const QString &groupId, double deltaMs, bool followLinks = false);
ClipList trimGroup(const ClipList &clips, const QString &groupId, const QString &edge, double deltaMs);
ClipList ungroup(const ClipList &clips, const QString &groupId);
std::optional<Gap> childSpanMs(const ClipList &clips, const QString &groupId);
QJsonObject applyGroupEdit(const QString &name, QJsonObject raw, const QJsonObject &payload);
} // namespace nt::edit::groups
