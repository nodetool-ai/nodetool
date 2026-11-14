#pragma once
#include <QHash>
#include <QPoint>
#include <QString>
#include <QVariantList>
#include <QVariantMap>
#include <functional>
#include <memory>
#include <optional>

namespace nodetool {

struct RowOptions {
    QString shortcut;
    QString tooltip;
    QString reason;
    bool enabled = true;
    bool destructive = false;
    std::optional<bool> checked;
};

// Entries for ContextMenuPanel.qml (see Ui.ContextMenu.entries) plus the action each id runs.
class MenuBuilder {
public:
    void item(const QString &id, const QString &label, const QString &icon, std::function<void()> run, const RowOptions &options = {}) {
        QVariantMap entry{{"id", id}, {"label", label}, {"icon", icon}, {"enabled", options.enabled}, {"destructive", options.destructive}};
        if (!options.shortcut.isEmpty()) { entry.insert("shortcut", options.shortcut); }
        if (!options.tooltip.isEmpty()) { entry.insert("tooltip", options.tooltip); }
        if (!options.reason.isEmpty() && !options.enabled) { entry.insert("reason", options.reason); }
        if (options.checked) { entry.insert("checked", *options.checked); }
        entries_.append(entry);
        actions_.insert(id, std::move(run));
    }
    void submenu(const QString &id, const QString &label, const QString &icon, const MenuBuilder &children, const RowOptions &options = {}) {
        QVariantMap entry{{"id", id}, {"label", label}, {"icon", icon}, {"enabled", options.enabled && !children.entries_.isEmpty()}, {"submenu", children.entries_}};
        if (!options.reason.isEmpty() && !entry.value("enabled").toBool()) { entry.insert("reason", options.reason); }
        entries_.append(entry);
        for (auto it = children.actions_.cbegin(); it != children.actions_.cend(); ++it) {
            actions_.insert(it.key(), it.value());
        }
    }
    void separator() {
        if (entries_.isEmpty() || entries_.last().toMap().contains("separator")) {
            return;
        }
        entries_.append(QVariantMap{{"separator", true}});
    }
    void header(const QString &label) {
        entries_.append(QVariantMap{{"header", label}});
    }
    QVariantList entries() const {
        auto result = entries_;
        while (!result.isEmpty() && result.last().toMap().contains("separator")) {
            result.removeLast();
        }
        return result;
    }
    const QHash<QString, std::function<void()>> &actions() const { return actions_; }
private:
    QVariantList entries_;
    QHash<QString, std::function<void()>> actions_;
};

// One menu shown by EditorWindow::showEntryMenu. `choose` runs the chosen id
// when set, otherwise the entry of `actions` with that id.
struct EntryMenuRequest {
    QString kind;
    QPoint global;
    QVariantList entries;
    QHash<QString, std::function<void()>> actions;
    std::function<void(const QString &)> choose;
    // A choice is dropped when the selection changed while the menu was open.
    bool guardSelection = false;
    // The menu closes, and a choice is dropped, when the document or credentials change.
    bool guardDocument = true;
    // The choice runs from the event loop after the menu closed, for choices that close the owning tab.
    bool deferChoice = false;
    // Keeps what the actions capture alive as long as the menu.
    std::shared_ptr<void> keepAlive;
};

} // namespace nodetool
