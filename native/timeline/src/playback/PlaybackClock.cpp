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
    {
        std::lock_guard lock(m_mutex);
        ms = std::max(0.0, ms);
        if (ms == m_durationMs) {
            return;
        }
        m_durationMs = ms;
        // Keep the current anchors; the next tick applies stop/loop behavior
        // at the new end. Explicit In/Out bounds remain authoritative.
        updateBoundsLocked();
    }
    emit durationMsChanged();
}

void PlaybackClock::setFps(double fps) {
    if (!std::isfinite(fps) || fps <= 0.0) {
        return;
    }
    {
        std::lock_guard lock(m_mutex);
        if (fps == m_fps) {
            return;
        }
        m_fps = fps;
    }
    emit fpsChanged();
}

void PlaybackClock::setRangeIn(double ms) {
    {
        std::lock_guard lock(m_mutex);
        m_rangeInMs = ms < 0.0 ? -1.0 : std::max(0.0, ms);
        if (m_rangeInMs >= 0.0 && m_rangeOutMs >= 0.0 && m_rangeOutMs <= m_rangeInMs) {
            m_rangeOutMs = -1.0;
        }
        updateBoundsLocked();
    }
    emit rangeChanged();
}

void PlaybackClock::setRangeOut(double ms) {
    {
        std::lock_guard lock(m_mutex);
        m_rangeOutMs = ms < 0.0 ? -1.0 : std::max(0.0, ms);
        if (m_rangeOutMs >= 0.0 && m_rangeInMs >= m_rangeOutMs) {
            m_rangeInMs = -1.0;
        }
        updateBoundsLocked();
    }
    emit rangeChanged();
}

void PlaybackClock::clearRange() {
    {
        std::lock_guard lock(m_mutex);
        m_rangeInMs = -1.0;
        m_rangeOutMs = -1.0;
        updateBoundsLocked();
    }
    emit rangeChanged();
}

void PlaybackClock::updateBoundsLocked() {
    const bool ranged = m_loop || m_playingInToOut;
    m_floorMs = ranged && m_rangeInMs >= 0.0 ? m_rangeInMs : 0.0;
    m_endMs = ranged && m_rangeOutMs >= 0.0 ? m_rangeOutMs : m_durationMs;
}

double PlaybackClock::resolveStartLocked(double ms) const {
    // playbackSync.resolvePlayStartMs, including its inclusive frame boundary.
    if (!(m_endMs > 0.0)) {
        return ms;
    }
    const double frameMs = 1000.0 / m_fps;
    if (m_rate >= 0.0) {
        return ms >= m_endMs - frameMs ? m_floorMs : ms;
    }
    return ms <= m_floorMs + frameMs ? m_endMs : ms;
}

void PlaybackClock::setLoop(bool loop) {
    bool sourceChanged = false;
    {
        std::lock_guard lock(m_mutex);
        if (loop == m_loop) {
            return;
        }
        const auto now = m_nowNs();
        const double live = m_playing ? boundedTimeLocked(rawTimeLocked(now)) : m_timeMs;
        m_loop = loop;
        if (m_playing) {
            const bool wasAudio = m_source == Source::Audio;
            updateBoundsLocked();
            m_timeMs = resolveStartLocked(live);
            anchorLocked(m_timeMs, now);
            sourceChanged = wasAudio != (m_source == Source::Audio);
        }
    }
    emit loopChanged();
    emit timeChanged();
    if (sourceChanged) {
        emit audioMasterChanged();
    }
}

bool PlaybackClock::audioMaster() const {
    std::lock_guard lock(m_mutex);
    return m_source == Source::Audio;
}

