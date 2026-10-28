// Opt-in real-application driver. Window activation is confined to check mode.
#include "app/Menus/ShellMenus.h"
#include "model/TimelineModel.h"
#include "server/AutosaveController.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QKeyEvent>
#include <QMouseEvent>
#include <QPointer>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQmlExpression>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTimer>

namespace {
QQuickItem *findItem(QQuickItem *root, const QString &name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = findItem(child, name)) {
            return found;
        }
    }
    return nullptr;
}
void key(QQuickWindow *window, Qt::Key code, Qt::KeyboardModifiers modifiers = {}) {
    const auto text =
        code >= Qt::Key_A && code <= Qt::Key_Z ? QString(QChar(static_cast<char16_t>(code))).toLower() : QString();
    QKeyEvent press(QEvent::KeyPress, code, modifiers, text);
    QKeyEvent release(QEvent::KeyRelease, code, modifiers, text);
    QCoreApplication::sendEvent(window, &press);
    QCoreApplication::sendEvent(window, &release);
}
void click(QQuickWindow *window, QPointF point) {
    const auto global = window->mapToGlobal(point.toPoint());
    QMouseEvent press(QEvent::MouseButtonPress, point, point, global, Qt::LeftButton, Qt::LeftButton, {});
    QMouseEvent release(QEvent::MouseButtonRelease, point, point, global, Qt::LeftButton, Qt::NoButton, {});
    QCoreApplication::sendEvent(window, &press);
    QCoreApplication::sendEvent(window, &release);
}
bool require(bool ok, const char *message) {
    if (!ok) {
        qCritical("DOCUMENT CHECK FAIL: %s", message);
        QCoreApplication::exit(91);
    }
    return ok;
}
void drive(QQuickWindow *window, QQuickItem *editor, const QString &mode) {
    auto *model = editor->property("timeline").value<TimelineModel *>();
    auto *shell = findItem(editor, "appShell");
    auto *menu = shell ? shell->findChild<nt::app::ShellMenus *>() : nullptr;
    if (!require(model && menu, "real editor and AppShell menus must exist")) {
        return;
    }
    const auto finish = [window, model, menu] {
        const auto menus =
            nt::app::shellMenuDescription(menu->keyboardPreset(), menu->preferences()->recentTimelines());
        QJsonObject result{{"id", model->timeline().raw.value("id")},
                           {"width", model->canvasWidth()},
                           {"height", model->canvasHeight()},
                           {"fps", model->fps()},
                           {"recent", QJsonArray::fromVariantList(menu->preferences()->recentTimelines())},
                           {"recentMenuEntries", static_cast<int>(menus.front().items.front().children.size())}};
        QFile file(qEnvironmentVariable("NT_TIMELINE_DOCUMENT_RESULT"));
        if (require(file.open(QIODevice::WriteOnly), "result file must open")) {
            file.write(QJsonDocument(result).toJson());
            file.close();
            window->close();
            QCoreApplication::quit();
        }
    };
    if (mode == "opened") {
        finish();
        return;
    }
    const QPointer<QQuickItem> previousFocus = window->activeFocusItem();
    const auto invokeButton = [window](const QString &name) {
        auto *button = findItem(window->contentItem(), name);
        if (!require(button && button->isVisible() && button->isEnabled(), "document action button must be mounted")) {
            return false;
        }
        click(window, button->mapToScene({button->width() / 2, button->height() / 2}));
        return true;
    };
    const auto edit = [model, editor] {
        auto *save = qobject_cast<nt::server::AutosaveController *>(editor->property("saver").value<QObject *>());
        return require(save &&
                           model->applyEdit("setProjectSettings", {{"width", 1280}, {"height", 720}, {"fps", 24}}) &&
                           save->dirty(),
                       "switch must start with an edit pending inside autosave debounce");
    };
    const bool newTimeline = mode.startsWith("new-");
    if (newTimeline && !edit()) {
        return;
    }
    if (mode == "new-menu" || mode == "controls-new-menu") {
        if (!require(menu->trigger("newTimeline"), "New Timeline menu action must route")) {
            return;
        }
    } else if (mode.startsWith("new-key-")) {
        auto *button = findItem(editor, "newTimelineButton");
        if (!require(button, "New timeline button must exist")) {
            return;
        }
        editor->forceActiveFocus();
        for (int i = 0; i < 80 && !button->hasActiveFocus(); ++i) {
            key(window, Qt::Key_Tab);
        }
        if (!require(button->hasActiveFocus(), "Tab must reach New timeline")) {
            return;
        }
        key(window, mode.endsWith("return") ? Qt::Key_Return : mode.endsWith("enter") ? Qt::Key_Enter : Qt::Key_Space);
    } else if (mode == "new-button" || mode == "controls-new-button") {
        if (!invokeButton("newTimelineButton")) {
            return;
        }
    } else if ((mode == "open-menu" || mode == "controls-menu")) {
        if (!require(menu->trigger("openTimeline"), "Open Timeline menu action must route")) {
            return;
        }
    } else if ((mode == "open-button" || mode == "controls-button")) {
        if (!invokeButton("openTimelineButton")) {
            return;
        }
    } else {
        key(window, Qt::Key_O, Qt::ControlModifier);
    }
    if (newTimeline) {
        QTimer::singleShot(1500, window, [] { require(false, "New Timeline must switch and quit"); });
        return;
    }
    QTimer::singleShot(200, window, [window, editor, mode, finish, edit, previousFocus] {
        auto *panel = findItem(window->contentItem(), "TimelineListPanel");
        if (!require(panel && panel->isVisible(), "Ctrl+O/menu/button must open the list over the document")) {
            return;
        }
        if (!require(editor->isVisible(), "current editor must remain mounted behind the list")) {
            return;
        }
        if (mode.startsWith("dismiss-") || mode == "keyboard" || mode.startsWith("controls-")) {
            if (mode == "dismiss-outside") {
                click(window, {window->width() - 4.0, window->height() - 4.0});
            } else {
                if (mode == "dismiss-escape") {
                    auto *search = findItem(panel, "searchInput");
                    if (!require(search && search->setProperty("text", "a search"),
                                 "search must accept text before Escape")) {
                        return;
                    }
                }
                key(window, Qt::Key_Escape);
            }
            QTimer::singleShot(200, window, [window, editor, mode, finish, previousFocus] {
                auto *panel = findItem(window->contentItem(), "TimelineListPanel");
                if (!require(!panel || !panel->isVisible(), "dismissal must close the list")) {
                    return;
                }
                if (mode == "controls-button" &&
                    !require(window->activeFocusItem() == previousFocus,
                             "mouse dismissal must return focus to the editor shortcut path")) {
                    return;
                }
                if (mode == "keyboard") {
                    for (const auto &name : {"openTimelineButton", "newTimelineButton"}) {
                        auto *button = findItem(window->contentItem(), name);
                        if (!require(button && button->activeFocusOnTab(),
                                     "buttons must participate in Tab navigation")) {
                            return;
                        }
                        QQmlExpression accessible(
                            QQmlEngine::contextForObject(button), button,
                            "Accessible.role === Accessible.Button && Accessible.name.length > 0");
                        if (!require(accessible.evaluate().toBool(), "buttons need accessible names")) {
                            return;
                        }
                        editor->forceActiveFocus();
                        for (int i = 0; i < 80 && !button->hasActiveFocus(); ++i) {
                            key(window, Qt::Key_Tab);
                        }
                        QQmlExpression ring(QQmlEngine::contextForObject(button), button, "border.width > 0");
                        if (!require(button->hasActiveFocus() && ring.evaluate().toBool(),
                                     "Tab must reach button with focus border")) {
                            return;
                        }
                        if (QString::fromLatin1(name) == "newTimelineButton" && nt::server::serverSaveTarget()) {
                            continue;
                        }
                        for (auto code : {Qt::Key_Return, Qt::Key_Enter, Qt::Key_Space}) {
                            button->forceActiveFocus(Qt::TabFocusReason);
                            key(window, code);
                            auto *list = findItem(window->contentItem(), "TimelineListPanel");
                            if (!require(list && list->isVisible(),
                                         "Return/Enter/Space must activate each document action")) {
                                return;
                            }
                            key(window, Qt::Key_Escape);
                        }
                    }
                }
                finish();
            });
            return;
        }
        if (mode == "flush-failure") {
            const auto target = nt::server::serverSaveTarget();
            if (!require(target.has_value(), "scratch save target must exist")) {
                return;
            }
            nt::server::ServerClient client(target->server, target->token);
            client.setExpectedInstance(target->expectedInstance);
            if (!require(client.mutate("timeline.delete", {{"id", target->timelineId}}).ok(),
                         "delete only the scratch current document to force a save failure")) {
                return;
            }
        }
        if (!edit()) {
            return;
        }
        auto *row =
            findItem(window->contentItem(), "TimelineListItem_" + qEnvironmentVariable("NT_TIMELINE_DOCUMENT_CHOOSE"));
        if (!require(row, "chosen scratch timeline must appear in the list")) {
            return;
        }
        click(window, row->mapToScene({row->width() / 2, row->height() / 2}));
        if (mode == "flush-failure") {
            auto *save = qobject_cast<nt::server::AutosaveController *>(editor->property("saver").value<QObject *>());
            if (!require(save && !save->lastError().isEmpty() && editor->isVisible(),
                         "failed flush must keep editor and error")) {
                return;
            }
            auto *actions = findItem(window->contentItem(), "TimelineDocumentActions");
            if (!require(actions && !actions->property("error").toString().isEmpty(),
                         "flush error must be shown by document actions")) {
                return;
            }
            finish();
        } else {
            QTimer::singleShot(1500, window, [] { require(false, "choosing a timeline must switch and quit"); });
        }
    });
}
void installCheck() {
    const auto mode = qEnvironmentVariable("NT_TIMELINE_DOCUMENT_CHECK");
    if (mode.isEmpty()) {
        return;
    }
    auto *timer = new QTimer(QCoreApplication::instance());
    timer->setInterval(50);
    QObject::connect(timer, &QTimer::timeout, timer, [timer, mode, activationWait = QElapsedTimer{}]() mutable {
        for (auto *candidate : QGuiApplication::allWindows()) {
            auto *window = qobject_cast<QQuickWindow *>(candidate);
            if (!window || !window->isVisible()) {
                continue;
            }
            for (auto *editor : window->contentItem()->childItems()) {
                if (!editor->property("timeline").isValid()) {
                    continue;
                }
                if (QGuiApplication::focusWindow() != window) {
                    if (!activationWait.isValid()) {
                        qInfo("DOCUMENT CHECK: requesting editor activation (focusWindow null=%d)",
                              QGuiApplication::focusWindow() == nullptr);
                        activationWait.start();
                        window->requestActivate();
                    } else if (activationWait.hasExpired(5000)) {
                        timer->stop();
                        require(false, "editor window must activate before driving input");
                    }
                    return;
                }
                timer->stop();
                QTimer::singleShot(100, window, [window, editor = QPointer(editor), mode] {
                    if (require(QGuiApplication::focusWindow() == window && editor,
                                "editor window must retain focus before driving input")) {
                        drive(window, editor, mode);
                    }
                });
                return;
            }
        }
    });
    timer->start();
    // The sanitize build runs the app several times slower, so its checks pass a longer bound.
    const int timeoutMs = qEnvironmentVariableIntValue("NT_TIMELINE_DOCUMENT_TIMEOUT_MS");
    QTimer::singleShot(timeoutMs > 0 ? timeoutMs : 20000, timer, [] { require(false, "application driver timed out"); });
}
Q_COREAPP_STARTUP_FUNCTION(installCheck)
} // namespace
