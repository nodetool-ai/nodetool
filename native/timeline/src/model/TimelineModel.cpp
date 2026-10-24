#include "model/TimelineModel.h"

TimelineModel::TimelineModel(QObject* parent)
    : QObject(parent), m_timeline(std::make_shared<const nt::Timeline>()), m_tracks(new TrackListModel(this)) {}

void TimelineModel::setTimeline(nt::Timeline timeline) {
    m_timeline = std::make_shared<const nt::Timeline>(std::move(timeline));
    m_tracks->reset(m_timeline.get());
    emit timelineChanged();
}

void TimelineModel::close() {
    nt::Timeline empty;
    empty.name = m_timeline->name;
    empty.fps = m_timeline->fps;
    empty.width = m_timeline->width;
    empty.height = m_timeline->height;
    setTimeline(std::move(empty));
}
