#include "model/StaticTimelineSource.h"

#include "model/TimelineTypes.h"

#include <utility>

StaticTimelineSource::~StaticTimelineSource() = default;

void StaticTimelineSource::setTimeline(nt::Timeline timeline, std::shared_ptr<void> mediaLeases) {
    timeline.revision = nt::nextTimelineRevision();
    timeline.indexClips();
    m_state = {std::make_shared<const nt::Timeline>(std::move(timeline)), m_state.generation + 1,
               std::move(mediaLeases)};
    emit sourceChanged();
}

void StaticTimelineSource::clear() {
    if (!m_state.snapshot) {
        return;
    }
    m_state = {{}, m_state.generation + 1, {}};
    emit sourceChanged();
}
