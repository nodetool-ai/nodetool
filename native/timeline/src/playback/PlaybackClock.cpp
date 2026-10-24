#include "playback/PlaybackClock.h"

#include <algorithm>
#include <cmath>

PlaybackClock::PlaybackClock(QObject* parent) : QObject(parent) {}

void PlaybackClock::setDurationMs(double ms) {
    if (ms == m_durationMs) {
        return;
    }
    m_durationMs = std::max(0.0, ms);
    emit durationMsChanged();
}

void PlaybackClock::setLoop(bool loop) {
    if (loop == m_loop) {
        return;
    }
    m_loop = loop;
    emit loopChanged();
}

double PlaybackClock::clampTime(double ms) const {
    if (m_durationMs <= 0.0) {
        return std::max(0.0, ms);
    }
    if (m_loop && ms >= m_durationMs) {
        return std::fmod(ms, m_durationMs);
    }
    return std::clamp(ms, 0.0, m_durationMs);
}

double PlaybackClock::currentTimeMs() const {
    if (!m_playing) {
        return m_timeMs;
    }
    return clampTime(m_originMs + static_cast<double>(m_timer.nsecsElapsed()) / 1.0e6);
}

void PlaybackClock::play() {
    if (m_playing) {
        return;
    }
    if (!m_loop && m_durationMs > 0.0 && m_timeMs >= m_durationMs) {
        m_timeMs = 0.0;
    }
    m_originMs = m_timeMs;
    m_timer.start();
    m_playing = true;
    emit playingChanged();
}

void PlaybackClock::pause() {
    if (!m_playing) {
        return;
    }
    m_timeMs = currentTimeMs();
    m_playing = false;
    emit playingChanged();
    emit timeChanged();
}

void PlaybackClock::toggle() {
    m_playing ? pause() : play();
}

void PlaybackClock::seek(double ms) {
    m_timeMs = clampTime(ms);
    if (m_playing) {
        m_originMs = m_timeMs;
        m_timer.restart();
    }
    emit timeChanged();
}

void PlaybackClock::tick() {
    if (!m_playing) {
        return;
    }
    m_timeMs = currentTimeMs();
    if (!m_loop && m_durationMs > 0.0 && m_timeMs >= m_durationMs) {
        m_playing = false;
        emit playingChanged();
    }
    emit timeChanged();
}
