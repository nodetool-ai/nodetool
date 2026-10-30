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
                ExecutionRole, FavoriteRole, DefaultRole, CurrentRole, AvailableRole, RawRole };
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
public:
    using Completion = std::function<void(QJsonValue, QString)>;
    using Query = std::function<void(const QString&, QJsonObject, Completion)>;
    explicit Catalog(QObject* parent = nullptr);
    void setQuery(Query query);
    void setIdentity(const QString& identity);
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
    QString preferenceKey() const;
    static QString key(const QString& id, const QString& provider);
    Query m_query;
    ResultModel m_results;
    QString m_identity, m_mode = QStringLiteral("video"), m_scope = QStringLiteral("local");
    QString m_search, m_group = QStringLiteral("All"), m_error;
    QStringList m_providers, m_favorites, m_recent;
    QStringList m_rankedKeys;
    QHash<QString, QVariantMap> m_providerMeta;
    QString m_default;
    QVariantList m_models;
    QVariantMap m_selected;
    bool m_loading = false;
    bool m_loaded = false;
    bool m_serverDefault = false;
    quint64 m_revision = 0;
    int m_pending = 0;
};
}
