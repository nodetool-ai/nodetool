#pragma once
#include <QObject>
#include <QStringList>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>
#include <vector>

namespace nt::app {
using MenuPredicate = std::function<bool(const QVariantMap&)>;
// Items of one group stay together, with a separator between groups. Groups
// sort by their lowest order, items within a group by order. Equal orders keep
// registration order.
struct MenuItem {
    QString kind;
    QString action;
    QString label;
    QString shortcut;
    MenuPredicate enabled;
    QString group = {};
    int order = 0;
    MenuPredicate checked = {};  // set: the item shows a checkmark
    QString disabledReason = {};  // what the menu says while `enabled` is false
    QString submenu = {};  // set: the menu shows the item in this submenu, if the host supports submenus
    MenuPredicate applies = {};  // set: false leaves the item out, for a target it can never work on
};
bool registerMenuItem(MenuItem item);
const std::vector<MenuItem>& menuItems();

// One item of the application menu bar. The predicates and `run` receive the
// context from ShellMenus: `kind` is "shell", and `gestures` and `timeline`
// hold the editor's objects when one is open. Without `run` the item calls
// gestures.runAction(action, context).
struct ShellMenuEntry {
    QString menu;  // one of shellMenuNames()
    QString action;
    QString label;
    QString shortcut = {};  // used only when no preset or key action binds the action
    QString submenu = {};   // set: the item goes in this one-level submenu
    QString group = {};
    int order = 0;
    MenuPredicate enabled = {};
    MenuPredicate checked = {};  // set: the item shows a checkmark
    MenuPredicate run = {};
    QString disabledReason = {};  // why the item is off while `enabled` is false
};
const QStringList& shellMenuNames();
bool registerShellMenuItem(ShellMenuEntry entry);
const std::vector<ShellMenuEntry>& shellMenuEntries();
// The entries of one menu in display order.
std::vector<ShellMenuEntry> shellMenuEntries(const QString& menu);
}
class MenuRegistry : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit MenuRegistry(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE QVariantList query(const QString& kind, const QVariantMap& context) const;
};
