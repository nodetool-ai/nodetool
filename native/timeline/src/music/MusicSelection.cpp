#include "music/MusicSelection.h"

#include "music/MusicTime.h"

#include <cmath>

MusicSelection::MusicSelection(QObject* parent) : QObject(parent) {}

double MusicSelection::startMs() const { return nt::music::frameToMs(m_start); }
double MusicSelection::endMs() const { return nt::music::frameToMs(m_end); }

void MusicSelection::set(const QString& trackId, std::int64_t startFrame, std::int64_t endFrame) {
    if (trackId.isEmpty() || endFrame <= startFrame || startFrame < 0) {
        clear();
        return;
    }
    if (trackId == m_trackId && startFrame == m_start && endFrame == m_end) {
        return;
    }
    m_trackId = trackId;
    m_start = startFrame;
    m_end = endFrame;
    emit changed();
}

void MusicSelection::select(const QString& trackId, double startFrame, double endFrame) {
    if (!std::isfinite(startFrame) || !std::isfinite(endFrame)) {
        clear();
        return;
    }
    set(trackId, std::llround(startFrame), std::llround(endFrame));
}

void MusicSelection::clear() {
    if (m_trackId.isEmpty()) {
        return;
    }
    m_trackId.clear();
    m_start = 0;
    m_end = 0;
    emit changed();
}
