#pragma once

// The shared state of the audio-master clock (DESIGN.md D21). Three writers,
// each with its own seqlock, so no side ever blocks another:
//   - the transport (PlaybackClock, GUI thread) writes the newest command:
//     play, pause, seek, or a rate change;
//   - the device callback (real time) writes the buffer pair
//     (framesRendered, hostTimeNs) at the start of each buffer and the anchor
//     it rendered that buffer with;
//   - the engine (any non-real-time thread) writes the device facts: running,
//     the sample rate, the output latency, and a generation that changes with
//     each device start or reroute.
// The callback side of the protocol is `CallbackClockDriver`, which the real
// device callback and the fake device of the tests both run.

#include <atomic>
#include <cstdint>
#include <cstring>
#include <type_traits>

namespace nt::playback {

// A single-writer seqlock for a trivially copyable value. Reads never block
// the writer; a read that overlaps a write retries.
template <typename T>
class SeqLock {
    static_assert(std::is_trivially_copyable_v<T>);
    static constexpr std::size_t kWords = (sizeof(T) + 7) / 8;

public:
    SeqLock() { store(T{}); }

    void store(const T& value) {
        std::uint64_t words[kWords] = {};
        std::memcpy(words, &value, sizeof(T));
        const std::uint64_t s = m_seq.load(std::memory_order_relaxed);
        m_seq.store(s + 1, std::memory_order_relaxed);
        std::atomic_thread_fence(std::memory_order_release);
        for (std::size_t i = 0; i < kWords; ++i) m_words[i].store(words[i], std::memory_order_relaxed);
        m_seq.store(s + 2, std::memory_order_release);
    }

    // One read that gives up after `attempts` tries while a write is in
    // progress, and leaves `out` unchanged then. The device callback reads
    // with it: a writer descheduled mid-write must not stall the callback.
    bool tryLoad(T& out, int attempts) const {
        std::uint64_t words[kWords];
        for (int i = 0; i < attempts; ++i) {
            const std::uint64_t s1 = m_seq.load(std::memory_order_acquire);
            if (s1 & 1u) continue;
            for (std::size_t w = 0; w < kWords; ++w) words[w] = m_words[w].load(std::memory_order_relaxed);
            std::atomic_thread_fence(std::memory_order_acquire);
            if (m_seq.load(std::memory_order_relaxed) != s1) continue;
            std::memcpy(&out, words, sizeof(T));
            return true;
        }
        return false;
    }

    // Tests only: hold the lock in its writing state, as a writer that was
    // descheduled after it began a write.
    void holdWriteForTest() { m_seq.fetch_add(1); }
    void releaseWriteForTest() { m_seq.fetch_add(1); }

    // Blocks until a coherent value is read. Not for the device callback.
    T load() const {
        std::uint64_t words[kWords];
        for (;;) {
            const std::uint64_t s1 = m_seq.load(std::memory_order_acquire);
            if (s1 & 1u) continue;
            for (std::size_t i = 0; i < kWords; ++i) words[i] = m_words[i].load(std::memory_order_relaxed);
            std::atomic_thread_fence(std::memory_order_acquire);
            if (m_seq.load(std::memory_order_relaxed) == s1) break;
        }
        T value;
        std::memcpy(&value, words, sizeof(T));
        return value;
    }

private:
    std::atomic<std::uint64_t> m_seq{0};
    std::atomic<std::uint64_t> m_words[kWords];
};

// The newest transport request. `seq` grows by 1 per command. Every command
// also carries the newest seek, so a rate change sent before a seek has
// started cannot hide that seek.
struct TransportCommand {
    std::uint64_t seq = 0;
    bool playing = false;
    double rate = 1.0;
    // The newest seek: play and seek start a new timeline position, and the
    // PCM rings are refilled from `seekMs`. A command whose `seekSeq` the
    // callback has already started (a rate change, a pause) continues the
    // timeline from where the current anchor has it.
    std::uint64_t seekSeq = 0;
    double seekMs = 0.0;
    std::int64_t seekIssuedNs = 0;  // monotonic time of the seek
};

// The mapping the callback renders with: device frame `frame` carries
// timeline time `timelineMs`, and each later frame `rate / sampleRate`
// seconds more.
struct AudioAnchor {
    std::uint64_t commandSeq = 0;
    std::uint64_t seekSeq = 0;  // the seek command whose PCM this anchor reads
    std::int64_t frame = 0;
    double timelineMs = 0.0;
    double rate = 1.0;
    bool playing = false;
    bool seek = false;
};

// The anchors the callback keeps: enough for every command whose frames can
// still be in the output latency. More than this many commands inside the
// latency read the oldest kept anchor for the older frames.
constexpr int kAnchorHistory = 32;

// What the callback publishes at the start of each buffer.
struct CallbackState {
    std::int64_t framesAtStart = 0;  // frames rendered before this buffer
    std::int64_t hostTimeNs = 0;     // monotonic time at the start of this buffer
    std::int64_t bufferFrames = 0;   // frames in this buffer
    // The newest anchors, oldest first; the last one starts at or before this
    // buffer. Always at least one.
    std::int32_t anchorCount = 1;
    AudioAnchor anchors[kAnchorHistory];

