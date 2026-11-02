#pragma once
#include "app/Preferences/Preferences.h"
#include <QKeySequence>
#include <QObject>
#include <QVariantList>
#include <QPointer>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>
#include <vector>

class QPlatformMenu;
class QPlatformMenuItem;

namespace nt::app {
struct ShellMenuItem {
    QString label;
    QString action;
    QString shortcut;
    QKeySequence sequence;
    bool enabled = true;
    std::vector<ShellMenuItem> children;
    bool separator = false;
    bool checkable = false;
    bool checked = false;
};
struct Menu { QString label; std::vector<ShellMenuItem> items; };
QKeyCombination bindingCombination(const QStringList& keys);
// The built-in menus plus the registerShellMenuItem entries (app/MenuRegistry.h).
// `context` is what the entries' enabled and checked predicates receive.
std::vector<Menu> shellMenuDescription(const QString& preset, const QVariantList& recent = {},
                                       const QVariantMap& context = {});

class ShellMenus : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(Preferences* preferences READ preferences WRITE setPreferences NOTIFY preferencesChanged)
    Q_PROPERTY(QQuickItem* anchor READ anchor WRITE setAnchor NOTIFY anchorChanged)
    Q_PROPERTY(QString keyboardPreset READ keyboardPreset WRITE setKeyboardPreset NOTIFY keyboardPresetChanged)
public:
    explicit ShellMenus(QObject* parent = nullptr);
    ~ShellMenus() override;
    QQuickItem* anchor() const { return m_anchor; }
    void setAnchor(QQuickItem* item);
    QString keyboardPreset() const { return m_preset; }
    void setKeyboardPreset(const QString& preset);
    Preferences* preferences() const { return m_preferences; }
    void setPreferences(Preferences* preferences);
    Q_INVOKABLE bool trigger(const QString& action);
signals:
    void anchorChanged();
    void keyboardPresetChanged();
    void settingsRequested();
    void openTimelineRequested();
    void newTimelineRequested();
    void preferencesChanged();
private:
    struct RegisteredItem {
        QPointer<QObject> item;
        QPlatformMenu* menu = nullptr;
        QString action;
    };
    void rebuild();
    void populate(QPlatformMenu* menu, const std::vector<ShellMenuItem>& items);
    QVariantMap menuContext() const;
    void refreshRegisteredItems();
    std::vector<RegisteredItem> m_registered;
    QPointer<Preferences> m_preferences;
    QPointer<QQuickItem> m_anchor;
    QString m_preset = QStringLiteral("nodetool");
    QPointer<QObject> m_bar;
};
}