double PlaybackClock::clampTime(double ms) const {
    if (m_durationMs <= 0.0) {
        return std::max(0.0, ms);
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
        m_command.scrub = m_scrubNext && !m_playing;
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
    return boundedTimeLocked(rawTimeLocked(m_nowNs()));
}

std::uint64_t PlaybackClock::seekSerial() const {
    std::lock_guard lock(m_mutex);
    return m_seekSerial;
}

double PlaybackClock::boundedTimeLocked(double ms) const {
    if (m_rate < 0.0 && ms <= m_floorMs) {
        return m_floorMs;
    }
    if (m_rate > 0.0 && m_endMs > 0.0 && ms >= m_endMs) {
        return m_loop && m_endMs > m_floorMs ? m_floorMs : m_endMs;
    }
    return std::max(0.0, ms);
}

void PlaybackClock::play() {
    bool sourceChanged = false;
    {
        std::lock_guard lock(m_mutex);
        if (m_playing) {
            return;
        }
        updateBoundsLocked();
        m_timeMs = resolveStartLocked(m_timeMs);
        const bool wasAudio = m_source == Source::Audio;
        m_playing = true;
        anchorLocked(m_timeMs, m_nowNs());
        sourceChanged = wasAudio != (m_source == Source::Audio);
    }
    emit playingChanged();
    emit timeChanged();
    if (sourceChanged) emit audioMasterChanged();
}

void PlaybackClock::pause() {
    bool wasPlaying = false;
    bool wasInToOut = false;
    {
        std::lock_guard lock(m_mutex);
        wasInToOut = m_playingInToOut;
        m_playingInToOut = false;
        wasPlaying = m_playing;
        if (m_playing) {
            const auto now = m_nowNs();
            m_timeMs = boundedTimeLocked(rawTimeLocked(now));
            m_playing = false;
            sendCommandLocked(false, 0.0, now);
        }
    }
    if (wasInToOut) {
        emit playingInToOutChanged();
    }
    if (wasPlaying) {
        emit playingChanged();
        emit timeChanged();
    }
}

void PlaybackClock::toggle() {
    if (m_playing) {
        pause();
    } else {
        setRate(1.0);
        play();
    }
}

void PlaybackClock::stop() {
    pause();
    seek(0.0);
}

void PlaybackClock::playInToOut() {
    bool started = false;
    bool rateChangedNow = false;
    bool rangeModeChanged = false;
    bool sourceChanged = false;
    {
        std::lock_guard lock(m_mutex);
        started = !m_playing;
        rateChangedNow = m_rate != 1.0;
        rangeModeChanged = !m_playingInToOut;
        const bool wasAudio = m_source == Source::Audio;
        m_playingInToOut = true;
        m_playing = true;
        m_rate = 1.0;
        updateBoundsLocked();
        m_timeMs = resolveStartLocked(m_rangeInMs >= 0.0 ? m_rangeInMs : 0.0);
        ++m_seekSerial;
        anchorLocked(m_timeMs, m_nowNs());
        sourceChanged = wasAudio != (m_source == Source::Audio);
    }
    if (rangeModeChanged) {
        emit playingInToOutChanged();
    }
    if (rateChangedNow) {
        emit rateChanged();
    }
    if (started) {
        emit playingChanged();
    }
    if (sourceChanged) {
        emit audioMasterChanged();
    }
    emit timeChanged();
}

void PlaybackClock::shuttle(int direction) {
    if (direction != 1 && direction != -1) {
        return;
    }
    bool started = false;
    bool rateChangedNow = false;
    bool sourceChanged = false;
    {
        std::lock_guard lock(m_mutex);
        const auto now = m_nowNs();
        const double live = m_playing ? boundedTimeLocked(rawTimeLocked(now)) : m_timeMs;
        const bool sameDirection = m_playing && ((m_rate > 0.0 && direction == 1) || (m_rate < 0.0 && direction == -1));
        const double nextRate = sameDirection ? direction * std::min(8.0, std::abs(m_rate) * 2.0) : direction;
        started = !m_playing;
        rateChangedNow = nextRate != m_rate;
        const bool wasAudio = m_source == Source::Audio;
        m_rate = nextRate;
        m_playing = true;
        updateBoundsLocked();
        m_timeMs = resolveStartLocked(live);
        // Restart even at the maximum shuttle rate, as TracksRegion does.
        anchorLocked(m_timeMs, now);
        sourceChanged = wasAudio != (m_source == Source::Audio);
    }
    if (rateChangedNow) {
        emit rateChanged();
    }
    if (started) {
        emit playingChanged();
    }
    if (sourceChanged) {
        emit audioMasterChanged();
    }
    emit timeChanged();
}

void PlaybackClock::shuttleStop() {
    pause();
    setRate(1.0);
}

void PlaybackClock::seek(double ms) {
    bool sourceChanged = false;
    {
        std::lock_guard lock(m_mutex);
        const bool wasAudio = m_source == Source::Audio;
        m_timeMs = clampTime(ms);
        ++m_seekSerial;
        const std::int64_t now = m_nowNs();
        if (m_playing) {
            updateBoundsLocked();
            m_timeMs = resolveStartLocked(m_timeMs);
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

void PlaybackClock::scrub(double ms) {
    m_scrubNext = true;
    seek(ms);
    m_scrubNext = false;
}

void PlaybackClock::setRate(double rate) {
    bool sourceChanged = false;
    bool timeChangedNow = false;
    {
        std::lock_guard lock(m_mutex);
        if (rate == m_rate) return;
        const bool wasAudio = m_source == Source::Audio;
        const std::int64_t now = m_nowNs();
        if (m_playing) {
            const double t = boundedTimeLocked(rawTimeLocked(now));
            m_rate = rate;
            updateBoundsLocked();
            const double resolved = resolveStartLocked(t);
            m_monoAnchorMs = resolved;
            m_monoAnchorNs = now;
            if (m_source == Source::Audio && rate <= 0.0) {
                // The device cannot play backwards: the monotonic clock takes
                // over at the current time.
                m_source = Source::Monotonic;
            }
            if (resolved != t || (m_source == Source::Monotonic && m_feed && audioUsable(m_feed->device.load()))) {
                m_timeMs = resolved;
                anchorLocked(resolved, now);
                timeChangedNow = resolved != t;
            } else {
                // Forward-to-forward changes continue at the callback's new
                // slope, preserving the audio master's latency history.
                sendCommandLocked(false, 0.0, now);
            }
        } else {
            m_rate = rate;
        }
        sourceChanged = wasAudio != (m_source == Source::Audio);
    }
    emit rateChanged();
    if (timeChangedNow) {
        emit timeChanged();
    }
    if (sourceChanged) emit audioMasterChanged();
}

void PlaybackClock::tick() {
    bool stopped = false;
    bool rangeModeCleared = false;
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
        if (m_rate > 0.0 && m_endMs > 0.0 && t >= m_endMs) {
            if (m_loop && m_endMs > m_floorMs) {
                m_timeMs = m_floorMs;
                ++m_seekSerial;
                anchorLocked(m_timeMs, now);
            } else {
                m_timeMs = m_endMs;
                m_playing = false;
                sendCommandLocked(false, 0.0, now);
                stopped = true;
            }
        } else if (m_rate < 0.0 && t <= m_floorMs) {
            m_timeMs = m_floorMs;
            m_playing = false;
            sendCommandLocked(false, 0.0, now);
            stopped = true;
        } else {
            m_timeMs = std::max(0.0, t);
        }
        if (stopped && m_playingInToOut) {
            m_playingInToOut = false;
            rangeModeCleared = true;
        }
        sourceChanged = wasAudio != (m_source == Source::Audio);
    }
    if (stopped) {
        emit playingChanged();
    }
    if (rangeModeCleared) {
        emit playingInToOutChanged();
    }
    if (sourceChanged) emit audioMasterChanged();
    emit timeChanged();
}
