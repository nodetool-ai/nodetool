#include "AudioRoleJson.h"
#include "AudioRoles.h"
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"

namespace {

using nt::audioroles::isRole;
using nt::audioroles::roleLabel;
using nt::audioroles::roles;

ClipGestureController* gesturesOf(const QVariantMap& context) {
    return qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
}
AudioRoles* controllerOf(const QVariantMap& context) {
    auto* gestures = gesturesOf(context);
    return gestures ? AudioRoles::forTimeline(gestures->timeline()) : nullptr;
}
// The selected clips that carry sound.
int soundingSelected(const QVariantMap& context) {
    auto* roles = controllerOf(context);
    auto* gestures = gesturesOf(context);
    return roles && gestures ? roles->roleSummary(gestures->selection()).value("count").toInt() : 0;
}
bool roleChecked(const QVariantMap& context, const QString& role) {
    auto* controller = controllerOf(context);
    auto* gestures = gesturesOf(context);
    return controller && gestures && controller->roleSummary(gestures->selection()).value("role").toString() == role;
}

// The Clip menu shows the built-in items first, then these as one group.
constexpr int kMenuOrder = 100;

const bool registered = [] {
    auto setRole = [](const QString& role) {
        return [role](ClipGestureController& gestures, const QVariantMap&) {
            auto* controller = AudioRoles::forTimeline(gestures.timeline());
            return controller && !gestures.selection().isEmpty() && controller->setRole(gestures.selection(), role);
        };
    };
    int order = 0;
    for (const auto& role : roles()) {
        nt::wiring::registerKeyAction({"audioRole." + role, "Set audio role to " + roleLabel(role), {}, setRole(role), "Audio"});
        nt::app::registerShellMenuItem({"Clip", "audioRole." + role, roleLabel(role), {}, "Audio role", "audio", kMenuOrder + order++,
            [](const QVariantMap& context) { return soundingSelected(context) > 0; },
            [role](const QVariantMap& context) { return roleChecked(context, role); }});
    }
    nt::wiring::registerKeyAction({"audioRole.none", "Clear the audio role", {}, setRole({}), "Audio"});
    nt::app::registerShellMenuItem({"Clip", "audioRole.none", "No role", {}, "Audio role", "audio", kMenuOrder + order,
        [](const QVariantMap& context) {
            // A generated voice or music clip keeps the role it was made with.
            auto* controller = controllerOf(context);
            auto* gestures = gesturesOf(context);
            return controller && gestures && controller->roleSummary(gestures->selection()).value("explicitCount").toInt() > 0;
        }});

    nt::wiring::registerKeyAction({"matchLoudness", "Match loudness to the role targets", {},
        [](ClipGestureController& gestures, const QVariantMap&) {
            auto* controller = AudioRoles::forTimeline(gestures.timeline());
            if (!controller || controller->busy()) return false;
            controller->matchLoudness(gestures.selection());
            return true;
        }, "Audio"});
    nt::wiring::registerKeyAction({"duckMusic", "Duck music and ambience under dialogue", {},
        [](ClipGestureController& gestures, const QVariantMap&) {
            auto* controller = AudioRoles::forTimeline(gestures.timeline());
            if (!controller || controller->busy()) return false;
            controller->duck(gestures.selection());
            return true;
        }, "Audio"});
    const auto idle = [](const QVariantMap& context) {
        auto* controller = controllerOf(context);
        return controller && !controller->busy();
    };
    nt::app::registerShellMenuItem({"Clip", "matchLoudness", "Match loudness", {}, {}, "audio", kMenuOrder + 10, idle});
    nt::app::registerShellMenuItem({"Clip", "duckMusic", "Duck music under dialogue", {}, {}, "audio", kMenuOrder + 11, idle});
    return true;
}();

}  // namespace
