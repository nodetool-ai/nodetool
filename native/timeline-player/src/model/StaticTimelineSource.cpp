#include "model/StaticTimelineSource.h"

#include "model/TimelineTypes.h"

#include <utility>

StaticTimelineSource::~StaticTimelineSource() = default;

void StaticTimelineSource::setTimeline(nt::Timeline timeline) {
    timeline.revision = nt::nextTimelineRevision();
    timeline.indexClips();
    m_snapshot = std::make_shared<const nt::Timeline>(std::move(timeline));
    ++m_generation;
    emit sourceChanged();
}

void StaticTimelineSource::clear() {
    if (!m_snapshot) {
        return;
    }
    m_snapshot.reset();
    ++m_generation;
    emit sourceChanged();
}
