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

// Audio Options and Audio Role sit together in the Clip menu's first group.
constexpr int kMenuOrder = 8;

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
        const QString reason = QStringLiteral("Select an audio clip first.");
        const nt::app::MenuPredicate sounding = [](const QVariantMap& context) { return soundingSelected(context) > 0; };
        const nt::app::MenuPredicate checked = [role](const QVariantMap& context) { return roleChecked(context, role); };
        nt::app::registerShellMenuItem({"Clip", "audioRole." + role, roleLabel(role), {}, "Audio Role", "options", kMenuOrder + order, sounding, checked, {}, reason});
        nt::app::registerMenuItem({"clip", "audioRole." + role, roleLabel(role), {}, sounding, {}, order++, checked, reason, "Audio role"});
    }
    nt::wiring::registerKeyAction({"audioRole.none", "Clear the audio role", {}, setRole({}), "Audio"});
    const nt::app::MenuPredicate hasExplicitRole = [](const QVariantMap& context) {
        // A generated voice or music clip keeps the role it was made with.
        auto* controller = controllerOf(context);
        auto* gestures = gesturesOf(context);
        return controller && gestures && controller->roleSummary(gestures->selection()).value("explicitCount").toInt() > 0;
    };
    const QString noRole = QStringLiteral("The selected clips have no audio role to clear.");
    nt::app::registerShellMenuItem({"Clip", "audioRole.none", "No Role", {}, "Audio Role", "options", kMenuOrder + order, hasExplicitRole, {}, {}, noRole});
    nt::app::registerMenuItem({"clip", "audioRole.none", "No role", {}, hasExplicitRole, {}, order, {}, noRole, "Audio role"});

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
    const QString busyReason = QStringLiteral("Select audio clips first, and wait for the running job.");
    nt::app::registerShellMenuItem({"Clip", "matchLoudness", "Match Loudness", {}, "Audio Options", "options", 6, idle, {}, {}, busyReason});
    nt::app::registerShellMenuItem({"Clip", "duckMusic", "Duck Music Under Dialogue", {}, "Audio Options", "options", 7, idle, {}, {}, busyReason});
    return true;
}();

}  // namespace
