#pragma once

#include <QAbstractListModel>
#include <QHash>
#include <QJsonObject>
#include <QPointer>
#include <QVariantList>
#include <functional>

namespace nt::modelpicker {
class ResultModel final : public QAbstractListModel {
    Q_OBJECT
public:
    enum Role { IdRole = Qt::UserRole + 1, ProviderRole, NameRole, DetailRole,
                ExecutionRole, FavoriteRole, DefaultRole, CurrentRole, AvailableRole, RawRole,
                KindRole, NeedsDownloadRole, DownloadRole, DownloadHintRole, ExecutionStateRole };
    explicit ResultModel(QObject* parent = nullptr) : QAbstractListModel(parent) {}
    int rowCount(const QModelIndex& parent = {}) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    void replace(QVariantList rows);
    QVariantMap at(int index) const;
private:
    QVariantList m_rows;
};

class Catalog : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString mode READ mode WRITE setMode NOTIFY changed)
    Q_PROPERTY(QString modelScope READ modelScope WRITE setModelScope NOTIFY changed)
    Q_PROPERTY(QString search READ search WRITE setSearch NOTIFY changed)
    Q_PROPERTY(QString group READ group WRITE setGroup NOTIFY changed)
    Q_PROPERTY(QStringList providers READ providers NOTIFY changed)
    Q_PROPERTY(QStringList cloudProviders READ cloudProviders NOTIFY changed)
    Q_PROPERTY(QStringList localProviders READ localProviders NOTIFY changed)
    Q_PROPERTY(QAbstractItemModel* results READ results CONSTANT)
    Q_PROPERTY(QVariantList models READ models NOTIFY changed)
    Q_PROPERTY(QVariantMap selectedModel READ selectedModel NOTIFY changed)
    Q_PROPERTY(QString selectedModelId READ selectedModelId NOTIFY changed)
    Q_PROPERTY(QString selectedProvider READ selectedProvider NOTIFY changed)
    Q_PROPERTY(QString selectedModelType READ selectedModelType NOTIFY changed)
    Q_PROPERTY(QVariantMap constraints READ constraints NOTIFY changed)
    Q_PROPERTY(bool selectionAvailable READ selectionAvailable NOTIFY changed)
    Q_PROPERTY(bool loaded READ loaded NOTIFY changed)
    Q_PROPERTY(bool needsProviderSetup READ needsProviderSetup NOTIFY changed)
    Q_PROPERTY(bool loading READ loading NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
    // Web copy for the loading row, the failed-provider count and the
    // "Add an API key" row of ModelMenuDialogBase.tsx.
    Q_PROPERTY(QString loadingText READ loadingText NOTIFY changed)
    Q_PROPERTY(int failedProviderCount READ failedProviderCount NOTIFY changed)
    Q_PROPERTY(bool showAddKeyRow READ showAddKeyRow NOTIFY changed)
    Q_PROPERTY(bool hasDownloads READ hasDownloads NOTIFY changed)
public:
    using Completion = std::function<void(QJsonValue, QString)>;
    using Query = std::function<void(const QString&, QJsonObject, Completion)>;
    // A tRPC mutation with a JSON body, such as models.huggingfaceCacheStatus.
    using Mutation = std::function<void(const QString&, QJsonValue, Completion)>;
    // Starts the downloads of one picker row. `rowKey` names the row, and each
    // target is a catalogDownloadTargets entry.
    struct DownloadHandler {
        std::function<void(const QString& rowKey, const QVariantList& targets, const QString& modelType)> start;
        std::function<void(const QString& id)> cancel;
    };
    explicit Catalog(QObject* parent = nullptr);
    void setQuery(Query query);
    void setIdentity(const QString& identity);
    // These apply on the next reload. Empty lists leave the catalog unfiltered.
    void setDefaultContext(const QString& context) { m_defaultContext = context; }
    void setFilter(const QStringList& allowedProviders, const QStringList& tasks);
    // The hf.* or tjs.* type a repository catalog lists.
    void setRepositoryType(const QString& type) { m_repositoryType = type; }
    void setMutation(Mutation mutation);
    void setDownloadHandler(DownloadHandler handler);
    // The procedure that lists recommended downloads, read on the next reload.
    void setRecommendationProcedure(const QString& procedure);
    // Download progress by download id, and the rows whose Download was clicked,
    // shared by every catalog of one host.
    void setDownloadState(const QVariantMap& downloads, const QStringList& requestedRows);
    QString mode() const { return m_mode; }
    void setMode(const QString& mode);
    QString modelScope() const { return m_scope; }
    void setModelScope(const QString& scope);
    QString search() const { return m_search; }
    void setSearch(const QString& search);
    QString group() const { return m_group; }
    void setGroup(const QString& group);
    QStringList providers() const { return m_providers; }
    QStringList cloudProviders() const;
    QStringList localProviders() const;
    Q_INVOKABLE QString providerLabel(const QString& provider) const;
    QAbstractItemModel* results() { return &m_results; }
    QVariantList models() const { return m_models; }
    QVariantMap selectedModel() const { return m_selected; }
    QString selectedModelId() const { return m_selected.value("id").toString(); }
    QString selectedProvider() const { return m_selected.value("provider").toString(); }
    QString selectedModelType() const { return m_selected.value("modelType").toString(); }
    QVariantMap constraints() const;
    bool selectionAvailable() const;
    bool loaded() const { return m_loaded; }
    bool needsProviderSetup() const;
    Q_INVOKABLE bool hasAvailable(const QString& id, const QString& provider) const;
    // An empty provider matches the first model with the id.
    Q_INVOKABLE QVariantMap modelDetails(const QString& id, const QString& provider) const;
    Q_INVOKABLE bool providerKeyMissing(const QString& provider) const;
    // The secret a provider needs, from settings.providerCatalog keys.
    Q_INVOKABLE QString providerSecret(const QString& provider) const;
    // missingKeyWarning in web/src/components/properties/shared/missingKeyWarning.ts.
    Q_INVOKABLE QString missingKeyWarning(const QString& provider) const;
    Q_INVOKABLE bool providerHasModels(const QString& provider) const;
    // The field button text for a stored value. See fieldLabel in ModelLabels.h.
    Q_INVOKABLE QVariantMap fieldLabel(const QString& modelType, const QVariant& value, const QString& provider) const;
    QString loadingText() const;
    int failedProviderCount() const { return m_failedProviders; }
    bool showAddKeyRow() const;
    bool hasDownloads() const { return !m_recommended.isEmpty(); }
    // Clears the search and the Favorites or Recent view, as the web menu does
    // each time it opens. A provider filter with no models resets after loading.
    Q_INVOKABLE void prepareOpen();
    Q_INVOKABLE void requestDownload(const QString& id, const QString& provider);
    Q_INVOKABLE void cancelDownload(const QString& id);
    bool loading() const { return m_loading; }
    QString error() const { return m_error; }
    Q_INVOKABLE void reload();
    Q_INVOKABLE void selectModel(const QString& id, const QString& provider);
    Q_INVOKABLE void clearSelection();
    Q_INVOKABLE void toggleFavorite(const QString& id, const QString& provider);
    Q_INVOKABLE void setDefault(const QString& id, const QString& provider);
    Q_INVOKABLE QVariantMap resultAt(int index) const { return m_results.at(index); }
signals:
    void changed();
    void selectionCommitted(QString id, QString provider);
private:
    void present();
    void complete(quint64 revision);
    void restoreSelection();
    void loadPreferences();
    void loadRecommendations(quint64 revision);
    void persistList(const QString& name, const QStringList& values) const;
    QVariantMap downloadPresentation(const QStringList& ids, bool requireStatus) const;
    void appendRecommendedRows(QVariantList& rows, const QString& query) const;
    QString accountKey() const;
    QString preferenceKey() const;
    static QString key(const QString& id, const QString& provider);
    Query m_query;
    Mutation m_mutation;
    DownloadHandler m_downloadHandler;
    ResultModel m_results;
    QString m_identity, m_mode = QStringLiteral("video"), m_scope = QStringLiteral("local");
    QString m_search, m_group = QStringLiteral("All"), m_error;
    QStringList m_providers, m_favorites, m_recent;
    QStringList m_rankedKeys, m_allowedProviders, m_tasks;
    QString m_repositoryType = QStringLiteral("hf.model");
    QHash<QString, QVariantMap> m_providerMeta;
    QString m_recommendationProcedure;
    QVariantList m_recommended;
    QHash<QString, bool> m_cacheStatus;
    QVariantMap m_downloads;
    QStringList m_requestedRows;
    QString m_default;
    QString m_defaultContext;
    QVariantList m_models;
    QVariantMap m_selected;
    bool m_loading = false;
    bool m_loaded = false;
    bool m_serverDefault = false;
    quint64 m_revision = 0;
    int m_pending = 0;
    int m_totalProviders = 0;
    int m_loadedProviders = 0;
    int m_failedProviders = 0;
    bool m_resetEmptyGroup = false;
};
}
