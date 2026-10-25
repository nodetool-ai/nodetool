#include "playback/PlaybackClock.h"

#include <algorithm>
#include <chrono>
#include <cmath>

using nt::playback::DeviceInfo;

namespace {
std::int64_t steadyNowNs() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch())
        .count();
}
}  // namespace

PlaybackClock::PlaybackClock(QObject* parent) : QObject(parent), m_nowNs(steadyNowNs) {}

void PlaybackClock::setNowSource(std::function<std::int64_t()> nowNs) {
    std::lock_guard lock(m_mutex);
    m_nowNs = nowNs ? std::move(nowNs) : std::function<std::int64_t()>(steadyNowNs);
}

void PlaybackClock::setAudioFeed(nt::playback::AudioClockFeed* feed) {
    bool changed = false;
    {
        std::lock_guard lock(m_mutex);
        if (feed == m_feed) return;
        const std::int64_t now = m_nowNs();
        const double t = m_playing ? rawTimeLocked(now) : m_timeMs;
        m_feed = feed;
        changed = m_source == Source::Audio;
        m_source = Source::Monotonic;
        if (m_playing) anchorLocked(t, now);
        changed = changed != (m_source == Source::Audio);
    }
    if (changed) emit audioMasterChanged();
}

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

bool PlaybackClock::audioMaster() const {
    std::lock_guard lock(m_mutex);
    return m_source == Source::Audio;
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

bool PlaybackClock::audioUsable(const DeviceInfo& device) const {
    return m_feed != nullptr && device.running && device.sampleRate > 0.0 && m_rate > 0.0;
}

double PlaybackClock::rawTimeLocked(std::int64_t nowNs) const {
    if (m_source == Source::Audio && m_feed) {
        const nt::playback::CallbackState cb = m_feed->callback.load();
        // A seek the device has not started yet holds the playhead at its
        // target (D22: play start waits for the PCM).
        if (cb.cur().seekSeq != m_command.seekSeq) return m_command.seekMs;
        return nt::playback::audibleTimeline(cb, m_device, nowNs).timelineMs;
    }
    return m_monoAnchorMs + static_cast<double>(nowNs - m_monoAnchorNs) / 1.0e6 * m_rate;
}

void PlaybackClock::sendCommandLocked(bool seek, double seekMs, std::int64_t nowNs) {
    if (!m_feed) return;
    m_command.seq += 1;
    m_command.playing = m_playing && m_rate > 0.0;
    m_command.rate = m_rate > 0.0 ? m_rate : 1.0;
    if (seek) {
        m_command.seekSeq += 1;
        m_command.seekMs = seekMs;
        m_command.seekIssuedNs = nowNs;
    }
    m_feed->command.store(m_command);
}

void PlaybackClock::anchorLocked(double ms, std::int64_t nowNs) {
    m_monoAnchorMs = ms;
    m_monoAnchorNs = nowNs;
    if (!m_feed) {
        m_source = Source::Monotonic;
        return;
    }
    const DeviceInfo device = m_feed->device.load();
    m_device = device;
    m_source = (m_playing && audioUsable(device)) ? Source::Audio : Source::Monotonic;
    sendCommandLocked(true, ms, nowNs);
}

double PlaybackClock::currentTimeMs() const {
    std::lock_guard lock(m_mutex);
    if (!m_playing) {
        return m_timeMs;
    }
    return clampTime(rawTimeLocked(m_nowNs()));
}

void PlaybackClock::play() {
    bool sourceChanged = false;
    {
        std::lock_guard lock(m_mutex);
        if (m_playing) {
            return;
        }
        if (!m_loop && m_durationMs > 0.0 && m_timeMs >= m_durationMs) {
            m_timeMs = 0.0;
        }
        const bool wasAudio = m_source == Source::Audio;
        m_playing = true;
        anchorLocked(m_timeMs, m_nowNs());
        sourceChanged = wasAudio != (m_source == Source::Audio);
    }
    emit playingChanged();
    if (sourceChanged) emit audioMasterChanged();
}

void PlaybackClock::pause() {
    {
        std::lock_guard lock(m_mutex);
        if (!m_playing) {
            return;
        }
        const std::int64_t now = m_nowNs();
        m_timeMs = clampTime(rawTimeLocked(now));
        m_playing = false;
        sendCommandLocked(false, 0.0, now);
    }
    emit playingChanged();
    emit timeChanged();
}

void PlaybackClock::toggle() {
    m_playing ? pause() : play();
}

void PlaybackClock::seek(double ms) {
    bool sourceChanged = false;
    {
        std::lock_guard lock(m_mutex);
        const bool wasAudio = m_source == Source::Audio;
        m_timeMs = clampTime(ms);
        const std::int64_t now = m_nowNs();
        if (m_playing) {
            anchorLocked(m_timeMs, now);
        } else {
            // A paused seek lets the device prepare the PCM for the next play.
            sendCommandLocked(true, m_timeMs, now);
        }
        sourceChanged = wasAudio != (m_source == Source::Audio);
    }
    emit timeChanged();
    if (sourceChanged) emit audioMasterChanged();
}

void PlaybackClock::setRate(double rate) {
    bool sourceChanged = false;
    {
        std::lock_guard lock(m_mutex);
        if (rate == m_rate) return;
        const bool wasAudio = m_source == Source::Audio;
        const std::int64_t now = m_nowNs();
        if (m_playing) {
            const double t = rawTimeLocked(now);
            m_rate = rate;
            m_monoAnchorMs = t;
            m_monoAnchorNs = now;
            if (m_source == Source::Audio && rate <= 0.0) {
                // The device cannot play backwards: the monotonic clock takes
                // over at the current time.
                m_source = Source::Monotonic;
            }
            // A forward rate change continues the audio timeline in the
            // callback, at the first frame it renders with the new rate.
            sendCommandLocked(false, 0.0, now);
        } else {
            m_rate = rate;
        }
        sourceChanged = wasAudio != (m_source == Source::Audio);
    }
    emit rateChanged();
    if (sourceChanged) emit audioMasterChanged();
}

void PlaybackClock::tick() {
    bool stopped = false;
    bool sourceChanged = false;
    {
        std::lock_guard lock(m_mutex);
        if (!m_playing) {
            return;
        }
        const bool wasAudio = m_source == Source::Audio;
        const std::int64_t now = m_nowNs();
        const DeviceInfo device = m_feed ? m_feed->device.load() : DeviceInfo{};
        const bool usable = audioUsable(device);
        if (m_source == Source::Audio && !usable) {
            // D21 step 5: the device stopped. The monotonic clock continues
            // from the last audible time.
            const double t = rawTimeLocked(now);
            m_source = Source::Monotonic;
            m_monoAnchorMs = t;
            m_monoAnchorNs = now;
        } else if (m_source == Source::Audio && device.generation != m_device.generation) {
            // D21 step 4: a device change. Re-anchor at the time the old
            // device facts give, and refill the PCM from there.
            anchorLocked(rawTimeLocked(now), now);
        } else if (m_source == Source::Monotonic && usable) {
            anchorLocked(rawTimeLocked(now), now);
        }
        const double t = rawTimeLocked(now);
        if (m_durationMs > 0.0 && t >= m_durationMs) {
            if (m_loop) {
                const double wrapped = std::fmod(t, m_durationMs);
                anchorLocked(wrapped, now);
                m_timeMs = wrapped;
            } else {
                m_timeMs = m_durationMs;
                m_playing = false;
                sendCommandLocked(false, 0.0, now);
                stopped = true;
            }
        } else {
            m_timeMs = std::max(0.0, t);
        }
        sourceChanged = wasAudio != (m_source == Source::Audio);
    }
    if (stopped) emit playingChanged();
    if (sourceChanged) emit audioMasterChanged();
    emit timeChanged();
}
