#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QSet>
#include <QTimer>
#include <QUrl>
#include <functional>

namespace nodetool::node_editor {
class PackSetup final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList packs READ packs NOTIFY changed)
    Q_PROPERTY(QVariantList categories READ categories NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit PackSetup(QObject *parent = nullptr);
    QVariantList packs() const;
    QVariantList categories() const;
    Q_INVOKABLE void setCategory(const QString &id, bool enabled);
    Q_INVOKABLE void setAllCategories(bool enabled);
    Q_INVOKABLE bool namespaceVisible(const QString &name) const;
    QString error() const { return error_; }
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
    QStringList nodeTypes_;
    QSet<QString> pending_;
    quint64 epoch_ = 0;
};
}
