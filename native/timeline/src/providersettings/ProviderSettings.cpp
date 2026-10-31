#include "ProviderSettings.h"
#include <QJsonArray>
#include <QPointer>
#include <QThread>

namespace {
bool sameTarget(const std::optional<nt::server::SaveTarget>& a, const std::optional<nt::server::SaveTarget>& b) {
    return a.has_value() == b.has_value() && (!a || (a->server == b->server && a->token == b->token && a->expectedInstance == b->expectedInstance));
}
}
ProviderSettings::ProviderSettings(QObject* parent) : QObject(parent) {
    m_contextTimer.setInterval(250);
    connect(&m_contextTimer, &QTimer::timeout, this, [this] { syncContext(); });
    m_contextTimer.start();
}
std::optional<nt::server::SaveTarget> ProviderSettings::currentTarget() const {
    if (m_testTarget) { return m_testTarget; }
    if (const auto target = nt::server::serverSaveTarget()) { return target; }
    const QUrl url(qEnvironmentVariable("NODETOOL_SERVER_URL"));
    if (!url.isValid() || url.host().isEmpty() || (url.scheme() != "http" && url.scheme() != "https")) { return std::nullopt; }
    return nt::server::SaveTarget{url, qEnvironmentVariable("NODETOOL_API_TOKEN"), {}, {}, qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE")};
}
void ProviderSettings::setTargetForTest(const nt::server::SaveTarget& target) { m_testTarget = target; syncContext(); }
bool ProviderSettings::syncContext() {
    const auto target = currentTarget();
    if (sameTarget(target, m_target)) { return false; }
    ++m_epoch; m_target = target; m_busy = false;
    m_settings = {}; m_secrets = {}; m_providers.clear(); m_groupKeys.clear(); m_providerIds.clear(); m_groups.clear(); m_group.clear();
    discard(); m_message = "Server changed. Reload providers to continue.";
    emit fieldsChanged(); emit changed();
    return true;
}
QVariantList ProviderSettings::fields() const {
    QVariantList rows;
    for (const auto& item : m_settings) {
        const auto row = item.toObject();
        if (!m_groupKeys.value(m_group).contains(row.value("env_var").toString())) { continue; }
        const auto key = row.value("env_var").toString();
        const bool secret = row.value("is_secret").toBool();
        const auto state = m_secrets.value(key).toObject();
        rows.append(QVariantMap{{"key", key}, {"group", m_group}, {"description", row.value("description").toString()},
            {"secret", secret}, {"configured", secret ? state.value("is_configured").toBool() : !row.value("value").toString().isEmpty()},
            {"removable", secret && !state.value("id").toString().isEmpty()}, {"unreadable", state.value("is_unreadable").toBool()},
            {"value", secret ? QString{} : row.value("value").toVariant().toString()}, {"options", row.value("enum").toArray().toVariantList()}});
    }
    return rows;
}
QJsonObject ProviderSettings::definition(const QString& key) const {
    for (const auto& item : m_settings) { const auto row = item.toObject(); if (row.value("env_var") == key && m_groupKeys.value(m_group).contains(key)) { return row; } }
    return {};
}
void ProviderSettings::request(bool write, const QString& procedure, const QJsonObject& input, Completion done) {
    syncContext();
    if (m_busy) { return; }
    if (!m_target) { m_message = "Open a server timeline or configure NODETOOL_SERVER_URL to edit providers."; emit changed(); return; }
    m_busy = true; emit changed();
    const auto target = *m_target;
    const auto epoch = m_epoch;
    const auto call = m_call;
    const QPointer<ProviderSettings> guard(this);
    auto* worker = QThread::create([guard, target, epoch, call, write, procedure, input, done = std::move(done)] {
        nt::server::QueryResult result;
        if (call) { result = call(write, procedure, input); }
        else {
            nt::server::ServerClient client(target.server, target.token);
            client.setExpectedInstance(target.expectedInstance);
            result = write ? client.mutate(procedure, input) : client.query(procedure, input);
        }
        if (!guard) { return; }
        QMetaObject::invokeMethod(guard, [guard, epoch, result, done, procedure] {
            if (!guard) { return; }
            guard->syncContext();
            if (guard->m_epoch != epoch) { return; }
            guard->m_busy = false;
            if (!result.ok()) {
                // Server errors may echo a submitted credential. Never surface raw bodies/messages.
                guard->m_testMessage.clear();
                if (result.error.code == "WRONG_SERVER") { guard->m_message = "The server identity check failed. Reconnect to the expected server before saving."; }
                else if (result.error.code == "UNAUTHORIZED" || result.error.code == "FORBIDDEN") { guard->m_message = "This account cannot update provider settings. Check your sign-in and permissions, then retry."; }
                else if (result.error.code == "NOT_FOUND" && procedure == "settings.providerCatalog") { guard->m_message = "This server does not support provider setup. Update NodeTool on the server and retry."; }
                else { guard->m_message = "Provider request failed. Check the server connection and permissions, then retry."; }
            } else { done(result); }
            emit guard->changed();
        }, Qt::QueuedConnection);
    });
    connect(worker, &QThread::finished, worker, &QObject::deleteLater);
    worker->start();
}
void ProviderSettings::reload() {
    syncContext();
    if (dirty() || m_busy) { return; }
    m_message.clear(); m_testMessage.clear();
    request(false, "settings.list", {}, [this](const auto& result) {
        const auto data = result.data.toObject();
        if (!data.value("settings").isArray()) { m_message = "The server returned an invalid settings catalog. Retry loading."; return; }
        m_settings = data.value("settings").toArray();
        request(false, "settings.providerCatalog", {}, [this](const auto& catalog) {
            if (!catalog.data.isArray()) { m_message = "The server returned an invalid provider catalog. Retry loading."; return; }
            m_groups.clear(); m_groupKeys.clear(); m_providerIds.clear(); m_providers.clear();
            for (const auto& item : catalog.data.toArray()) {
                const auto provider = item.toObject();
                const auto name = provider.value("name").toString(provider.value("provider").toString());
                QStringList keys;
                for (const auto& key : provider.value("keys").toArray()) { keys.append(key.toString()); }
                if (!keys.isEmpty()) {
                    const auto group = m_groupKeys.contains(name) ? name + " (" + provider.value("provider").toString() + ")" : name;
                    m_groups.append(group); m_groupKeys.insert(group, keys);
                    m_providerIds.insert(group, provider.value("provider").toString());
                }
                m_providers.append(QVariantMap{{"name", name}, {"configured", provider.value("configured").toBool()}});
            }
            m_groups.sort(Qt::CaseInsensitive);
            if (!m_groups.contains(m_group)) { m_group = m_groups.value(0); }
            request(false, "settings.secrets.list", {}, [this](const auto& secrets) {
                if (!secrets.data.toObject().value("secrets").isArray()) { m_message = "The server returned invalid credential metadata. Retry loading."; return; }
                m_secrets = {};
                for (const auto& item : secrets.data.toObject().value("secrets").toArray()) {
                    auto row = item.toObject(); row.remove("value"); m_secrets.insert(row.value("key").toString(), row);
                }
                emit fieldsChanged();
            });
        });
    });
}
void ProviderSettings::draft(const QString& key, const QString& value) {
    if (m_busy || syncContext()) { return; }
    const auto row = definition(key); if (row.isEmpty()) { return; }
    if ((row.value("is_secret").toBool() && value.isEmpty()) || (!row.value("is_secret").toBool() && row.value("value").toVariant().toString() == value)) { m_drafts.remove(key); }
    else { m_drafts.insert(key, value); }
    m_message.clear(); m_testMessage.clear(); emit changed();
}
void ProviderSettings::selectGroup(const QString& group) {
    if (m_busy || dirty() || !m_groups.contains(group)) { return; }
    ++m_epoch; m_group = group; m_message.clear(); m_testMessage.clear(); emit draftsCleared(); emit fieldsChanged(); emit changed();
}
void ProviderSettings::discard() { m_drafts.clear(); m_testMessage.clear(); emit draftsCleared(); emit changed(); }
void ProviderSettings::save() {
    if (syncContext() || m_busy || !dirty()) { return; }
    QJsonObject settings, secrets;
    for (auto it = m_drafts.cbegin(); it != m_drafts.cend(); ++it) {
        const auto row = definition(it.key()); if (row.isEmpty()) { continue; }
        const auto options = row.value("enum").toArray();
        if (!options.isEmpty() && !options.contains(it.value())) { m_message = "Choose one of the allowed values."; emit changed(); return; }
        if (row.value("is_secret").toBool()) {
            if (it.value() == "****") { m_message = "The server reserves four asterisks as its unchanged-key marker. Enter a replacement credential."; emit changed(); return; }
            secrets.insert(it.key(), it.value());
        }
        else { settings.insert(it.key(), it.value()); }
    }
    request(true, "settings.update", {{"settings", settings}, {"secrets", secrets}}, [this](const auto&) {
        discard(); reload(); m_message = "Provider settings saved.";
    });
}
void ProviderSettings::remove(const QString& key) {
    if (syncContext() || m_busy || dirty() || definition(key).isEmpty() || m_secrets.value(key).toObject().value("id").toString().isEmpty()) { return; }
    request(true, "settings.secrets.delete", {{"key", key}}, [this](const auto&) { discard(); reload(); m_message = "Stored credential removed. A server environment credential may still apply."; });
}
void ProviderSettings::test(const QString& key) {
    if (syncContext() || m_busy || !definition(key).value("is_secret").toBool()) { return; }
    QJsonObject input{{"key", key}};
    if (m_drafts.contains(key)) { input.insert("value", m_drafts.value(key)); }
    m_message.clear(); m_testMessage = "Testing credential…";
    request(true, "settings.secrets.validate", input, [this](const auto& result) {
        const auto status = result.data.toObject().value("status").toString();
        // Fixed text prevents upstream errors reflecting credentials into the UI.
        if (status == "valid") { m_testMessage = "Credential accepted."; }
        else if (status == "invalid") { m_testMessage = "Credential was rejected. Check the key and try again."; }
        else { m_testMessage = "This credential cannot be verified by the server."; }
    });
}

void ProviderSettings::checkModels() {
    if (syncContext() || m_busy || dirty() || !m_providerIds.contains(m_group)) { return; }
    m_message.clear(); m_testMessage = "Checking saved model availability…";
    request(false, "models.llmByProvider", {{"provider", m_providerIds.value(m_group)}}, [this](const auto& result) {
        if (!result.data.isArray()) { m_testMessage = "The server returned an invalid model list. Try again."; return; }
        const auto count = result.data.toArray().size();
        m_testMessage = count > 0 ? QString("The server reports %1 language %2 for the saved settings. A model catalog does not confirm connectivity.").arg(count).arg(count == 1 ? "model" : "models")
            : "The server reported no language models. Check the saved endpoint and credentials. This provider may not offer language models.";
    });
}
