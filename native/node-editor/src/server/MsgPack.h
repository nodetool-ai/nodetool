#pragma once
#include <QByteArray>
#include <QJsonValue>
#include <optional>
namespace nodetool::node_editor {
QByteArray encodeMsgPack(const QJsonValue &value);
std::optional<QJsonValue> decodeMsgPack(const QByteArray &bytes);
} // namespace nodetool::node_editor
