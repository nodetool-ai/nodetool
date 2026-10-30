#pragma once
#include <QObject>
#include <QJSEngine>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class DockLayoutStore : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QVariantMap layout READ layout NOTIFY changed)
    Q_PROPERTY(int layoutEpoch READ layoutEpoch NOTIFY changed)
    Q_PROPERTY(QString workspace READ workspace NOTIFY changed)
    Q_PROPERTY(QStringList workspaces READ workspaces CONSTANT)
public:
    explicit DockLayoutStore(QObject* parent = nullptr);
    int layoutEpoch() const { return m_epoch; }
    QVariantMap layout() const { return m_layout; }
    QString workspace() const { return m_workspace; }
    QStringList workspaces() const { return {"Editing", "Script", "Assistant", "Review"}; }
    Q_INVOKABLE bool dispatch(const QVariantMap& action);
    Q_INVOKABLE void registerPanels(const QVariantList& panels);
    Q_INVOKABLE void switchWorkspace(int index);
    Q_INVOKABLE void resetWorkspace();
    Q_INVOKABLE void resizeRegion(const QString& region, double size, double width, double height);
    Q_INVOKABLE QVariantMap displaySizes(double width, double height, const QVariantMap& requested) const;
signals:
    void changed();
private:
    QVariantMap call(const QString& name, const QVariantList& args);
    QVariantMap withScriptPanelSelected(const QVariantMap& layout);
    void persist();
    QJSEngine m_engine;
    QVariantMap m_layout;
    QString m_workspace = "Editing";
    QVariantMap m_workspaces;
    QVariantList m_panels;
    int m_epoch = 0;
};
