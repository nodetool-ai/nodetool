#pragma once
#include <QObject>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QPointer>
#include <QVariantList>
#include <functional>
namespace nodetool::node_editor {
class ResourcePickerController final : public QObject {
 Q_OBJECT
public:
 explicit ResourcePickerController(QObject* parent = nullptr);
 Q_INVOKABLE void configure(const QUrl& origin, const QString& token, const QString& userId);
 Q_INVOKABLE void workflows(const QString& key, const QString& cursor = {});
    Q_INVOKABLE void verifyAsset(const QString& key, const QString& id);
    Q_INVOKABLE void createFolder(const QString& key, const QString& parentId, const QString& name);
    Q_INVOKABLE void mediaConstraints(const QString& key, bool video, const QString& provider, const QString& id);
    Q_INVOKABLE void remaining(const QString& key, const QString& kind, const QString& projectId = "default");
 Q_INVOKABLE void collections(const QString& key);
 // The apps an App node can run, as AppLoader's applications.list. Emits listed() with no cursor.
 Q_INVOKABLE void applications(const QString& key);
 Q_INVOKABLE void verifyWorkflow(const QString& key, const QString& id);
 Q_INVOKABLE void cancel(const QString& key);
signals:
 void cleared();
 void listed(QString key, QVariantList resources, QString nextCursor);
    void folderCreated(QString key);
    void constraintsListed(QString key, QVariantMap constraints);
    void remainingListed(QString key, QVariantList rows);
 void collectionsListed(QString key, QVariantList collections);
 void verified(QString key, QString id, bool available);
 void failed(QString key, QString message);
private:
 void query(const QString& key, const QString& procedure, const QJsonObject& input, std::function<void(QJsonObject, int)> done);
 QNetworkAccessManager m_network;
 QUrl m_origin;
 QString m_token, m_user;
 QHash<QString, QPointer<QNetworkReply>> m_replies;
 QHash<QString, quint64> m_serials;
 quint64 m_next = 0;
};
}
