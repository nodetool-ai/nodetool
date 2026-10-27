#include "ShellMenus.h"
#include "wiring/w/SceneItems.h"
#include "edit/ClipGestureController.h"
#include "edit/Keymap.h"
#include <QCoreApplication>
#include <QFileInfo>
#include <QProcess>
#include <QJsonArray>
#include <QKeyEvent>
#include <QQuickWindow>
#include <QTimer>
#include <private/qguiapplication_p.h>
#include <qpa/qplatformmenu.h>
#include <qpa/qplatformtheme.h>

namespace nt::app {
QKeyCombination bindingCombination(const QStringList& keys) {
    if (keys.isEmpty()) {
        return {};
    }
    const QString label = keys.last();
    static const QHash<QString, Qt::Key> special{
        {"←", Qt::Key_Left}, {"→", Qt::Key_Right}, {"↑", Qt::Key_Up}, {"↓", Qt::Key_Down},
        {"Page Up", Qt::Key_PageUp}, {"Page Down", Qt::Key_PageDown}, {"Space", Qt::Key_Space},
        {"Esc", Qt::Key_Escape}, {"HOME", Qt::Key_Home}, {"END", Qt::Key_End},
        {"DELETE", Qt::Key_Delete}, {"BACKSPACE", Qt::Key_Backspace}, {"TAB", Qt::Key_Tab},
        {"ENTER", Qt::Key_Return}};
    const auto key = special.contains(label) ? special.value(label)
        : label.size() == 1 ? static_cast<Qt::Key>(label.toUpper().at(0).unicode()) : Qt::Key_unknown;
    Qt::KeyboardModifiers modifiers;
    if (keys.contains("Ctrl")) {
        modifiers |= Qt::ControlModifier;
    }
    if (keys.contains("Alt")) {
        modifiers |= Qt::AltModifier;
    }
    // Symbol keys already describe their shifted glyph, as in the web resolver.
    if (keys.contains("Shift") && (label.size() != 1 || label.at(0).isLetter())) {
        modifiers |= Qt::ShiftModifier;
    }
    return QKeyCombination(modifiers, key);
}

std::vector<Menu> shellMenuDescription(const QString& preset, const QVariantList& recent) {
    QHash<QString, QString> labels;
    for (const auto& group : nt::edit::shortcutSheet(preset).value("groups").toArray()) {
        for (const auto& row : group.toObject().value("rows").toArray()) {
            const auto object = row.toObject();
            if (object.contains("action")) {
                labels.insert(object.value("action").toString(), object.value("label").toString());
            }
        }
    }
    std::vector<Menu> menus{
        {"File", {{"Open Recent", "recent", {}, {}, true, {}},
                  {"Export…", "exportVideo", {}, {}, true, {}},
                  {"Settings…", "settings", "Ctrl+,", QKeySequence(Qt::CTRL | Qt::Key_Comma), true, {}},
                  {"Quit", "quit", {}, QKeySequence(QKeySequence::Quit), true, {}}}},
        {"Edit", {}}, {"View", {}}, {"Playback", {}}, {"Help", {}}};
    const std::vector<QStringList> actions{
        {"undo", "redo", "cut", "copy", "paste", "pasteInsert", "pasteAttributes", "duplicate", "deleteSelected",
         "rippleDeleteSelected", "selectAll", "deselectAll", "splitAtPlayhead", "linkClips", "groupClips", "ungroupClips"},
        {"zoomIn", "zoomOut", "zoomFit", "expandTracks", "shrinkTracks", "toggleSnap"},
        {"playPause", "playInToOut", "toggleLoop", "shuttleBack", "shuttleStop", "shuttleForward", "stepFrameBack",
         "stepFrameForward", "markIn", "markOut", "goToIn", "goToOut", "clearRange", "addMarker", "nextMarker", "prevMarker"},
        {"toggleShortcuts"}};
    for (size_t index = 0; index < actions.size(); ++index) {
        for (const QString& action : actions[index]) {
            if (action == "playPause") {
                menus[index + 1].items.push_back({"Play / pause", action, "Space", QKeySequence(Qt::Key_Space), true, {}});
                continue;
            }
            const auto bindings = nt::edit::actionBindingKeys(preset, action);
            if (bindings.empty()) {
                continue;
            }
            const QString label = action == "toggleShortcuts" ? QStringLiteral("Keyboard Shortcuts") : labels.value(action);
            menus[index + 1].items.push_back({label, action, nt::edit::formatActionShortcut(preset, action),
                QKeySequence(bindingCombination(bindings.front())), ClipGestureController::availableActions().contains(action), {}});
        }
    }
    auto& recentItems = menus.front().items.front().children;
    for (qsizetype index = 0; index < recent.size(); ++index) {
        const auto entry = recent[index].toMap();
        const bool server = entry.value("kind") == "server";
        const QString path = entry.value("path").toString();
        const QString suffix = server ? QUrl(entry.value("server").toString()).host() : QFileInfo(path).fileName();
        recentItems.push_back({entry.value("label").toString() + " (" + suffix + ")", QString("recent:%1").arg(index), {}, {},
            !recentTimelineArguments(entry).isEmpty() && (server || QFileInfo(path).isFile()), {}});
    }
    recentItems.push_back({"Clear Menu", "clearRecent", {}, {}, true, {}});
    return menus;
}

ShellMenus::ShellMenus(QObject* parent) : QObject(parent) {}
ShellMenus::~ShellMenus() {
    if (auto* bar = qobject_cast<QPlatformMenuBar*>(m_bar.data())) {
        bar->handleReparent(nullptr);
    }
}
void ShellMenus::setAnchor(QQuickItem* item) {
    if (m_anchor == item) {
        return;
    }
    if (m_anchor) {
        disconnect(m_anchor, nullptr, this, nullptr);
    }
    m_anchor = item;
    if (item) {
        connect(item, &QQuickItem::windowChanged, this, &ShellMenus::rebuild);
    }
    rebuild();
    emit anchorChanged();
}
void ShellMenus::setKeyboardPreset(const QString& preset) {
    if (m_preset == preset || nt::edit::actionBindingKeys(preset, "undo").empty()) {
        return;
    }
    m_preset = preset;
    QTimer::singleShot(0, this, &ShellMenus::rebuild);
    emit keyboardPresetChanged();
}
void ShellMenus::setPreferences(Preferences* preferences) {
    if (m_preferences == preferences) {
        return;
    }
    if (m_preferences) {
        disconnect(m_preferences, nullptr, this, nullptr);
    }
    m_preferences = preferences;
    if (preferences) {
        connect(preferences, &Preferences::recentTimelinesChanged, this, [this]() {
            QTimer::singleShot(0, this, &ShellMenus::rebuild);
        });
    }
    QTimer::singleShot(0, this, &ShellMenus::rebuild);
    emit preferencesChanged();
}
bool ShellMenus::trigger(const QString& action) {
    if (action == "clearRecent" && m_preferences) {
        m_preferences->clearRecentTimelines();
        return true;
    }
    if (action.startsWith("recent:") && m_preferences) {
        bool ok = false;
        const auto index = action.sliced(7).toInt(&ok);
        const auto recent = m_preferences->recentTimelines();
        if (!ok || index < 0 || index >= recent.size()) {
            return false;
        }
        const auto entry = recent[index].toMap();
        const auto arguments = recentTimelineArguments(entry);
        if (arguments.isEmpty() || (entry.value("kind") == "file" && !QFileInfo(entry.value("path").toString()).isFile())) {
            return false;
        }
        return QProcess::startDetached(QCoreApplication::applicationFilePath(), arguments);
    }
    if (action == "settings") {
        emit settingsRequested();
        return true;
    }
    if (action == "quit") {
        QCoreApplication::quit();
        return true;
    }
    if (!m_anchor || !m_anchor->window()) {
        return false;
    }
    if (action == "exportVideo") {
        auto* panel = nt::wiring::w::windowItem(m_anchor, "exportPanel");
        return panel && QMetaObject::invokeMethod(panel, "open");
    }
    for (const auto& menu : shellMenuDescription(m_preset)) {
        for (const auto& item : menu.items) {
            if (item.action != action || !item.enabled || item.sequence.isEmpty()) {
                continue;
            }
            // Restore the editor's key path even when a menu took focus.
            for (auto* root = m_anchor.data(); root; root = root->parentItem()) {
                if (root->property("timeline").isValid()) {
                    root->forceActiveFocus();
                    break;
                }
            }
            const auto combination = item.sequence[0];
            const auto key = combination.key();
            const QString text = key == Qt::Key_Space ? QStringLiteral(" ")
                : (key >= Qt::Key_Space && key <= Qt::Key_AsciiTilde ? QString(QChar(static_cast<char16_t>(key))).toLower() : QString());
            QKeyEvent press(QEvent::KeyPress, key, combination.keyboardModifiers(), text);
            QKeyEvent release(QEvent::KeyRelease, key, combination.keyboardModifiers(), text);
            QCoreApplication::sendEvent(m_anchor->window(), &press);
            QCoreApplication::sendEvent(m_anchor->window(), &release);
            return true;
        }
    }
    return false;
}
void ShellMenus::rebuild() {
    if (auto* bar = qobject_cast<QPlatformMenuBar*>(m_bar.data())) {
        bar->handleReparent(nullptr);
        delete bar;
    }
    if (!m_anchor || !m_anchor->window()) {
        return;
    }
    auto* theme = QGuiApplicationPrivate::platformTheme();
    auto* bar = theme ? theme->createPlatformMenuBar() : nullptr;
    if (!bar) {
        return;
    }
    bar->setParent(this);
    m_bar = bar;
    for (const auto& description : shellMenuDescription(m_preset, m_preferences ? m_preferences->recentTimelines() : QVariantList())) {
        auto* menu = theme->createPlatformMenu();
        if (!menu) {
            continue;
        }
        menu->setParent(bar);
        menu->setText(description.label);
        menu->setEnabled(true);
        menu->setVisible(true);
        populate(menu, description.items);
        bar->insertMenu(menu, nullptr);
    }
    bar->handleReparent(m_anchor->window());
}
void ShellMenus::populate(QPlatformMenu* menu, const std::vector<ShellMenuItem>& items) {
    auto* theme = QGuiApplicationPrivate::platformTheme();
    for (const auto& entry : items) {
        auto* item = theme->createPlatformMenuItem();
        if (!item) {
            continue;
        }
        item->setParent(menu);
        item->setText(entry.label);
        item->setEnabled(entry.enabled);
        item->setVisible(true);
        item->setShortcut(entry.sequence);
        item->setRole(entry.action == "settings" ? QPlatformMenuItem::PreferencesRole
            : entry.action == "quit" ? QPlatformMenuItem::QuitRole : QPlatformMenuItem::NoRole);
        if (!entry.children.empty()) {
            if (auto* submenu = theme->createPlatformMenu()) {
                submenu->setParent(menu);
                submenu->setText(entry.label);
                submenu->setEnabled(true);
                submenu->setVisible(true);
                populate(submenu, entry.children);
                item->setMenu(submenu);
            }
        } else {
            connect(item, &QPlatformMenuItem::activated, this, [this, action = entry.action]() { trigger(action); });
        }
        menu->insertMenuItem(item, nullptr);
    }
}

}
