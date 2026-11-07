#include "ModelPickerCatalog.h"
#include "CatalogRules.h"
#include <QCryptographicHash>
#include <QJsonArray>
#include <QSettings>
#include <QSet>
#include <algorithm>
#include <cmath>
#include <limits>

namespace nt::modelpicker {
int ResultModel::rowCount(const QModelIndex& parent) const { return parent.isValid() ? 0 : m_rows.size(); }
QVariant ResultModel::data(const QModelIndex& index, int role) const {
    if (!index.isValid() || index.row() < 0 || index.row() >= m_rows.size()) return {};
    const auto row = m_rows[index.row()].toMap();
    switch (role) {
    case IdRole: return row.value("id");
    case ProviderRole: return row.value("provider");
    case NameRole: return row.value("name");
    case DetailRole: return row.value("detail");
    case ExecutionRole: return row.value("executionLabel");
    case FavoriteRole: return row.value("favorite");
    case DefaultRole: return row.value("isDefault");
    case CurrentRole: return row.value("current");
    case AvailableRole: return row.value("available");
    case RawRole: return row.value("raw");
    default: return {};
    }
}
QHash<int, QByteArray> ResultModel::roleNames() const {
    return {{IdRole, "modelId"}, {ProviderRole, "provider"}, {NameRole, "name"},
            {DetailRole, "detail"}, {ExecutionRole, "executionLabel"},
            {FavoriteRole, "favorite"}, {DefaultRole, "isDefault"},
            {CurrentRole, "current"}, {AvailableRole, "available"}, {RawRole, "raw"}};
}
void ResultModel::replace(QVariantList rows) {
    beginResetModel();
    m_rows = std::move(rows);
    endResetModel();
}
QVariantMap ResultModel::at(int index) const {
    return index >= 0 && index < m_rows.size() ? m_rows[index].toMap() : QVariantMap{};
}

Catalog::Catalog(QObject* parent) : QObject(parent), m_results(this) {}
void Catalog::setQuery(Query query) { m_query = std::move(query); reload(); }
void Catalog::setIdentity(const QString& identity) {
    if (m_identity == identity) return;
    ++m_revision;
    m_identity = identity;
    m_models.clear(); m_providers.clear(); m_providerMeta.clear(); m_rankedKeys.clear(); m_selected.clear(); m_error.clear(); m_loaded = false;
    m_results.replace({});
    restoreSelection();
    m_loading = false;
    present();
}
void Catalog::setMode(const QString& mode) {
    if (mode == m_mode || detail::catalogProcedure(mode).isEmpty()) return;
    m_mode = mode;
    restoreSelection();
    reload();
}
void Catalog::setModelScope(const QString& scope) {
    if ((scope != "local" && scope != "worker") || scope == m_scope) return;
    m_scope = scope;
    if (m_mode == "huggingface_model") reload(); else emit changed();
}
void Catalog::setSearch(const QString& search) {
    if (search == m_search) return;
    m_search = search;
    if (!search.trimmed().isEmpty() && (m_group == "Favorites" || m_group == "Recent")) m_group = "All";
    present();
}
void Catalog::setGroup(const QString& group) { if (group != m_group) { m_group = group; present(); } }
QString Catalog::providerLabel(const QString& provider) const {
    const auto display = m_providerMeta.value(provider).value("display_name").toString();
    return display.isEmpty() ? provider : display;
}
QStringList Catalog::cloudProviders() const {
    QStringList result;
    for (const auto& id : m_providers) {
        const auto access = m_providerMeta.value(id).value("access").toString();
        if (access == "remote_api" || access.isEmpty()) result.append(id);
    }
    return result;
}
QStringList Catalog::localProviders() const {
    QStringList result;
    for (const auto& id : m_providers) {
        const auto access = m_providerMeta.value(id).value("access").toString();
        if (access == "in_process" || access == "local_service") result.append(id);
    }
    return result;
}
QString Catalog::key(const QString& id, const QString& provider) { return provider + QChar(0x1f) + id; }
QString Catalog::preferenceKey() const {
    const auto digest = QCryptographicHash::hash(m_identity.toUtf8(), QCryptographicHash::Sha256).toHex();
    return "modelPicker/" + QString::fromLatin1(digest) + "/" + m_mode + "/";
}
void Catalog::restoreSelection() {
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker");
    const auto prefix = preferenceKey();
    m_favorites = settings.value(prefix + "favorites").toStringList();
    m_recent = settings.value(prefix + "recent").toStringList();
    m_default = settings.value(prefix + "default").toString();
    m_serverDefault = settings.value(prefix + "serverDefault", false).toBool();
    m_selected.clear();
    const auto id = settings.value(prefix + "model").toString();
    const auto provider = settings.value(prefix + "provider").toString();
    if (!id.isEmpty() && !provider.isEmpty()) m_selected = {{"id", id}, {"provider", provider}};
}
QVariantMap Catalog::constraints() const { return detail::catalogConstraints(m_selected); }
bool Catalog::hasAvailable(const QString& id, const QString& provider) const {
    for (const auto& entry : m_models) {
        const auto model = entry.toMap();
        if (model.value("id") != id || model.value("provider") != provider) continue;
        const auto state = model.value("execution").toMap().value("state").toString();
        return state.isEmpty() || state == "ready";
    }
    return false;
}
bool Catalog::selectionAvailable() const {
    return m_loaded && !m_loading && hasAvailable(selectedModelId(), selectedProvider());
}
bool Catalog::needsProviderSetup() const {
    bool knownUnconfigured = false;
    for (const auto& id : m_providers) {
        const auto meta = m_providerMeta.value(id);
        if (meta.value("access").toString() != "remote_api" || !meta.contains("configured")) continue;
        if (meta.value("configured").toBool()) return false;
        knownUnconfigured = true;
    }
    return knownUnconfigured;
}
void Catalog::reload() {
    const auto revision = ++m_revision;
    if (!m_query || m_identity.isEmpty()) {
        m_loading = false;
        m_error = "Connect to a server to browse models.";
        emit changed();
        return;
    }
    m_loading = true; m_error.clear(); m_pending = 0; m_rankedKeys.clear();
    emit changed();
    const QPointer<Catalog> guard(this);
    if (m_mode == "huggingface_model") {
        m_query("models.huggingfaceByType", {{"model_type", "hf.model"}, {"scope", m_scope}}, [guard, revision](QJsonValue value, QString error) {
            if (!guard || revision != guard->m_revision) return;
            if (error.isEmpty()) {
                guard->m_models = detail::catalogModels(value.toArray(), "huggingface", guard->m_mode);
                guard->m_providers = {"huggingface"};
            } else {
                guard->m_models.clear(); guard->m_providers.clear();
            }
            guard->m_error = error; guard->m_loading = false;
            guard->complete(revision);
        });
        return;
    }
    m_query("models.providers", {}, [guard, revision](QJsonValue value, QString error) {
        if (!guard || revision != guard->m_revision) return;
        if (!error.isEmpty()) {
            guard->m_models.clear(); guard->m_providers.clear();
            guard->m_error = error; guard->m_loading = false; guard->complete(revision);
            return;
        }
        QStringList names;
        guard->m_providerMeta.clear();
        for (const auto& entry : value.toArray()) {
            const auto provider = entry.toObject();
            const auto name = provider.value("provider").toString();
            if (!name.isEmpty() && detail::catalogProviderMatches(guard->m_mode, provider.value("capabilities").toArray())) {
                names.append(name);
                guard->m_providerMeta.insert(name, provider.toVariantMap());
            }
        }
        guard->m_query("settings.providerCatalog", {}, [guard, revision](QJsonValue settings, QString failure) {
            if (!guard || revision != guard->m_revision || !failure.isEmpty()) return;
            for (const auto& entry : settings.toArray()) {
                const auto configured = entry.toObject();
                const auto id = configured.value("provider").toString();
                if (id.isEmpty()) continue;
                auto meta = guard->m_providerMeta.value(id);
                meta.insert("configured", configured.value("configured").toBool());
                if (!configured.value("name").toString().isEmpty() && meta.value("display_name").toString().isEmpty()) meta.insert("display_name", configured.value("name").toString());
                guard->m_providerMeta.insert(id, meta);
            }
            guard->present();
        });
        names.removeDuplicates(); names.sort(Qt::CaseInsensitive);
        guard->m_pending = names.size() + 1;
        if (names.isEmpty()) { guard->m_models.clear(); guard->m_providers.clear(); guard->m_loading = false; guard->complete(revision); return; }
        auto accumulated = std::make_shared<QVariantList>();
        auto errors = std::make_shared<QStringList>();
        const auto finish = [guard, revision, names, accumulated, errors] {
            if (!guard || revision != guard->m_revision || --guard->m_pending != 0) return;
            guard->m_models = *accumulated;
            guard->m_providers = names;
            guard->m_error = errors->join('\n');
            guard->m_loading = false;
            guard->complete(revision);
        };
        guard->m_query("models.rankedKeys", {}, [guard, revision, finish](QJsonValue result, QString failure) {
            if (!guard || revision != guard->m_revision) return;
            if (failure.isEmpty()) {
                for (const auto& value : result.toArray()) {
                    if (value.isString()) guard->m_rankedKeys.append(value.toString());
                }
            }
            finish();
        });
        for (const auto& name : names) {
            guard->m_query(detail::catalogProcedure(guard->m_mode), {{"provider", name}}, [guard, revision, name, accumulated, errors, finish](QJsonValue result, QString failure) {
                if (!guard || revision != guard->m_revision) return;
                if (failure.isEmpty()) accumulated->append(detail::catalogModels(result.toArray(), name, guard->m_mode));
                else errors->append(name + ": " + failure);
                finish();
            });
        }
    });
}
void Catalog::complete(quint64 revision) {
    if (revision != m_revision) return;
    m_loaded = true;
    if (m_selected.isEmpty() && !m_serverDefault && !m_default.isEmpty()) {
        for (const auto& item : m_models) {
            const auto candidate = item.toMap();
            if (key(candidate.value("id").toString(), candidate.value("provider").toString()) == m_default
                && hasAvailable(candidate.value("id").toString(), candidate.value("provider").toString())) {
                m_selected = candidate;
                emit selectionCommitted(selectedModelId(), selectedProvider());
                break;
            }
        }
    }
    const auto id = selectedModelId();
    const auto provider = selectedProvider();
    const auto selectedKey = key(id, provider);
    m_selected = id.isEmpty() || provider.isEmpty() ? QVariantMap{} : QVariantMap{{"id", id}, {"provider", provider}};
    for (const auto& item : m_models) {
        const auto model = item.toMap();
        if (key(model.value("id").toString(), model.value("provider").toString()) == selectedKey) {
            m_selected = model;
            break;
        }
    }
    present();
}
void Catalog::present() {
    QVariantList rows;
    const auto query = m_search.trimmed();
    QSet<QString> favorites;
    for (const auto& item : m_favorites) favorites.insert(item);
    QHash<QString, int> recentRank;
    for (int index = 0; index < m_recent.size(); ++index) recentRank.insert(m_recent[index], index);
    QHash<QString, int> rankedRank;
    for (int index = 0; index < m_rankedKeys.size(); ++index) rankedRank.insert(m_rankedKeys[index], index);
    for (const auto& item : m_models) {
        const auto model = item.toMap();
        const auto id = model.value("id").toString();
        const auto provider = model.value("provider").toString();
        const auto modelKey = key(id, provider);
        if (m_group == "Favorites" && !favorites.contains(modelKey)) continue;
        if (m_group == "Recent" && !recentRank.contains(modelKey)) continue;
        if (m_group != "All" && m_group != "Favorites" && m_group != "Recent" && m_group != provider) continue;
        const auto name = model.value("name").toString();
        const auto path = model.value("path").toString();
        const auto tasks = model.value("supported_tasks").toStringList().join(' ');
        const auto displayProvider = providerLabel(provider);
        if (!query.isEmpty() && !name.contains(query, Qt::CaseInsensitive) && !id.contains(query, Qt::CaseInsensitive)
            && !provider.contains(query, Qt::CaseInsensitive) && !displayProvider.contains(query, Qt::CaseInsensitive)
            && !path.contains(query, Qt::CaseInsensitive) && !tasks.contains(query, Qt::CaseInsensitive)) continue;
        const auto execution = model.value("execution").toMap();
        const auto state = execution.value("state").toString();
        const bool available = state.isEmpty() || state == "ready";
        rows.append(QVariantMap{{"id", id}, {"provider", provider}, {"name", name},
            {"detail", displayProvider + " · " + id}, {"executionLabel", available ? execution.value("kind").toString() : state},
            {"favorite", favorites.contains(modelKey)}, {"isDefault", m_default == modelKey},
            {"current", id == selectedModelId() && provider == selectedProvider()},
            {"available", available}, {"raw", model}, {"providerDisplay", displayProvider},
            {"configured", m_providerMeta.value(provider).value("configured")}});
    }
    std::stable_sort(rows.begin(), rows.end(), [this, &favorites, &recentRank, &rankedRank, &query](const QVariant& a, const QVariant& b) {
        const auto left = a.toMap(); const auto right = b.toMap();
        const auto priority = [this, &favorites, &recentRank](const QVariantMap& row) {
            const auto modelKey = key(row.value("id").toString(), row.value("provider").toString());
            const auto recentIndex = recentRank.value(modelKey, -1);
            return std::pair{m_default == modelKey ? 0 : favorites.contains(modelKey) ? 1 : recentIndex >= 0 ? 2 : 3, recentIndex < 0 ? 0 : recentIndex};
        };
        if (!query.isEmpty()) {
            const auto relevance = [&query](const QVariantMap& row) {
                const auto name = row.value("name").toString();
                if (name.startsWith(query, Qt::CaseInsensitive)) return 0;
                if (name.contains(query, Qt::CaseInsensitive)) return 1;
                if (row.value("id").toString().contains(query, Qt::CaseInsensitive)) return 2;
                return 3;
            };
            if (relevance(left) != relevance(right)) return relevance(left) < relevance(right);
        }
        if (priority(left) != priority(right)) return priority(left) < priority(right);
        const auto rankedIndex = [&rankedRank](const QVariantMap& row) {
            const auto rank = rankedRank.value(row.value("provider").toString() + ":" + row.value("id").toString(), -1);
            return rank < 0 ? std::numeric_limits<int>::max() : rank;
        };
        if (rankedIndex(left) != rankedIndex(right)) return rankedIndex(left) < rankedIndex(right);
        const auto nameOrder = QString::compare(left.value("name").toString(), right.value("name").toString(), Qt::CaseInsensitive);
        if (nameOrder != 0) return nameOrder < 0;
        const auto providerOrder = QString::compare(left.value("provider").toString(), right.value("provider").toString(), Qt::CaseInsensitive);
        if (providerOrder != 0) return providerOrder < 0;
        return QString::compare(left.value("id").toString(), right.value("id").toString(), Qt::CaseInsensitive) < 0;
    });
    m_results.replace(std::move(rows));
    emit changed();
}
void Catalog::selectModel(const QString& id, const QString& provider) {
    for (const auto& item : m_models) {
        const auto model = item.toMap();
        if (model.value("id") != id || model.value("provider") != provider) continue;
        const auto state = model.value("execution").toMap().value("state").toString();
        if (!state.isEmpty() && state != "ready") return;
        m_selected = model;
        const auto modelKey = key(id, provider);
        m_recent.removeAll(modelKey); m_recent.prepend(modelKey);
        while (m_recent.size() > 20) m_recent.removeLast();
        QSettings settings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker");
        const auto prefix = preferenceKey();
        settings.setValue(prefix + "model", id); settings.setValue(prefix + "provider", provider);
        settings.setValue(prefix + "recent", m_recent);
        settings.setValue(prefix + "serverDefault", false);
        m_serverDefault = false;
        present();
        emit selectionCommitted(id, provider);
        return;
    }
}
void Catalog::clearSelection() {
    m_selected.clear();
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker");
    settings.remove(preferenceKey() + "model"); settings.remove(preferenceKey() + "provider");
    settings.setValue(preferenceKey() + "serverDefault", true);
    m_serverDefault = true;
    present();
    emit selectionCommitted({}, {});
}
void Catalog::toggleFavorite(const QString& id, const QString& provider) {
    const auto modelKey = key(id, provider);
    if (m_favorites.contains(modelKey)) m_favorites.removeAll(modelKey); else m_favorites.append(modelKey);
    QSettings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker").setValue(preferenceKey() + "favorites", m_favorites);
    present();
}
void Catalog::setDefault(const QString& id, const QString& provider) {
    const auto modelKey = key(id, provider);
    m_default = m_default == modelKey ? QString{} : modelKey;
    QSettings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker").setValue(preferenceKey() + "default", m_default);
    present();
}
}
