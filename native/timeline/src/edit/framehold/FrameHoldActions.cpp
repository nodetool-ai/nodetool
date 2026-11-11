// The frame hold actions, the Clip menu and the clip context menu. qml/framehold/FrameHoldHost.qml runs them.
#include "app/MenuRegistry.h"
#include "edit/ClipGestureController.h"
#include "wiring/KeyActions.h"
#include "wiring/w/SceneItems.h"

namespace {
bool editorOpen(const QVariantMap& context) { return context.value(QStringLiteral("gestures")).value<QObject*>() != nullptr; }
bool editable(const QVariantMap& context) { return context.value(QStringLiteral("editable"), true).toBool(); }
bool videoClip(const QVariantMap& context) { return context.value(QStringLiteral("mediaType")).toString() == u"video"; }
const bool registered = [] {
    struct Command { const char* action; const char* method; const char* label; const char* barLabel; const char* menuLabel; int order; };
    const Command commands[] = {
        {"frameHoldOptions", "openOptions", "Frame hold options of selected clips", "Frame Hold Options…", "Frame hold options…", 0},
        {"frameHoldAdd", "add", "Hold the frame at the playhead until the clip's end", "Add Frame Hold", "Add frame hold", 1},
        {"frameHoldInsert", "openInsert", "Split at the playhead and insert a frame hold", "Insert Frame Hold Segment…", "Insert frame hold segment…", 2}};
    for (const auto& command : commands) {
        const QString action = QString::fromLatin1(command.action);
        const QByteArray method = command.method;
        nt::wiring::registerKeyAction({action, QString::fromUtf8(command.label), {},
            [method](ClipGestureController& gestures, const QVariantMap& context) {
                auto* host = nt::wiring::w::windowItem(&gestures, QStringLiteral("frameHoldHost"));
                QVariant done;
                return host && QMetaObject::invokeMethod(host, method.constData(), Q_RETURN_ARG(QVariant, done),
                    Q_ARG(QVariant, QVariant::fromValue<QObject*>(&gestures)), Q_ARG(QVariant, context)) && done.toBool();
            }, QStringLiteral("Editing")});
        nt::app::registerShellMenuItem({QStringLiteral("Clip"), action, QString::fromUtf8(command.barLabel), {}, QStringLiteral("Video Options"),
            QStringLiteral("options"), command.order, editorOpen, {}, {}, QStringLiteral("Open a timeline first.")});
        nt::app::registerMenuItem({QStringLiteral("clip"), action, QString::fromUtf8(command.menuLabel), {}, editable,
            QStringLiteral("frame"), 20 + command.order, {}, QStringLiteral("Unlock the clip first."), {}, videoClip});
    }
    return true;
}();
}  // namespace
