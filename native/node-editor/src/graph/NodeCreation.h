#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QPointF>
#include <QString>

namespace nodetool {
struct NodeCreationOptions {
  QString id;
  bool paletteStarters = false;
  QString receivingName;
  bool useMetadataStyle = false;
  QJsonObject defaultModels;
};
// Produces a canonical node only. Callers submit addNode in their atomic gesture.
QJsonObject createNativeNode(const QJsonObject &metadata, QPointF position,
                            const QJsonArray &existingNodes,
                            const QJsonObject &overrides = {},
                            const NodeCreationOptions &options = {});
}
