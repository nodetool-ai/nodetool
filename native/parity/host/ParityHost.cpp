#include "ParityHost.h"

#include <QElapsedTimer>
#include <QHash>
#include <QImage>
#include <QJsonDocument>
#include <QMetaMethod>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTest>

namespace nodetool::parity {
namespace {

QJsonObject failure(const QString &message) {
    return {{"ok", false}, {"error", message}};
}

// Web KeyboardEvent.key names, as scenarios write them, to Qt keys.
std::optional<Qt::Key> qtKey(const QString &name) {
    static const QHash<QString, Qt::Key> keys{
        {"ArrowDown", Qt::Key_Down}, {"ArrowUp", Qt::Key_Up}, {"ArrowLeft", Qt::Key_Left},
        {"ArrowRight", Qt::Key_Right}, {"Enter", Qt::Key_Return}, {"Escape", Qt::Key_Escape},
        {"Tab", Qt::Key_Tab}, {"Backspace", Qt::Key_Backspace}, {"Delete", Qt::Key_Delete},
        {"Home", Qt::Key_Home}, {"End", Qt::Key_End}, {" ", Qt::Key_Space}, {"Space", Qt::Key_Space}};
    if (const auto found = keys.constFind(name); found != keys.cend()) {
        return *found;
    }
    if (name.size() == 1 && name[0].isLetterOrNumber()) {
        return Qt::Key(name[0].toUpper().unicode());
    }
    return std::nullopt;
}

// "Mod" is Control on every platform here: the host runs offscreen.
Qt::KeyboardModifiers modifiers(const QJsonArray &names) {
    Qt::KeyboardModifiers result;
    for (const auto &value : names) {
        const auto name = value.toString();
        if (name == "Shift") {
            result |= Qt::ShiftModifier;
        } else if (name == "Control" || name == "Mod") {
            result |= Qt::ControlModifier;
        } else if (name == "Alt") {
            result |= Qt::AltModifier;
        } else if (name == "Meta") {
            result |= Qt::MetaModifier;
        }
    }
    return result;
}

QJsonValue jsonFromVariant(const QVariant &value) {
    return QJsonValue::fromVariant(value);
}

}  // namespace

ParityHost::ParityHost(QObject *parent) : QObject(parent), engine_(std::make_unique<QQmlEngine>()) {}

ParityHost::~ParityHost() {
    unmount();
}

QJsonObject ParityHost::handle(const QJsonObject &command) {
    const auto name = command["cmd"].toString();
    QElapsedTimer timer;
    timer.start();
    QJsonObject reply;
    if (name == "mount") {
        reply = mount(command);
    } else if (name == "act") {
        reply = act(command);
    } else if (name == "observe") {
        reply = observe(command);
    } else if (name == "unmount") {
        unmount();
        reply = {{"ok", true}};
    } else if (name == "hello") {
        QJsonArray names;
        for (const auto &mount : mountNames()) {
            names.append(mount);
        }
        reply = {{"ok", true}, {"surface", "qt"}, {"components", names}, {"qt", QString::fromLatin1(qVersion())}};
    } else {
        reply = failure(QString("Unknown command %1").arg(name));
    }
    if (command.contains("id")) {
        reply["id"] = command["id"];
    }
    reply["ms"] = double(timer.nsecsElapsed()) / 1e6;
    return reply;
}

QJsonObject ParityHost::mount(const QJsonObject &command) {
    unmount();
    QString error;
    auto mount = makeMount(command["component"].toString(), command["fixture"].toObject(), error);
    if (!mount) {
        return failure(error);
    }
    theme_ = command["theme"].toString("dark");
    auto *theme = engine_->singletonInstance<QObject *>("NodeTool.UiPrimitives", "Theme");
    if (!theme) {
        return failure("The NodeTool.UiPrimitives Theme singleton is not available");
    }
    // Theme.Scheme: Dark is 2, Light is 3.
    theme->setProperty("preference", theme_ == "light" ? 3 : 2);
    mount_ = std::move(mount);
    for (auto *object : mount_->interfaces()) {
        const auto *meta = object->metaObject();
        for (int i = meta->methodOffset(); i < meta->methodCount(); ++i) {
            const auto method = meta->method(i);
            if (method.methodType() != QMetaMethod::Signal || !method.name().endsWith("Requested")) {
                continue;
            }
            const auto interfaceName = QString::fromLatin1(meta->className()).section("::", -1);
            spies_.push_back({interfaceName + "." + QString::fromLatin1(method.name()),
                              std::make_unique<QSignalSpy>(object, method)});
        }
    }
    view_ = std::make_unique<QQuickView>(engine_.get(), nullptr);
    view_->setResizeMode(QQuickView::SizeRootObjectToView);
    view_->setInitialProperties(mount_->initialProperties());
    view_->setSource(mount_->source());
    if (view_->status() != QQuickView::Ready) {
        QStringList messages;
        for (const auto &e : view_->errors()) {
            messages.append(e.toString());
        }
        unmount();
        return failure(QString("The component did not load: %1").arg(messages.join("; ")));
    }
    view_->resize(mount_->size());
    view_->show();
    if (!QTest::qWaitForWindowExposed(view_.get())) {
        unmount();
        return failure("The component window was never exposed");
    }
    mount_->opened(*view_->rootObject());
    settle();
    pendingIntents_ = {};
    drainIntents();
    pendingIntents_ = {};
    return {{"ok", true}, {"width", view_->width()}, {"height", view_->height()}};
}

void ParityHost::unmount() {
    spies_.clear();
    pendingIntents_ = {};
    view_.reset();
    mount_.reset();
}

// Processes events until the component's probe holds still for three passes:
// timers such as a search debounce have fired and bindings have settled.
void ParityHost::settle() {
    if (!view_ || !view_->rootObject()) {
        return;
    }
    QJsonObject last;
    int stable = 0;
    for (int pass = 0; pass < 100 && stable < 3; ++pass) {
        QTest::qWait(10);
        const auto now = mount_->probe(*view_->rootObject());
        stable = now == last ? stable + 1 : 0;
        last = now;
    }
}

QJsonArray ParityHost::drainIntents() {
    for (auto &entry : spies_) {
        while (entry.taken < entry.spy->size()) {
            QJsonArray args;
            for (const auto &arg : entry.spy->at(entry.taken)) {
                args.append(jsonFromVariant(arg));
            }
            pendingIntents_.append(QJsonObject{{"intent", entry.name}, {"args", args}});
            ++entry.taken;
        }
    }
    return pendingIntents_;
}

QQuickItem *ParityHost::findTarget(const QString &name) const {
    auto *root = view_ ? view_->rootObject() : nullptr;
    if (!root) {
        return nullptr;
    }
    if (root->objectName() == name) {
        return root;
    }
    return root->findChild<QQuickItem *>(name);
}

QJsonObject ParityHost::act(const QJsonObject &command) {
    if (!view_) {
        return failure("Nothing is mounted");
    }
    const auto action = command["action"].toObject();
    const auto type = action["type"].toString();
    if (type == "key") {
        const auto key = qtKey(action["key"].toString());
        if (!key) {
            return failure(QString("Unknown key %1").arg(action["key"].toString()));
        }
        QTest::keyClick(view_.get(), *key, modifiers(action["modifiers"].toArray()));
    } else if (type == "type") {
        // QTest::keyClicks has no QWindow overload.
        for (const auto ch : action["text"].toString().toLatin1()) {
            QTest::keyClick(view_.get(), ch);
        }
    } else if (type == "click" || type == "hover") {
        auto *target = findTarget(action["target"].toString());
        if (!target) {
            return failure(QString("No item named %1").arg(action["target"].toString()));
        }
        const auto centre = target->mapToScene(QPointF(target->width() / 2, target->height() / 2)).toPoint();
        if (type == "click") {
            QTest::mouseClick(view_.get(), Qt::LeftButton, {}, centre);
        } else {
            QTest::mouseMove(view_.get(), centre);
        }
    } else {
        return failure(QString("Unknown action %1").arg(type));
    }
    settle();
    drainIntents();
    return {{"ok", true}};
}

QJsonObject ParityHost::observe(const QJsonObject &command) {
    if (!view_ || !view_->rootObject()) {
        return failure("Nothing is mounted");
    }
    settle();
    QJsonObject reply{{"ok", true}, {"state", mount_->probe(*view_->rootObject())}, {"intents", drainIntents()}};
    pendingIntents_ = {};
    if (const auto path = command["screenshot"].toString(); !path.isEmpty()) {
        const auto image = view_->grabWindow();
        if (image.isNull() || !image.save(path)) {
            return failure(QString("Could not write %1").arg(path));
        }
        reply["screenshot"] = path;
    }
    return reply;
}

}  // namespace nodetool::parity