    const AudioAnchor& cur() const { return anchors[anchorCount - 1]; }
};

struct DeviceInfo {
    bool running = false;
    double sampleRate = 48000.0;
    double outputLatencySec = 0.0;
    std::uint64_t generation = 0;
};

class AudioClockFeed {
public:
    SeqLock<TransportCommand> command;
    SeqLock<CallbackState> callback;
    SeqLock<DeviceInfo> device;
};

// The audible timeline time at monotonic time `nowNs` (D21 steps 2 and 4),
// from one callback publication and the device facts the clock anchored to.
// Returns the time with `held` set when the newest anchor is a seek or a play
// start that is not audible yet: the playhead then holds at its target.
struct AudioReading {
    double timelineMs = 0.0;
    double audibleFrames = 0.0;
    bool held = false;
};
AudioReading audibleTimeline(const CallbackState& cb, const DeviceInfo& device, std::int64_t nowNs);

// The callback half of the protocol. `beginBlock` runs at the start of each
// device buffer: it takes the newest command, starts it when it can, and
// publishes the buffer pair. It never locks or allocates.
class CallbackClockDriver {
public:
    // A seek waits for its PCM up to this long after the command (D22).
    static constexpr std::int64_t kStartDeadlineNs = 300'000'000;

    explicit CallbackClockDriver(AudioClockFeed& feed) : m_feed(feed) {}

    // `pcmReadyForSeek(seq)` answers whether the rings for that seek command
    // are primed. Returns the anchor to render this block with.
    template <typename Ready>
    AudioAnchor beginBlock(std::int64_t hostTimeNs, std::int64_t frames, double sampleRate, Ready&& pcmReadyForSeek) {
        // A bounded read: while the transport is mid-write, keep the last
        // coherent command for this block.
        TransportCommand cmd = m_lastCommand;
        if (m_feed.command.tryLoad(cmd, kCommandReadAttempts)) m_lastCommand = cmd;
        if (cmd.seq != m_cur.commandSeq) {
            if (cmd.seekSeq == m_cur.seekSeq) {
                // Continue the timeline exactly where the old anchor has it.
                AudioAnchor next = m_cur;
                next.commandSeq = cmd.seq;
                next.timelineMs = timelineAt(m_cur, m_framesRendered, sampleRate);
                next.frame = m_framesRendered;
                next.rate = cmd.rate;
                next.playing = cmd.playing;
                next.seek = false;
                startAnchor(next);
            } else {
                const bool ready = pcmReadyForSeek(cmd.seekSeq);
                if (!cmd.playing || ready || hostTimeNs - cmd.seekIssuedNs >= kStartDeadlineNs) {
                    AudioAnchor next;
                    next.commandSeq = cmd.seq;
                    next.seekSeq = cmd.seekSeq;
                    next.frame = m_framesRendered;
                    next.timelineMs = cmd.seekMs;
                    next.rate = cmd.rate;
                    next.playing = cmd.playing;
                    next.seek = true;
                    if (cmd.playing) {
                        m_lastStartNs = hostTimeNs;
                        m_lastStartIssuedNs = cmd.seekIssuedNs;
                        m_lastStartLate = !ready;
                    }
                    startAnchor(next);
                }
                // Else: a play or seek still waits for its PCM. This block
                // renders with the old anchor if it plays, or silence.
            }
        }
        m_seekPending = cmd.seekSeq != m_cur.seekSeq;
        CallbackState st;
        st.framesAtStart = m_framesRendered;
        st.hostTimeNs = hostTimeNs;
        st.bufferFrames = frames;
        st.anchorCount = m_anchorCount;
        for (int i = 0; i < m_anchorCount; ++i) st.anchors[i] = m_anchors[i];
        m_feed.callback.store(st);
        const AudioAnchor used = m_cur;
        m_framesRendered += frames;
        return used;
    }

    // Timeline time of device frame `frame` under `a`.
    static double timelineAt(const AudioAnchor& a, std::int64_t frame, double sampleRate) {
        if (!a.playing) return a.timelineMs;
        return a.timelineMs + static_cast<double>(frame - a.frame) / sampleRate * 1000.0 * a.rate;
    }

    std::int64_t framesRendered() const { return m_framesRendered; }
    // True while a seek or play waits for its PCM: the block plays silence.
    bool seekPending() const { return m_seekPending; }
    // The last play start: the callback time it began and the command time.
    std::int64_t lastStartNs() const { return m_lastStartNs; }
    std::int64_t lastStartIssuedNs() const { return m_lastStartIssuedNs; }
    bool lastStartLate() const { return m_lastStartLate; }

private:
    void startAnchor(const AudioAnchor& next) {
        if (m_anchorCount == kAnchorHistory) {
            for (int i = 1; i < kAnchorHistory; ++i) m_anchors[i - 1] = m_anchors[i];
            --m_anchorCount;
        }
        m_anchors[m_anchorCount++] = next;
        m_cur = next;
    }

    AudioClockFeed& m_feed;
    std::int64_t m_framesRendered = 0;
    static constexpr int kCommandReadAttempts = 64;
    TransportCommand m_lastCommand;
    AudioAnchor m_anchors[kAnchorHistory];
    int m_anchorCount = 1;
    AudioAnchor m_cur;
    std::int64_t m_lastStartNs = 0;
    std::int64_t m_lastStartIssuedNs = 0;
    bool m_lastStartLate = false;
    bool m_seekPending = false;
};

}  // namespace nt::playback
