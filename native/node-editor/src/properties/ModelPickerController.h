#pragma once
#include <QHash>
#include <QJsonObject>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QObject>
#include <QPointer>
#include <QSet>
#include <QUrl>
#include <QWebSocket>
#include "ModelPickerCatalog.h"
namespace nodetool::node_editor {
class WorkflowDocument;
// Owns the authenticated transport and one shared catalog per model field shape.
// Model downloads use the server's /ws/download socket, as ModelDownloadStore.ts.
class ModelPickerController final : public QObject {
 Q_OBJECT
 Q_PROPERTY(bool loading READ loading NOTIFY changed)
 Q_PROPERTY(QString error READ error NOTIFY changed)
public:
 explicit ModelPickerController(QObject* parent = nullptr);
 bool loading() const { return m_pending > 0; }
 QString error() const { return m_error; }
 Q_INVOKABLE void configure(const QUrl& origin, const QString& token, const QString& userId);
 // `nodeType` selects the recommended downloads, as useRecommendedModelsForNode.
 Q_INVOKABLE QObject* catalogFor(const QString& modelType, const QStringList& allowedProviders, const QStringList& tasks, const QString& nodeType = {});
 // Opens provider settings on the server's web app, as PackSetup does.
 Q_INVOKABLE void openProviderSettings(const QString& provider);
 void fillWorkflowDefaults(WorkflowDocument* document, const QJsonArray& metadata);
 QVariantMap downloads() const { return m_downloads; }
signals:
 void changed();
 void providerSettingsRequested(QUrl url, QString provider);
private:
 void cancel();
 void applyWorkflowDefaults();
 QPointer<WorkflowDocument> m_document;
 QJsonArray m_metadata;
 QHash<QString, nt::modelpicker::Catalog*> m_defaultCatalogs;
 quint64 m_documentEpoch = 0;
 QMetaObject::Connection m_documentConnection, m_documentChangedConnection;
 QHash<QString, QJsonObject> m_documentBaseline;
 QHash<QString, QSet<QString>> m_touchedProperties;
 bool m_documentReplaced = true;
 QStringList m_rankedKeys, m_recommendedKeys;
 bool m_recommendationsRequested = false, m_recommendationsLoaded = false;
 void query(const QString& procedure, const QJsonObject& input, nt::modelpicker::Catalog::Completion done);
 void mutate(const QString& procedure, const QJsonValue& input, nt::modelpicker::Catalog::Completion done);
 void finish(QNetworkReply* reply, quint64 epoch, nt::modelpicker::Catalog::Completion done);
 QNetworkRequest request(const QUrl& url) const;
 void startDownload(const QString& rowKey, const QVariantList& targets, const QString& modelType);
 void cancelDownload(const QString& id);
 void sendDownloadCommand(const QJsonObject& command);
 void receiveDownloadFrame(const QString& text);
 void updateDownload(const QString& id, const QVariantMap& update);
 void publishDownloads();
 QString identity() const;
 QNetworkAccessManager m_network;
 QHash<QString, nt::modelpicker::Catalog*> m_catalogs;
 QUrl m_origin;
 QString m_token, m_user, m_error;
 quint64 m_epoch = 0;
 int m_pending = 0;
 QPointer<QWebSocket> m_downloadSocket;
 QList<QByteArray> m_queuedCommands;
 QVariantMap m_downloads;
 QStringList m_requestedRows;
};
}
