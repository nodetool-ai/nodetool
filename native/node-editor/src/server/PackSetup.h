#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QSet>
#include <QTimer>
#include <QUrl>
#include <functional>

namespace nodetool::node_editor {
class PackSetup : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList packs READ packs NOTIFY changed)
    Q_PROPERTY(QVariantList categories READ categories NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    // The node library leaves out nodes whose key is missing once the secrets
    // have loaded, unless the user shows them (web hooks/useNodeProviderFilter.ts).
    Q_PROPERTY(bool secretsLoaded READ secretsLoaded NOTIFY changed)
    Q_PROPERTY(QStringList configuredKeys READ configuredKeys NOTIFY changed)
    Q_PROPERTY(bool showNodesWithoutKey READ showNodesWithoutKey WRITE setShowNodesWithoutKey NOTIFY changed)
public:
    explicit PackSetup(QObject *parent = nullptr);
    QVariantList packs() const;
    QVariantList categories() const;
    Q_INVOKABLE void setCategory(const QString &id, bool enabled);
    Q_INVOKABLE void setAllCategories(bool enabled);
    Q_INVOKABLE bool namespaceVisible(const QString &name) const;
    QString error() const { return error_; }
    bool secretsLoaded() const { return secretsLoaded_; }
    QStringList configuredKeys() const;
    bool showNodesWithoutKey() const { return showNodesWithoutKey_; }
    void setShowNodesWithoutKey(bool show);
    void configure(const QUrl &origin, const QString &token, const QString &user);
    void setNodeTypes(const QStringList &types);
    void activeEditorChanged() { sync(); }
    Q_INVOKABLE void refreshSecrets();
    Q_INVOKABLE void openProviderSettings();
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void setEnabled(const QString &id, bool enabled);
signals:
    void changed();
    void registryRefreshRequested();
private:
    void sync();
    void request(const QString &route, const QJsonObject &body, bool mutation,
                 std::function<void(QJsonObject)> done);
    QNetworkAccessManager network_;
    QTimer secretTimer_;
    QUrl origin_;
    QString token_, user_, error_;
    QJsonArray packs_, secrets_;
    // Cached because QML asks for every catalog namespace on each refresh.
    QStringList enabledCategories_;
    QStringList nodeTypes_;
    QSet<QString> pending_;
    bool secretsLoaded_ = false;
    bool showNodesWithoutKey_ = false;
    quint64 epoch_ = 0;
};
}
