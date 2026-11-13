#pragma once
#include <QQuickItem>
#include <QQuickWidget>
#include <QStringList>
#include <QtTest>
#include <QVariantList>
#include <QVariantMap>

// Helpers for the menus that EditorWindow::showEntryMenu shows in a Quick
// overlay named "context-menu-host". `kind` is the menuKind property, such as
// "more", "workflow-tab-menu" or "zoom-presets-menu".
namespace entry_menu {

inline QQuickWidget *host(QWidget &window, const QString &kind = {}) {
    for (auto *candidate : window.findChildren<QQuickWidget *>("context-menu-host")) {
        if (!candidate->isHidden() && (kind.isEmpty() || candidate->property("menuKind").toString() == kind)) {
            return candidate;
        }
    }
    return nullptr;
}

inline QVariantList entries(QQuickWidget *menu) {
    return menu ? menu->rootObject()->property("entries").toList() : QVariantList{};
}

inline QStringList labels(QQuickWidget *menu) {
    QStringList result;
    for (const auto &value : entries(menu)) {
        const auto row = value.toMap();
        if (row.contains("label")) {
            result << row["label"].toString();
        }
    }
    return result;
}

// The entry map with this label, or an empty map.
inline QVariantMap entry(QQuickWidget *menu, const QString &label) {
    for (const auto &value : entries(menu)) {
        if (value.toMap()["label"].toString() == label) {
            return value.toMap();
        }
    }
    return {};
}

inline QQuickItem *item(QQuickWidget *menu, const QString &id) {
    QVariant result;
    QMetaObject::invokeMethod(menu->rootObject(), "itemFor", Q_RETURN_ARG(QVariant, result), Q_ARG(QVariant, id));
    return qobject_cast<QQuickItem *>(result.value<QObject *>());
}

inline bool click(QQuickWidget *menu, const QString &id) {
    auto *target = item(menu, id);
    if (!target || !QTest::qWaitFor([&] { return target->isVisible() && target->width() > 0; }, 2000)) {
        return false;
    }
    const auto centre = target->mapToScene(QPointF(target->width() / 2, target->height() / 2)).toPoint();
    QTest::mouseMove(menu, centre);
    QTest::qWait(30);
    QTest::mouseClick(menu, Qt::LeftButton, Qt::NoModifier, centre);
    return true;
}

} // namespace entry_menu
