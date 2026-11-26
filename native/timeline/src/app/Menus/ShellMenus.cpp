#include "ShellMenus.h"
#include "app/MenuRegistry.h"
#include "wiring/KeyActions.h"
#include "wiring/w/SceneItems.h"
#include "edit/ClipGestureController.h"
#include "edit/Keymap.h"
#include "edit/trim/TrimMode.h"
#include "server/BundledServer.h"
#include <QCoreApplication>
#include <QFileInfo>
#include <QKeyEvent>
#include <QProcess>
#include <QQuickWindow>
#include <QSet>
#include <QTimer>
#include <memory>
#include <type_traits>
#ifdef Q_OS_MACOS
#include <CoreFoundation/CoreFoundation.h>
#endif
#include <algorithm>
#include <private/qguiapplication_p.h>
#include <qpa/qplatformmenu.h>
#include <qpa/qplatformtheme.h>

namespace nt::app {
// The Edit commands a focused text field runs on its own text, by its standard keys.
const QHash<QString, QKeySequence::StandardKey>& textEditKeys() {
    static const QHash<QString, QKeySequence::StandardKey> keys{
        {"cut", QKeySequence::Cut}, {"copy", QKeySequence::Copy}, {"paste", QKeySequence::Paste},
        {"selectAll", QKeySequence::SelectAll}, {"undo", QKeySequence::Undo}, {"redo", QKeySequence::Redo},
        {"deleteSelected", QKeySequence::Delete}};
    return keys;
}
bool textOwnsAction(const QVariantMap& context, const QString& action) {
    return context.value("textFocus").toBool() && textEditKeys().contains(action)
        && (!context.value("textReadOnly").toBool() || action == "copy" || action == "selectAll");
}
bool entryEnabled(const ShellMenuEntry& entry, const QVariantMap& context) {
    if (context.value("textFocus").toBool() && context.value("textReadOnly").toBool()
        && textEditKeys().contains(entry.action) && entry.action != "copy" && entry.action != "selectAll") { return false; }
    if (textOwnsAction(context, entry.action)) {
        return true;
    }
    return !entry.enabled || entry.enabled(context);
}
QKeyCombination bindingCombination(const QStringList& keys) {
    if (keys.isEmpty()) {
        return {};
    }
    const QString label = keys.last();
    static const QHash<QString, Qt::Key> special{
        {"←", Qt::Key_Left}, {"→", Qt::Key_Right}, {"↑", Qt::Key_Up}, {"↓", Qt::Key_Down},
        {"Page Up", Qt::Key_PageUp}, {"Page Down", Qt::Key_PageDown}, {"Space", Qt::Key_Space},
        {"Esc", Qt::Key_Escape}, {"Home", Qt::Key_Home}, {"End", Qt::Key_End},
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
    // A shifted glyph such as "+" or "?" already says Shift, as in the web resolver.
    // An unshifted key does not: Shift+5 and Shift+= keep the modifier, so Shift+= is
    // not the same menu shortcut as =.
    static const QString shiftedGlyphs = QStringLiteral("~!@#$%^&*()_+{}|:\"<>?");
    if (keys.contains("Shift") && (label.size() != 1 || !shiftedGlyphs.contains(label))) {
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
        if (action.name != entry.action) { continue; }
        // A default key gives way to the preset's own use of it, as in the Timeline.
        for (const auto& key : action.defaultKeys) {
            if (!ClipGestureController::presetUsesKey(preset, key)) {
                item.sequence = key;
                item.shortcut = key.toString(QKeySequence::NativeText);
                return;
            }
        }
    }
    item.shortcut = entry.shortcut;
    item.sequence = QKeySequence::fromString(entry.shortcut, QKeySequence::PortableText);
}
std::vector<ShellMenuItem> fileMenuItems() {
    return {{"Open Recent", "recent", {}, {}, true, {}, false, false, false, {}},
            {"Open Timeline…", "openTimeline", "Ctrl+O", QKeySequence(Qt::CTRL | Qt::Key_O), true, {}, false, false, false, {}},
            {"New Timeline", "newTimeline", {}, {}, true, {}, false, false, false, {}},
            {"Settings…", "settings", "Ctrl+,", QKeySequence(Qt::CTRL | Qt::Key_Comma), true, {}, false, false, false, {}},
            {"Quit", "quit", {}, QKeySequence(QKeySequence::Quit), true, {}, false, false, false, {}}};
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
        ShellMenuItem item{entry.label, entry.action, {}, {}, entryEnabled(entry, context), {}};
        item.disabledReason = item.enabled ? QString() : entry.disabledReason;
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
    // Every other menu comes from the registry (StandardMenus.cpp).
    std::vector<Menu> menus{{"File", fileMenuItems()}};
    auto& recentItems = menus.front().items.front().children;
    for (qsizetype index = 0; index < recent.size(); ++index) {
        const auto entry = recent[index].toMap();
        const bool server = entry.value("kind") == "server" || entry.value("kind") == "cloud";
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

ShellMenus::ShellMenus(QObject* parent) : QObject(parent) {
    if (auto* app = QCoreApplication::instance()) { app->installEventFilter(this); }
}
namespace {
bool platformMenuTracking() {
#ifdef Q_OS_MACOS
    // AppKit also emits aboutToShow while validating shortcuts, outside tracking.
    const std::unique_ptr<std::remove_pointer_t<CFStringRef>, decltype(&CFRelease)> mode(
        CFRunLoopCopyCurrentMode(CFRunLoopGetCurrent()), &CFRelease);
    return mode && CFEqual(mode.get(), CFSTR("NSEventTrackingRunLoopMode"));
#else
    return false;
#endif
}
QQuickItem* blockingPopup(const QQuickWindow* window) {
    QQuickItem* top = nullptr;
    for (auto* child : window->contentItem()->childItems()) {
        if (!child->inherits("QQuickOverlay")) { continue; }
        const auto items = child->childItems();
        for (auto it = items.crbegin(); it != items.crend(); ++it) {
            auto* item = *it;
            const auto* popup = item->parent();
            if (item->inherits("QQuickPopupItem") && popup && popup->inherits("QQuickPopup")
                && popup->property("visible").toBool()
                && (popup->property("modal").toBool() || popup->property("focus").toBool()
                    || popup->inherits("QQuickMenu") || item->hasActiveFocus())) {
                if (!top || item->z() > top->z()) { top = item; }
            }
        }
    }
    return top;
}
bool textOwnsKey(const QQuickItem* focus, const QKeyEvent& key) {
    if (!focus || (!focus->flags().testFlag(QQuickItem::ItemAcceptsInputMethod)
        && !focus->inherits("QQuickTextInput") && !focus->inherits("QQuickTextEdit"))) { return false; }
    if (key.matches(QKeySequence::Copy) || key.matches(QKeySequence::SelectAll)) { return true; }
    if (focus->property("readOnly").toBool()) {
        switch (key.key()) {
        case Qt::Key_Left: case Qt::Key_Right: case Qt::Key_Up: case Qt::Key_Down:
        case Qt::Key_Home: case Qt::Key_End: case Qt::Key_PageUp: case Qt::Key_PageDown:
            return true;
        default: return false;
        }
    }
    if (key.modifiers().testFlag(Qt::GroupSwitchModifier)
        || (key.modifiers().testFlag(Qt::ControlModifier) && key.modifiers().testFlag(Qt::AltModifier) && !key.text().isEmpty())) {
        return true;
    }
    const auto modifiers = key.modifiers() & ~(Qt::ShiftModifier | Qt::KeypadModifier);
    if (modifiers == Qt::NoModifier || modifiers == Qt::AltModifier) { return true; }
    for (const auto standard : {QKeySequence::Cut, QKeySequence::Copy, QKeySequence::Paste,
             QKeySequence::SelectAll, QKeySequence::Undo, QKeySequence::Redo,
             QKeySequence::Delete, QKeySequence::Backspace, QKeySequence::Deselect,
             QKeySequence::MoveToNextChar, QKeySequence::MoveToPreviousChar,
             QKeySequence::MoveToNextWord, QKeySequence::MoveToPreviousWord,
             QKeySequence::MoveToNextLine, QKeySequence::MoveToPreviousLine,
             QKeySequence::MoveToNextPage, QKeySequence::MoveToPreviousPage,
             QKeySequence::MoveToStartOfBlock, QKeySequence::MoveToEndOfBlock,
             QKeySequence::MoveToStartOfLine, QKeySequence::MoveToEndOfLine,
             QKeySequence::MoveToStartOfDocument, QKeySequence::MoveToEndOfDocument,
             QKeySequence::SelectNextChar, QKeySequence::SelectPreviousChar,
             QKeySequence::SelectNextWord, QKeySequence::SelectPreviousWord,
             QKeySequence::SelectNextLine, QKeySequence::SelectPreviousLine,
             QKeySequence::SelectNextPage, QKeySequence::SelectPreviousPage,
             QKeySequence::SelectStartOfBlock, QKeySequence::SelectEndOfBlock,
             QKeySequence::SelectStartOfLine, QKeySequence::SelectEndOfLine,
             QKeySequence::SelectStartOfDocument, QKeySequence::SelectEndOfDocument,
             QKeySequence::DeleteStartOfWord, QKeySequence::DeleteEndOfWord,
             QKeySequence::DeleteEndOfLine, QKeySequence::DeleteCompleteLine,
             QKeySequence::InsertParagraphSeparator, QKeySequence::InsertLineSeparator}) {
        if (key.matches(standard)) { return true; }
    }
    return false;
}
}
bool ShellMenus::eventFilter(QObject* watched, QEvent* event) {
    if (event->type() == QEvent::ApplicationActivate || event->type() == QEvent::WindowActivate) {
        m_openMenus.clear();
    }
    auto* window = m_anchor ? m_anchor->window() : nullptr;
    if (event->type() == QEvent::Shortcut && window) {
        if (auto* popup = blockingPopup(window)) {
            bool inWindow = false;
            for (auto* owner = watched; owner; owner = owner->parent()) {
                const auto* item = qobject_cast<QQuickItem*>(owner);
                inWindow = inWindow || owner == window || (item && item->window() == window);
                if (owner == popup->parent() || (item && (item == popup || popup->isAncestorOf(item)))) { return false; }
            }
            if (inWindow) { event->accept(); return true; }
        }
    }
    if (event->type() != QEvent::ShortcutOverride && event->type() != QEvent::KeyPress) { return false; }
    if (!window || watched != window || QGuiApplication::modalWindow()) { return false; }
    const auto& key = *static_cast<QKeyEvent*>(event);
    const QPointer<QQuickItem> popup = blockingPopup(window);
    const auto* textFocus = window->activeFocusItem();
    const bool focusOwnsKey = !popup || (textFocus && (textFocus == popup || popup->isAncestorOf(textFocus)));
    if (focusOwnsKey && textFocus && textFocus->property("readOnly").toBool()
        && (textFocus->inherits("QQuickTextInput") || textFocus->inherits("QQuickTextEdit"))) {
        bool mutation = key.key() == Qt::Key_Delete || key.key() == Qt::Key_Backspace;
        for (const auto standard : {QKeySequence::Cut, QKeySequence::Paste, QKeySequence::Undo, QKeySequence::Redo}) {
            mutation = mutation || key.matches(standard);
        }
        if (mutation) { event->accept(); return true; }
        if (textOwnsKey(textFocus, key)) {
            event->accept();
            if (event->type() == QEvent::KeyPress) {
                QKeyEvent local(QEvent::KeyPress, key.key(), key.modifiers(), key.text(), key.isAutoRepeat());
                QCoreApplication::sendEvent(window->activeFocusItem(), &local);
            }
            return true;
        }
    }
    if ((focusOwnsKey && textOwnsKey(textFocus, key)) || key.modifiers().testFlag(Qt::MetaModifier)) { return false; }
    const auto* focus = window->activeFocusItem();
    if (focusOwnsKey && key.key() == Qt::Key_Space && key.modifiers() == Qt::NoModifier && focus
        && focus->property("checkable").toBool() && focus->property("visualFocus").toBool()) { return false; }
    const QPointer<ClipGestureController> gestures = qobject_cast<ClipGestureController*>(nt::wiring::w::windowItem(m_anchor, "clipGestures"));
    QString action = gestures ? gestures->resolveKeyAction(key.key(), key.text(), int(key.modifiers())) : QString{};
    if (action.isEmpty()) {
        const auto matchSequence = [&](Qt::KeyboardModifiers modifiers) -> QString {
            const QKeySequence sequence(QKeyCombination(modifiers, static_cast<Qt::Key>(key.key())));
            for (const auto& entry : shellMenuEntries()) {
                ShellMenuItem item;
                applyEntryShortcut(item, m_preset, entry);
                if (!item.sequence.isEmpty() && item.sequence == sequence) { return entry.action; }
            }
            for (const auto& item : fileMenuItems()) {
                if (!item.sequence.isEmpty() && item.sequence == sequence) { return item.action; }
            }
            return {};
        };
        const auto modifiers = key.modifiers() & ~Qt::KeypadModifier;
        action = matchSequence(modifiers);
        if (action.isEmpty() && modifiers.testFlag(Qt::ShiftModifier)
            && key.key() > Qt::Key_Space && key.key() <= Qt::Key_AsciiTilde
            && !QChar(key.key()).isLetterOrNumber()) {
            action = matchSequence(modifiers & ~Qt::ShiftModifier);
        }
    }
    if (action.isEmpty()) { return false; }
    bool menuTracking = platformMenuTracking();
#ifndef Q_OS_MACOS
    menuTracking = menuTracking || !m_openMenus.isEmpty();
#endif
    if (menuTracking) { event->accept(); return true; }
    if (popup) {
        auto* focused = window->activeFocusItem();
        if (event->type() == QEvent::ShortcutOverride && focused
            && (focused == popup || popup->isAncestorOf(focused))) { return false; }
        // A modal popup without focus must not pass keys to the editor.
        event->accept();
        if (event->type() == QEvent::KeyPress) {
            const bool focusInPopup = focused && (focused == popup || popup->isAncestorOf(focused));
            if (!focusInPopup) { popup->forceActiveFocus(Qt::PopupFocusReason); }
            QPointer<QQuickItem> target = focusInPopup ? focused : popup.data();
            QKeyEvent local(QEvent::KeyPress, key.key(), key.modifiers(), key.text(), key.isAutoRepeat());
            while (target) {
                const bool atPopup = target == popup;
                local.setAccepted(true);
                QCoreApplication::sendEvent(target, &local);
                if (local.isAccepted() || atPopup || !target || !popup) { break; }
                target = target->parentItem();
            }
        }
        return true;
    }
    const auto& entries = shellMenuEntries();
    const auto entry = std::find_if(entries.begin(), entries.end(), [&](const auto& candidate) { return candidate.action == action; });
    const bool registered = entry != entries.end();
    if (registered && !entryEnabled(*entry, menuContext())) { return false; }
    const bool repeatable = registered ? entry->repeatable
        : action.startsWith("nudge") || action.startsWith("trimEdit") || action == "slideLeft" || action == "slideRight";
    if (key.isAutoRepeat() && !repeatable) {
        event->accept();
        return true;
    }
    // Accept the override before Controls/Keys or QML Shortcuts can claim it.
    // Dispatch only on the press so a key cannot execute twice.
    if (event->type() == QEvent::ShortcutOverride) { event->accept(); return true; }
    if (gestures && gestures->trimMode()->handleKey(key.key(), int(key.modifiers()), key.isAutoRepeat())) { return true; }
    if (action == u"escape") {
        // Cancel a live control edit before running the application's Escape.
        if (auto* focused = window->activeFocusItem()) {
            QKeyEvent cancel(QEvent::KeyPress, key.key(), key.modifiers(), key.text(), key.isAutoRepeat());
            cancel.setAccepted(true);
            QCoreApplication::sendEvent(focused, &cancel);
            if (cancel.isAccepted()) { return true; }
        }
        for (auto* editor = m_anchor.data(); editor; editor = editor->parentItem()) {
            if (editor->property("programFullscreen").toBool()) {
                QMetaObject::invokeMethod(editor, "toggleProgramFullscreen");
                return true;
            }
        }
    }
    if (registered || !gestures) { trigger(action, key.isAutoRepeat()); }
    else if (!trigger(action, key.isAutoRepeat()) && gestures) { gestures->runAction(action, {{"autoRepeat", key.isAutoRepeat()}}); }
    return true;
}
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
    const auto* focused = m_anchor && m_anchor->window() ? m_anchor->window()->activeFocusItem() : nullptr;
    context.insert("textFocus", focused && (focused->flags().testFlag(QQuickItem::ItemAcceptsInputMethod)
        || focused->inherits("QQuickTextInput") || focused->inherits("QQuickTextEdit")));
    context.insert("textReadOnly", focused && focused->property("readOnly").toBool());
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
                item->setEnabled(entryEnabled(entry, context));
                item->setCheckable(bool(entry.checked));
                item->setChecked(entry.checked && entry.checked(context));
                registered.menu->syncMenuItem(item);
                break;
            }
        }
    }
}
bool ShellMenus::trigger(const QString& action, bool autoRepeat) {
    for (const auto& entry : shellMenuEntries()) {
        if (entry.action != action) {
            continue;
        }
        auto context = menuContext();
        context.insert("autoRepeat", autoRepeat);
        if (!entryEnabled(entry, context)) {
            return false;
        }
        if (textOwnsAction(context, action)) {
            const auto combination = QKeySequence(textEditKeys().value(action))[0];
            QKeyEvent press(QEvent::KeyPress, combination.key(), combination.keyboardModifiers());
            QKeyEvent release(QEvent::KeyRelease, combination.key(), combination.keyboardModifiers());
            QCoreApplication::sendEvent(m_anchor->window(), &press);
            QCoreApplication::sendEvent(m_anchor->window(), &release);
            return true;
        }
        // Leaving a text field commits what was typed before the command runs.
        for (auto* root = context.value("textFocus").toBool() && !context.value("textReadOnly").toBool() ? m_anchor.data() : nullptr; root; root = root->parentItem()) {
            if (root->property("timeline").isValid()) {
                root->forceActiveFocus();
                break;
            }
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
        nt::server::noteBundledServerHandoff();
        QProcess process;
        process.setProgram(nt::server::appRelaunchProgram());
        process.setArguments(arguments);
        // A cloud window keeps its drafts on this window's local server.
        const QUrl bundled = nt::server::bundledServerUrl();
        if (entry.value("kind") == "cloud" && !bundled.isEmpty()) {
            auto environment = QProcessEnvironment::systemEnvironment();
            environment.insert(QStringLiteral("NODETOOL_SERVER_URL"), bundled.toString());
            process.setProcessEnvironment(environment);
        }
        return process.startDetached();
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
    return false;
}
void ShellMenus::rebuild() {
    m_openMenus.clear();
    m_registered.clear();
    if (auto* bar = qobject_cast<QPlatformMenuBar*>(m_bar.data())) {
        bar->handleReparent(nullptr);
        // native-rules #2: naked delete of a platform menu bar that is held by a QPointer
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
        connect(menu, &QPlatformMenu::aboutToHide, this, [this]() { m_openMenus.clear(); });
        bar->insertMenu(menu, nullptr);
    }
    bar->handleReparent(m_anchor->window());
}
void ShellMenus::populate(QPlatformMenu* menu, const std::vector<ShellMenuItem>& items) {
    connect(menu, &QPlatformMenu::aboutToShow, this, [this, menu]() { m_openMenus.insert(menu); refreshRegisteredItems(); });
    connect(menu, &QPlatformMenu::aboutToHide, this, [this, menu]() { m_openMenus.remove(menu); });
    connect(menu, &QObject::destroyed, this, [this, menu]() { m_openMenus.remove(menu); });
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
            connect(item, &QPlatformMenuItem::activated, this, [this, action = entry.action]() { m_openMenus.clear(); trigger(action); });
            const auto& entries = shellMenuEntries();
            if (std::any_of(entries.begin(), entries.end(), [&](const auto& e) { return e.action == entry.action; })) {
                m_registered.push_back({item, menu, entry.action});
            }
        }
        menu->insertMenuItem(item, nullptr);
    }
}

}
