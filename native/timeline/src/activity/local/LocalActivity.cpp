#include "LocalActivity.h"
#include "LocalActivityStore.h"
#include "server/ServerSource.h"
LocalActivity::LocalActivity(QObject* parent) : QObject(parent) {
    connect(&nt::activity::LocalActivityStore::instance(), &nt::activity::LocalActivityStore::changed, this, &LocalActivity::changed);
}
void LocalActivity::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    m_scopeInputs.clear();
    m_scope.clear();
    if (m_timeline) {
        m_scopeInputs = scopeInputs();
        m_scope = nt::activity::localScope(m_timeline->timeline().raw);
        connect(m_timeline, &TimelineModel::timelineChanged, this, &LocalActivity::syncScope);
    }
    emit changed();
}
QString LocalActivity::scopeInputs() const {
    if (!m_timeline) { return {}; }
    const auto& raw = m_timeline->timeline().raw;
    const auto project = raw.value("projectId").toString(raw.value("project_id").toString());
    const auto timeline = raw.value("id").toString();
    QString targetKey = QStringLiteral("file");
    if (const auto target = nt::server::serverSaveTarget()) {
        targetKey = target->server.toString() + QChar(0) + target->token + QChar(0) + target->expectedInstance;
    }
    return targetKey + QChar(0) + project + QChar(0) + timeline;
}
QString LocalActivity::resolvedScope() const {
    if (!m_timeline) { return {}; }
    const auto inputs = scopeInputs();
    if (inputs != m_scopeInputs || m_scope.isEmpty()) {
        m_scopeInputs = inputs;
        m_scope = nt::activity::localScope(m_timeline->timeline().raw);
    }
    return m_scope;
}
void LocalActivity::syncScope() {
    if (!m_timeline) { return; }
    const auto inputs = scopeInputs();
    if (inputs == m_scopeInputs) { return; }
    m_scopeInputs = inputs;
    m_scope = nt::activity::localScope(m_timeline->timeline().raw);
    emit changed();
}
QVariantList LocalActivity::rows() const {
    if (!m_timeline) { return {}; }
    return nt::activity::LocalActivityStore::instance().rows(resolvedScope());
}
QString LocalActivity::error() const {
    rows();
    return nt::activity::LocalActivityStore::instance().error();
}
bool LocalActivity::cancel(const QString& id) {
    for (const auto& item : rows()) {
        const auto row = item.toMap();
        if (row.value("id").toString() == id && row.value("cancellable").toBool()) {
            return nt::activity::LocalActivityStore::instance().cancel(id);
        }
    }
    return false;
}
