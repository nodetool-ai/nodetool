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

namespace nt::app {
struct ShellMenuItem {
    QString label;
    QString action;
    QString shortcut;
    QKeySequence sequence;
    bool enabled = true;
    std::vector<ShellMenuItem> children;
};
struct Menu { QString label; std::vector<ShellMenuItem> items; };
QKeyCombination bindingCombination(const QStringList& keys);
std::vector<Menu> shellMenuDescription(const QString& preset, const QVariantList& recent = {});

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
    void rebuild();
    void populate(QPlatformMenu* menu, const std::vector<ShellMenuItem>& items);
    QPointer<Preferences> m_preferences;
    QPointer<QQuickItem> m_anchor;
    QString m_preset = QStringLiteral("nodetool");
    QPointer<QObject> m_bar;
};
}
