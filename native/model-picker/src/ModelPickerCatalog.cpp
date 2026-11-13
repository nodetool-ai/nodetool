#include "ModelPickerCatalog.h"
#include "CatalogRules.h"
#include "ModelLabels.h"
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
    case KindRole: return row.value("kind", QStringLiteral("model"));
    case NeedsDownloadRole: return row.value("needsDownload", false);
    case DownloadRole: return row.value("download", QVariantMap{});
    case DownloadHintRole: return row.value("downloadHint");
    case ExecutionStateRole: return row.value("executionState");
    default: return {};
    }
}
QHash<int, QByteArray> ResultModel::roleNames() const {
    return {{IdRole, "modelId"}, {ProviderRole, "provider"}, {NameRole, "name"},
            {DetailRole, "detail"}, {ExecutionRole, "executionLabel"},
            {FavoriteRole, "favorite"}, {DefaultRole, "isDefault"},
            {CurrentRole, "current"}, {AvailableRole, "available"}, {RawRole, "raw"},
            {KindRole, "kind"}, {NeedsDownloadRole, "needsDownload"}, {DownloadRole, "download"},
            {DownloadHintRole, "downloadHint"}, {ExecutionStateRole, "executionState"}};
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
    m_recommended.clear();
    m_cacheStatus.clear();
    m_failedProviders = 0;
    m_results.replace({});
    restoreSelection();
    m_loading = false;
    present();
}
void Catalog::setFilter(const QStringList& allowedProviders, const QStringList& tasks) {
    m_allowedProviders = allowedProviders;
    m_tasks = tasks;
}
QVariantMap Catalog::modelDetails(const QString& id, const QString& provider) const {
    for (const auto& entry : m_models) {
        const auto model = entry.toMap();
        if (model.value("id") == id && (provider.isEmpty() || model.value("provider") == provider)) return model;
    }
    return {};
}
void Catalog::setMutation(Mutation mutation) {
    m_mutation = std::move(mutation);
}
void Catalog::setDownloadHandler(DownloadHandler handler) {
    m_downloadHandler = std::move(handler);
}
void Catalog::setRecommendationProcedure(const QString& procedure) {
    m_recommendationProcedure = procedure;
}
void Catalog::setDownloadState(const QVariantMap& downloads, const QStringList& requestedRows) {
    if (downloads == m_downloads && requestedRows == m_requestedRows) {
        return;
    }
    m_downloads = downloads;
    m_requestedRows = requestedRows;
    present();
}
// A provider that settings.providerCatalog reports unconfigured, and that is
// neither local nor keyless, is missing its key, as useProviderKeyMissing in
// web/src/hooks. It may be absent from models.providers, which lists only
// usable providers, so a missing access kind still counts as remote.
bool Catalog::providerKeyMissing(const QString& provider) const {
    if (provider.isEmpty() || isLocalProvider(provider)) {
        return false;
    }
    const auto meta = m_providerMeta.value(provider);
    const auto access = meta.value("access").toString();
    if (access == "in_process" || access == "local_service") {
        return false;
    }
    return meta.contains("configured") && !meta.value("configured").toBool() && !providerSecret(provider).isEmpty();
}
QString Catalog::providerSecret(const QString& provider) const {
    const auto keys = m_providerMeta.value(provider).value("keys").toStringList();
    return keys.isEmpty() ? QString{} : keys.first();
}
QString Catalog::missingKeyWarning(const QString& provider) const {
    if (!providerKeyMissing(provider)) {
        return {};
    }
    return tr("%1 needs %2. Add it in Settings, or pick another model.").arg(providerLabel(provider), providerSecret(provider));
}
bool Catalog::providerHasModels(const QString& provider) const {
    for (const auto& entry : m_models) {
        if (entry.toMap().value("provider").toString() == provider) {
            return true;
        }
    }
    return false;
}
QVariantMap Catalog::fieldLabel(const QString& modelType, const QVariant& value, const QString& provider) const {
    const auto object = value.toMap();
    auto id = value.typeId() == QMetaType::QString ? value.toString() : object.value("id").toString();
    if (detail::isRepositoryMode(detail::catalogModeForType(modelType)) && !object.value("repo_id").toString().isEmpty()) {
        const auto path = object.value("path").toString();
        id = object.value("repo_id").toString() + (path.isEmpty() ? QString{} : ":" + path);
    }
    const auto details = m_loaded && !id.isEmpty() ? modelDetails(id, provider) : QVariantMap{};
    const auto label = nt::modelpicker::fieldLabel(modelType, value, details, provider);
    return {{"label", label.label}, {"secondary", label.secondary}, {"subLabel", label.subLabel}, {"active", label.active}};
}
QString Catalog::loadingText() const {
    if (!m_loading) {
        return {};
    }
    if (m_totalProviders <= 0) {
        return tr("Loading models");
    }
    return m_totalProviders == 1 ? tr("Loading models from %1 of %2 provider").arg(m_loadedProviders).arg(m_totalProviders)
                                 : tr("Loading models from %1 of %2 providers").arg(m_loadedProviders).arg(m_totalProviders);
}
// promptForApiKey is set for the language and image menus. The row shows while
// no API model is ready, as in ModelMenuDialogBase.tsx.
bool Catalog::showAddKeyRow() const {
    static const QSet<QString> prompting{"chat", "language_model", "image_model", "image"};
    if (!prompting.contains(m_mode) || m_loading || !m_loaded || !m_error.isEmpty()) {
        return false;
    }
    for (const auto& entry : m_models) {
        const auto execution = entry.toMap().value("execution").toMap();
        if (execution.value("state").toString() == "ready" && execution.value("kind").toString() == "api") {
            return false;
        }
    }
    return true;
}
void Catalog::prepareOpen() {
    m_search.clear();
    if (m_group == "Favorites" || m_group == "Recent") {
        m_group = QStringLiteral("All");
    }
    m_resetEmptyGroup = true;
    present();
}
void Catalog::requestDownload(const QString& id, const QString& provider) {
    if (!m_downloadHandler.start) {
        return;
    }
    for (const auto& entry : m_models) {
        const auto model = entry.toMap();
        if (model.value("id") != id || model.value("provider") != provider) {
            continue;
        }
        const auto targets = detail::catalogDownloadTargets(model);
        if (!targets.isEmpty()) {
            m_downloadHandler.start(key(id, provider), targets, model.value("type").toString());
        }
        return;
    }
    for (const auto& entry : m_recommended) {
        const auto model = entry.toMap();
        const auto repo = model.value("repo_id").toString().isEmpty() ? model.value("id").toString() : model.value("repo_id").toString();
        const auto path = model.value("path").toString();
        const auto downloadId = path.isEmpty() ? repo : repo + "/" + path;
        if (model.value("id").toString() != id || model.value("provider").toString() != provider) {
            continue;
        }
        const QVariantMap target{{"repo_id", repo}, {"path", path.isEmpty() ? QVariant{} : QVariant(path)},
                                 {"allow_patterns", path.isEmpty() ? model.value("allow_patterns") : QVariant{}},
                                 {"ignore_patterns", path.isEmpty() ? model.value("ignore_patterns") : QVariant{}},
                                 {"model_type", model.value("type")}, {"id", downloadId}};
        m_downloadHandler.start("recommended:" + downloadId, {target}, model.value("type").toString());
        return;
    }
}
void Catalog::cancelDownload(const QString& id) {
    if (m_downloadHandler.cancel) {
        m_downloadHandler.cancel(id);
    }
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
    return display.isEmpty() ? providerDisplayName(provider) : display;
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
        // A local provider with no models offers nothing to pick, such as an
        // Ollama that is not running. The list keeps it while models load.
        const bool listed = m_loading || !m_loaded || providerHasModels(id);
        if ((access == "in_process" || access == "local_service") && listed) result.append(id);
    }
    return result;
}
QString Catalog::key(const QString& id, const QString& provider) { return provider + QChar(0x1f) + id; }
// Favorites and recents belong to the account and span model types, as the
// one ModelPreferencesStore in the web does. Defaults and the picker's own
// selection stay per model type.
QString Catalog::accountKey() const {
    const auto digest = QCryptographicHash::hash(m_identity.toUtf8(), QCryptographicHash::Sha256).toHex();
    return "modelPicker/" + QString::fromLatin1(digest) + "/";
}
QString Catalog::preferenceKey() const {
    return accountKey() + m_mode + "/";
}
// Several catalogs of one account share these lists, so each read and each
// change starts from the stored lists rather than this catalog's copy.
void Catalog::loadPreferences() {
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker");
    const auto shared = accountKey();
    const auto legacy = preferenceKey();
    m_favorites = settings.value(shared + "favorites", settings.value(legacy + "favorites")).toStringList();
    m_recent = settings.value(shared + "recent", settings.value(legacy + "recent")).toStringList();
    m_default = settings.value(accountKey() + (m_defaultContext.isEmpty() ? m_mode : m_defaultContext) + "/default").toString();
    m_serverDefault = settings.value(legacy + "serverDefault", false).toBool();
}
void Catalog::persistList(const QString& name, const QStringList& values) const {
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker");
    settings.setValue(accountKey() + name, values);
}
void Catalog::restoreSelection() {
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker");
    const auto prefix = preferenceKey();
    loadPreferences();
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
    m_totalProviders = 0;
    m_loadedProviders = 0;
    m_failedProviders = 0;
    loadPreferences();
    emit changed();
    loadRecommendations(revision);
    const QPointer<Catalog> guard(this);
    if (detail::isRepositoryMode(m_mode)) {
        // One list for the field: Hugging Face repositories of the field's type,
        // Transformers.js repositories of its tjs.* task, or the Ollama tags.
        QJsonObject input;
        QString provider = QStringLiteral("ollama");
        if (m_mode == "huggingface_model") {
            input = {{"model_type", m_repositoryType}, {"scope", m_scope}};
            provider = QStringLiteral("huggingface");
        } else if (m_mode == "transformers_js_model") {
            input = {{"model_type", m_repositoryType}};
            provider = QStringLiteral("transformers_js");
        }
        m_query(detail::catalogProcedure(m_mode), input, [guard, revision, provider](QJsonValue value, QString error) {
            if (!guard || revision != guard->m_revision) return;
            if (error.isEmpty()) {
                guard->m_models = detail::catalogModels(value.toArray(), provider, guard->m_mode);
                guard->m_providers = {provider};
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
            const bool allowed = guard->m_allowedProviders.isEmpty() || guard->m_allowedProviders.contains(name, Qt::CaseInsensitive);
            if (!name.isEmpty() && allowed && detail::catalogProviderMatches(guard->m_mode, provider.value("capabilities").toArray(), guard->m_tasks)) {
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
                meta.insert("keys", configured.value("keys").toVariant());
                if (!configured.value("name").toString().isEmpty() && meta.value("display_name").toString().isEmpty()) meta.insert("display_name", configured.value("name").toString());
                guard->m_providerMeta.insert(id, meta);
            }
            guard->present();
        });
        names.removeDuplicates(); names.sort(Qt::CaseInsensitive);
        guard->m_pending = names.size() + 1;
        guard->m_totalProviders = names.size();
        if (names.isEmpty()) { guard->m_models.clear(); guard->m_providers.clear(); guard->m_loading = false; guard->complete(revision); return; }
        // native-rules #1: shared by the provider callbacks, no justification
        auto accumulated = std::make_shared<QVariantList>();
        // native-rules #1: shared by the provider callbacks, no justification
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
                ++guard->m_loadedProviders;
                if (failure.isEmpty()) {
                    QJsonArray matching;
                    for (const auto& model : result.toArray()) {
                        if (detail::catalogModelMatchesTasks(model.toObject().value("supported_tasks").toArray(), guard->m_tasks, guard->m_mode)) matching.append(model);
                    }
                    accumulated->append(detail::catalogModels(matching, name, guard->m_mode));
                } else {
                    errors->append(name + ": " + failure);
                    ++guard->m_failedProviders;
                }
                if (guard->m_pending > 1) {
                    emit guard->changed();
                }
                finish();
            });
        }
    });
}
// Recommended downloads for the node, then the server's cache check of each,
// as useRecommendedModelsForNode and HfCacheStatusStore in the web.
void Catalog::loadRecommendations(quint64 revision) {
    m_recommended.clear();
    m_cacheStatus.clear();
    if (m_recommendationProcedure.isEmpty()) {
        return;
    }
    const QPointer<Catalog> guard(this);
    m_query(m_recommendationProcedure, {}, [guard, revision](QJsonValue value, QString error) {
        if (!guard || revision != guard->m_revision || !error.isEmpty()) {
            return;
        }
        QJsonArray requests;
        for (const auto& entry : value.toArray()) {
            const auto model = entry.toObject().toVariantMap();
            if (model.value("id").toString().isEmpty() || !detail::catalogIsDownloadable(model)) {
                continue;
            }
            guard->m_recommended.append(model);
            const auto repo = model.value("repo_id").toString().isEmpty() ? model.value("id").toString() : model.value("repo_id").toString();
            const auto path = model.value("path").toString();
            const bool hf = model.value("type").toString() != "llama_model";
            if (hf && model.value("downloaded").toBool() == false) {
                QJsonObject request{{"key", path.isEmpty() ? repo : repo + "/" + path}, {"repo_id", repo},
                                    {"model_type", QJsonValue::fromVariant(model.value("type"))},
                                    {"path", path.isEmpty() ? QJsonValue() : QJsonValue(path)}};
                if (path.isEmpty()) {
                    request.insert("allow_patterns", QJsonValue::fromVariant(model.value("allow_patterns")));
                    request.insert("ignore_patterns", QJsonValue::fromVariant(model.value("ignore_patterns")));
                }
                requests.append(request);
            }
        }
        guard->present();
        if (requests.isEmpty() || !guard->m_mutation) {
            return;
        }
        guard->m_mutation("models.huggingfaceCacheStatus", requests, [guard, revision, requests](QJsonValue statuses, QString) {
            if (!guard || revision != guard->m_revision) {
                return;
            }
            // An entry the check does not answer, or a failed check, reads as
            // not downloaded rather than checking forever.
            for (const auto& request : requests) {
                guard->m_cacheStatus.insert(request.toObject().value("key").toString(), false);
            }
            for (const auto& entry : statuses.toArray()) {
                const auto status = entry.toObject();
                guard->m_cacheStatus.insert(status.value("key").toString(), status.value("downloaded").toBool());
            }
            guard->present();
        });
    });
}
void Catalog::complete(quint64 revision) {
    if (revision != m_revision) return;
    m_loaded = true;
    if (m_resetEmptyGroup) {
        m_resetEmptyGroup = false;
        const bool view = m_group == "All" || m_group == "Favorites" || m_group == "Recent";
        if (!view && !providerHasModels(m_group)) {
            m_group = QStringLiteral("All");
        }
    }
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
        auto executionLabel = execution.value("label").toString();
        if (executionLabel.isEmpty()) {
            executionLabel = available ? execution.value("kind").toString() : state;
        }
        // ModelList.tsx: a file shows the file, then the model it belongs to.
        // Any other model shows its name, then its provider.
        const auto shownName = path.isEmpty() ? name : path;
        const auto detail = path.isEmpty() ? displayProvider : name;
        QVariantMap row{{"id", id}, {"provider", provider}, {"name", shownName},
            {"detail", detail}, {"executionLabel", executionLabel}, {"executionState", state},
            {"favorite", favorites.contains(modelKey)}, {"isDefault", m_default == modelKey},
            {"current", id == selectedModelId() && provider == selectedProvider()},
            {"available", available}, {"raw", model}, {"providerDisplay", displayProvider},
            {"configured", m_providerMeta.value(provider).value("configured")}};
        const auto targets = detail::catalogDownloadTargets(model);
        if (!targets.isEmpty()) {
            QStringList ids;
            for (const auto& target : targets) {
                ids.append(target.toMap().value("id").toString());
            }
            const auto main = targets.first().toMap().value("repo_id").toString();
            const auto what = targets.size() == 1 ? main
                : targets.size() == 2 ? tr("%1 and 1 more repository").arg(main)
                                      : tr("%1 and %2 more repositories").arg(main).arg(targets.size() - 1);
            row.insert("needsDownload", true);
            row.insert("downloadHint", tr("Download %1 to %2").arg(what, tr("this computer")));
            if (m_requestedRows.contains(modelKey)) {
                row.insert("download", downloadPresentation(ids, true));
            }
        }
        rows.append(row);
    }
    std::stable_sort(rows.begin(), rows.end(), [this, &favorites, &recentRank, &rankedRank, &query](const QVariant& a, const QVariant& b) {
        const auto left = a.toMap(); const auto right = b.toMap();
        // ModelMenuDialogBase.tsx lists models that need a download, then
        // unavailable ones, after every ready model.
        const auto readiness = [](const QVariantMap& row) {
            const auto state = row.value("executionState").toString();
            return state == "unavailable" ? 2 : state == "download_required" ? 1 : 0;
        };
        if (readiness(left) != readiness(right)) return readiness(left) < readiness(right);
        // The Recent view keeps the order of use. Favorites read by name.
        if (m_group == "Recent") {
            const auto leftRank = recentRank.value(key(left.value("id").toString(), left.value("provider").toString()));
            const auto rightRank = recentRank.value(key(right.value("id").toString(), right.value("provider").toString()));
            return leftRank < rightRank;
        }
        if (m_group == "Favorites") {
            return QString::compare(left.value("name").toString(), right.value("name").toString(), Qt::CaseInsensitive) < 0;
        }
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
    appendRecommendedRows(rows, query);
    m_results.replace(std::move(rows));
    emit changed();
}
// The minimal DownloadProgress of the web: a status or percentage label, the
// byte counts while running, and a fraction for the bar. A row follows a
// running download first, then a failed one, then its main repository.
QVariantMap Catalog::downloadPresentation(const QStringList& ids, bool requireStatus) const {
    static const QSet<QString> active{"running", "progress", "start", "pending"};
    QString chosen;
    for (const auto& id : ids) {
        if (active.contains(m_downloads.value(id).toMap().value("status").toString())) {
            chosen = id;
            break;
        }
    }
    for (const auto& id : ids) {
        if (chosen.isEmpty() && m_downloads.value(id).toMap().value("status").toString() == "error") {
            chosen = id;
        }
    }
    if (chosen.isEmpty() && !ids.isEmpty() && m_downloads.contains(ids.first())) {
        chosen = ids.first();
    }
    if (chosen.isEmpty() || (requireStatus && !m_downloads.contains(chosen))) {
        return {};
    }
    const auto download = m_downloads.value(chosen).toMap();
    const auto status = download.value("status").toString();
    const auto total = download.value("total_bytes").toDouble();
    const auto done = download.value("downloaded_bytes").toDouble();
    const auto fraction = total > 0 ? std::clamp(done / total, 0.0, 1.0) : 0.0;
    QString label;
    if (status == "completed") {
        label = tr("Done");
    } else if (status == "error") {
        label = tr("Error");
    } else if (status == "cancelled") {
        label = tr("Cancelled");
    } else if (total > 0) {
        label = QString::number(std::round(fraction * 100)) + "%";
    } else {
        label = QStringLiteral("…");
    }
    const auto compact = [](double bytes) {
        const auto megabytes = bytes / 1024 / 1024;
        return megabytes >= 1024 ? QString::number(megabytes / 1024, 'f', 1) + " GB" : QString::number(std::round(megabytes)) + " MB";
    };
    const bool running = status == "running" || status == "progress" || status == "start";
    QString size;
    if (total > 0 && running) {
        const auto doneText = compact(done);
        const auto totalText = compact(total);
        const bool sameUnit = doneText.section(' ', 1) == totalText.section(' ', 1);
        size = (sameUnit ? doneText.section(' ', 0, 0) : doneText) + " / " + totalText;
    }
    return {{"id", chosen}, {"status", status}, {"label", label}, {"size", size},
            {"fraction", status == "completed" ? 1.0 : fraction}, {"canCancel", active.contains(status)},
            {"message", download.value("message")}};
}
// The "Available to download" section of ModelMenuDialogBase.tsx: recommended
// downloads that are not listed yet, outside the Favorites and Recent views.
void Catalog::appendRecommendedRows(QVariantList& rows, const QString& query) const {
    if (m_recommended.isEmpty() || m_group == "Favorites" || m_group == "Recent") {
        return;
    }
    QSet<QString> listed;
    for (const auto& entry : m_models) {
        listed.insert(entry.toMap().value("id").toString().toLower());
    }
    QVariantList section;
    for (const auto& entry : m_recommended) {
        const auto model = entry.toMap();
        const auto id = model.value("id").toString();
        const auto repo = model.value("repo_id").toString().isEmpty() ? id : model.value("repo_id").toString();
        const auto path = model.value("path").toString();
        if (m_group != "All" && !detail::catalogDownloadMatchesProvider(model, m_group)) {
            continue;
        }
        if (listed.contains(repo.toLower()) || listed.contains(id.toLower())) {
            continue;
        }
        const auto name = model.value("name").toString();
        bool tagMatch = false;
        for (const auto& tag : model.value("tags").toStringList()) {
            tagMatch = tagMatch || tag.contains(query, Qt::CaseInsensitive);
        }
        if (!query.isEmpty() && !name.contains(query, Qt::CaseInsensitive) && !id.contains(query, Qt::CaseInsensitive)
            && !repo.contains(query, Qt::CaseInsensitive) && !tagMatch) {
            continue;
        }
        // RecommendedDownloadRow.tsx: a curated name, else the file or repository.
        const bool ownName = !name.isEmpty() && name != repo && name != id;
        const auto title = ownName ? name : !path.isEmpty() ? path : repo.mid(repo.lastIndexOf('/') + 1);
        const auto cacheKey = path.isEmpty() ? repo : repo + "/" + path;
        const bool downloaded = model.value("downloaded").toBool() || model.value("type").toString() == "llama_model"
            || m_cacheStatus.value(cacheKey, false);
        const bool checking = !downloaded && m_mutation && !m_cacheStatus.contains(cacheKey);
        const auto size = model.value("size_on_disk").toDouble();
        QString detail = repo;
        if (size > 0) {
            // formatBytes in web/src/utils/modelFormatting.tsx: two decimals, trailing zeros dropped.
            static const QStringList units{"Bytes", "KB", "MB", "GB", "TB"};
            const auto index = std::clamp(int(std::floor(std::log(size) / std::log(1024.0))), 0, int(units.size()) - 1);
            auto amount = QString::number(size / std::pow(1024.0, index), 'f', 2);
            if (amount.contains('.')) {
                while (amount.endsWith('0')) {
                    amount.chop(1);
                }
                if (amount.endsWith('.')) {
                    amount.chop(1);
                }
            }
            detail += " · " + amount + " " + units[index];
        }
        section.append(QVariantMap{{"kind", "recommended"}, {"id", id}, {"provider", model.value("provider").toString()},
            {"name", title}, {"detail", detail}, {"available", downloaded}, {"raw", model},
            {"executionLabel", checking ? tr("Checking…") : QString{}}, {"needsDownload", !downloaded && !checking},
            {"downloadHint", tr("Download %1 to %2").arg(repo, tr("this computer"))},
            {"download", downloadPresentation({cacheKey}, true)}, {"favorite", false}, {"isDefault", false}});
    }
    if (section.isEmpty()) {
        return;
    }
    rows.append(QVariantMap{{"kind", "header"}, {"id", QString{}}, {"provider", QString{}},
        {"name", tr("Available to download")}, {"detail", tr("To %1").arg(tr("this computer"))}, {"available", false}});
    rows.append(section);
}
void Catalog::selectModel(const QString& id, const QString& provider) {
    QVariantMap chosen;
    for (const auto& item : m_models) {
        const auto model = item.toMap();
        if (model.value("id") != id || model.value("provider") != provider) continue;
        const auto state = model.value("execution").toMap().value("state").toString();
        if (!state.isEmpty() && state != "ready") return;
        chosen = model;
        break;
    }
    // A downloaded recommended model is chosen from its section in place, as
    // handleSelectRecommended in ModelMenuDialogBase.tsx. It needs a provider.
    for (const auto& item : m_recommended) {
        const auto model = item.toMap();
        if (!chosen.isEmpty() || provider.isEmpty() || model.value("id") != id || model.value("provider") != provider) {
            continue;
        }
        const auto repo = model.value("repo_id").toString().isEmpty() ? id : model.value("repo_id").toString();
        const auto path = model.value("path").toString();
        const bool downloaded = model.value("downloaded").toBool() || model.value("type").toString() == "llama_model"
            || m_cacheStatus.value(path.isEmpty() ? repo : repo + "/" + path, false);
        if (!downloaded) {
            return;
        }
        chosen = model;
    }
    if (chosen.isEmpty()) {
        return;
    }
    m_selected = chosen;
    const auto modelKey = key(id, provider);
    // MAX_RECENTS in web/src/stores/ModelPreferencesStore.ts.
    constexpr qsizetype maxRecents = 8;
    loadPreferences();
    m_recent.removeAll(modelKey);
    m_recent.prepend(modelKey);
    while (m_recent.size() > maxRecents) {
        m_recent.removeLast();
    }
    persistList(QStringLiteral("recent"), m_recent);
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker");
    const auto prefix = preferenceKey();
    settings.setValue(prefix + "model", id);
    settings.setValue(prefix + "provider", provider);
    settings.setValue(prefix + "serverDefault", false);
    m_serverDefault = false;
    present();
    emit selectionCommitted(id, provider);
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
    loadPreferences();
    if (m_favorites.contains(modelKey)) {
        m_favorites.removeAll(modelKey);
    } else {
        m_favorites.append(modelKey);
    }
    persistList(QStringLiteral("favorites"), m_favorites);
    present();
}
void Catalog::setDefault(const QString& id, const QString& provider) {
    const auto modelKey = key(id, provider);
    m_default = m_default == modelKey ? QString{} : modelKey;
    QSettings settings(QSettings::IniFormat, QSettings::UserScope, "NodeTool", "ModelPicker");
    const auto prefix = accountKey() + (m_defaultContext.isEmpty() ? m_mode : m_defaultContext) + "/";
    settings.setValue(prefix + "default", m_default);
    settings.remove(prefix + "defaultTasks");
    present();
}
}
