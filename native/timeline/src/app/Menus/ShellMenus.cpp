#include "ShellMenus.h"
#include "app/MenuRegistry.h"
#include "wiring/KeyActions.h"
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
#include <algorithm>
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

namespace {
// The active preset's binding first, as for the built-in items, then the key
// action's default, then the shortcut the entry names.
void applyEntryShortcut(ShellMenuItem& item, const QString& preset, const ShellMenuEntry& entry) {
    if (const auto bindings = nt::edit::actionBindingKeys(preset, entry.action); !bindings.empty()) {
        item.shortcut = nt::edit::formatActionShortcut(preset, entry.action);
        item.sequence = QKeySequence(bindingCombination(bindings.front()));
        return;
    }
    for (const auto& action : nt::wiring::keyActions()) {
        if (action.name == entry.action && !action.defaultKeys.isEmpty()) {
            item.sequence = action.defaultKeys.first();
            item.shortcut = item.sequence.toString(QKeySequence::NativeText);
            return;
        }
    }
    item.shortcut = entry.shortcut;
    item.sequence = QKeySequence::fromString(entry.shortcut, QKeySequence::PortableText);
}
ShellMenuItem menuSeparator() {
    ShellMenuItem item;
    item.separator = true;
    return item;
}
void insertEntries(std::vector<ShellMenuItem>& items, size_t at, const std::vector<ShellMenuEntry>& entries,
                   const QString& preset, const QVariantMap& context) {
    QString group;  // Built-in items have no group.
    QHash<QString, QString> submenuGroups;
    for (const auto& entry : entries) {
        ShellMenuItem item{entry.label, entry.action, {}, {}, !entry.enabled || entry.enabled(context), {}};
        item.checkable = bool(entry.checked);
        item.checked = entry.checked && entry.checked(context);
        applyEntryShortcut(item, preset, entry);
        const auto startGroup = [&] {
            if (at > 0 && group != entry.group) {
                items.insert(items.begin() + at++, menuSeparator());
            }
            group = entry.group;
        };
        if (entry.submenu.isEmpty()) {
            startGroup();
            items.insert(items.begin() + at++, std::move(item));
            continue;
        }
        auto parent = std::find_if(items.begin(), items.end(), [&](const ShellMenuItem& candidate) {
            return candidate.label == entry.submenu && candidate.action.isEmpty();
        });
        if (parent == items.end()) {
            startGroup();
            parent = items.insert(items.begin() + at++, ShellMenuItem{entry.submenu, {}, {}, {}, true, {}});
            submenuGroups.insert(entry.submenu, entry.group);
        } else if (submenuGroups.value(entry.submenu) != entry.group) {
            parent->children.push_back(menuSeparator());
            submenuGroups.insert(entry.submenu, entry.group);
        }
        parent->children.push_back(std::move(item));
    }
}
}

std::vector<Menu> shellMenuDescription(const QString& preset, const QVariantList& recent, const QVariantMap& context) {
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
                  {"Open Timeline…", "openTimeline", "Ctrl+O", QKeySequence(Qt::CTRL | Qt::Key_O), true, {}},
                  {"New Timeline", "newTimeline", {}, {}, true, {}},
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
    for (const QString& name : shellMenuNames()) {
        const auto entries = shellMenuEntries(name);
        if (entries.empty()) {
            continue;
        }
        auto menu = std::find_if(menus.begin(), menus.end(), [&](const Menu& candidate) { return candidate.label == name; });
        if (menu == menus.end()) {
            // Keep the order of shellMenuNames() when a module adds a whole menu.
            const auto rank = shellMenuNames().indexOf(name);
            menu = menus.insert(std::find_if(menus.begin(), menus.end(), [&](const Menu& candidate) {
                return shellMenuNames().indexOf(candidate.label) > rank;
            }), Menu{name, {}});
        }
        // File keeps Settings and Quit at its end.
        auto& items = menu->items;
        const auto settings = std::find_if(items.begin(), items.end(), [](const ShellMenuItem& item) { return item.action == "settings"; });
        const bool beforeSettings = settings != items.end();
        const size_t at = size_t(settings - items.begin());
        const size_t before = items.size();
        insertEntries(items, at, entries, preset, context);
        if (beforeSettings) {
            items.insert(items.begin() + at + (items.size() - before), menuSeparator());
        }
    }
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
QVariantMap ShellMenus::menuContext() const {
    QVariantMap context{{"kind", "shell"}};
    if (auto* gestures = qobject_cast<ClipGestureController*>(nt::wiring::w::windowItem(m_anchor, "clipGestures"))) {
        context.insert("gestures", QVariant::fromValue<QObject*>(gestures));
        context.insert("timeline", QVariant::fromValue<QObject*>(gestures->timeline()));
    }
    return context;
}
void ShellMenus::refreshRegisteredItems() {
    const auto context = menuContext();
    for (const auto& registered : m_registered) {
        auto* item = qobject_cast<QPlatformMenuItem*>(registered.item.data());
        if (!item) {
            continue;
        }
        for (const auto& entry : shellMenuEntries()) {
            if (entry.action == registered.action) {
                item->setEnabled(!entry.enabled || entry.enabled(context));
                item->setCheckable(bool(entry.checked));
                item->setChecked(entry.checked && entry.checked(context));
                registered.menu->syncMenuItem(item);
                break;
            }
        }
    }
}
bool ShellMenus::trigger(const QString& action) {
    for (const auto& entry : shellMenuEntries()) {
        if (entry.action != action) {
            continue;
        }
        const auto context = menuContext();
        if (entry.enabled && !entry.enabled(context)) {
            return false;
        }
        if (entry.run) {
            return entry.run(context);
        }
        auto* gestures = qobject_cast<ClipGestureController*>(context.value("gestures").value<QObject*>());
        return gestures && gestures->runAction(action, context);
    }
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
    if (action == "openTimeline") {
        emit openTimelineRequested();
        return true;
    }
    if (action == "newTimeline") {
        emit newTimelineRequested();
        return true;
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
    m_registered.clear();
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
    for (const auto& description : shellMenuDescription(m_preset, m_preferences ? m_preferences->recentTimelines() : QVariantList(), menuContext())) {
        auto* menu = theme->createPlatformMenu();
        if (!menu) {
            continue;
        }
        menu->setParent(bar);
        menu->setText(description.label);
        menu->setEnabled(true);
        menu->setVisible(true);
        populate(menu, description.items);
        connect(menu, &QPlatformMenu::aboutToShow, this, &ShellMenus::refreshRegisteredItems);
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
        if (entry.separator) {
            item->setIsSeparator(true);
            item->setVisible(true);
            menu->insertMenuItem(item, nullptr);
            continue;
        }
        item->setText(entry.label);
        item->setEnabled(entry.enabled);
        item->setVisible(true);
        item->setShortcut(entry.sequence);
        item->setCheckable(entry.checkable);
        item->setChecked(entry.checked);
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
            const auto& entries = shellMenuEntries();
            if (std::any_of(entries.begin(), entries.end(), [&](const auto& e) { return e.action == entry.action; })) {
                m_registered.push_back({item, menu, entry.action});
            }
        }
        menu->insertMenuItem(item, nullptr);
    }
}

}
