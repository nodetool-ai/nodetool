#pragma once

#include <QKeySequence>
#include <QVariantMap>
#include <functional>
#include <vector>

class ClipGestureController;
namespace nt::wiring {
struct KeyAction {
    QString name;
    QString label;
    QList<QKeySequence> defaultKeys;
    std::function<bool(ClipGestureController&, const QVariantMap&)> handler;
};
bool registerKeyAction(KeyAction action);
const std::vector<KeyAction>& keyActions();
}
