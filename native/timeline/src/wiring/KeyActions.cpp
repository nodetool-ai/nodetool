#include "wiring/KeyActions.h"
#include <QDebug>
#include <algorithm>

namespace {
std::vector<nt::wiring::KeyAction>& actions() {
    static std::vector<nt::wiring::KeyAction> value;
    return value;
}
}
bool nt::wiring::registerKeyAction(KeyAction action) {
    if (action.name.isEmpty() || action.label.isEmpty() || !action.handler ||
        std::ranges::any_of(actions(), [&](const auto& existing) { return existing.name == action.name; }) ||
        std::ranges::any_of(action.defaultKeys, [](const auto& key) { return key.count() != 1; })) {
        qWarning().noquote() << "Refused key action" << action.name;
        return false;
    }
    actions().push_back(std::move(action));
    return true;
}
const std::vector<nt::wiring::KeyAction>& nt::wiring::keyActions() { return actions(); }
