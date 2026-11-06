#pragma once
#include <QJsonArray>
#include <QJsonObject>

namespace nt::ai {
// Workflow input nodes in graph order, keyed by the node's declared name.
// Each row carries the current override or the form's default when available.
QJsonArray workflowInputs(const QJsonObject& workflow, const QJsonObject& overrides);
}
