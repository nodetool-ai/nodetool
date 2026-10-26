#pragma once

#include "model/TimelineTypes.h"
#include <functional>

class QUndoStack;

namespace nt::server::sync {
// Installed by the executable. The server library has no TimelineModel dependency.
using DocumentApplier = std::function<bool(QUndoStack*, const QJsonObject&, const nt::Timeline&)>;
void setDocumentApplier(DocumentApplier applier);
bool applyDocument(QUndoStack* undo, const QJsonObject& raw, const nt::Timeline& resolved);
QJsonObject applyAcceptedUnit(QJsonObject raw, const QJsonObject& conflict);
} // namespace nt::server::sync
