#include "LocalActivity.h"
#include "LocalActivityStore.h"
LocalActivity::LocalActivity(QObject* parent) : QObject(parent) {
    connect(&nt::activity::LocalActivityStore::instance(), &nt::activity::LocalActivityStore::changed, this, &LocalActivity::changed);
}
void LocalActivity::setTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    if (m_timeline) { disconnect(m_timeline, nullptr, this, nullptr); }
    m_timeline = timeline;
    if (m_timeline) { connect(m_timeline, &TimelineModel::timelineChanged, this, &LocalActivity::changed); }
    emit changed();
}
QVariantList LocalActivity::rows() const {
    if (!m_timeline) { return {}; }
    return nt::activity::LocalActivityStore::instance().rows(nt::activity::localScope(m_timeline->timeline().raw));
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
