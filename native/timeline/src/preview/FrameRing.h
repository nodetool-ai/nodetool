#pragma once

// The decode-ahead queue of one source and the frame-pick rules (DESIGN.md
// D16, D17), copied from `render/clipDecoder.ts` and `DecodedFrameSource.ts`.
// The rules are pure functions over presentation times, so they are unit
// tested without a decoder.

#include <deque>
#include <memory>
#include <mutex>
#include <vector>

namespace nt {

// Slack when matching a requested time to a frame time (TIMESTAMP_EPSILON_SEC).
inline constexpr double kTimestampEpsilonSec = 1e-6;
// The largest forward step that decodes through instead of seeking
// (MAX_SEQUENTIAL_GAP_SEC).
inline constexpr double kMaxSequentialGapSec = 1.0;
// Decode ahead: at most this many frames, and at most this far past the
// target, whichever is smaller (D16).
inline constexpr int kMaxFramesAhead = 8;
inline constexpr double kMaxAheadSec = 0.25;

// Whether a frame starting at `frameSec` may be drawn for `targetSec`.
inline bool frameStartsBy(double frameSec, double targetSec) {
    return frameSec <= targetSec + kTimestampEpsilonSec;
}

// The index of the last frame that starts at or before `targetSec`, or -1.
// `pts` is in presentation order (`selectFrameIndex`).
int selectFrameIndex(const std::vector<double>& pts, double targetSec);

// Whether a decoder at `positionSec` must seek to reach `targetSec`: a step
// backward, or a jump forward past kMaxSequentialGapSec (`needsDecodeRestart`).
bool needsDecodeRestart(double positionSec, double targetSec);

// How many leading frames to drop so that the front is the newest frame that
// starts by `targetSec` (`pruneBehindTarget`). The front is never dropped when
// no later frame qualifies, so a target before the first frame, and the last
// frame at end of stream, both keep a frame.
int framesBehindTarget(const std::vector<double>& pts, double targetSec);

// Frames a worker may still decode: under kMaxFramesAhead queued, and the
// newest queued frame under kMaxAheadSec past the target.
bool wantsMoreFrames(int queued, double newestPtsSec, double targetSec);

// A queue of decoded frames shared by one decode worker (producer) and the
// render thread (consumer). One mutex guards the frames together with the
// generation they belong to and the end-of-stream flag, so the consumer reads
// all of them as one snapshot. `Frame` must expose `double ptsSec` and
// `long long generation`.
template <typename Frame>
class FrameRing {
public:
    using Ptr = std::shared_ptr<Frame>;

    // What the consumer sees in one read.
    struct Snapshot {
        Ptr front;                 // the newest frame that starts by the target, or the first queued
        bool frameAfter = false;   // a queued frame starts after the target
        bool eof = false;          // the worker reached the end of this generation's stream
        long long generation = 0;  // the generation the queue holds
        int size = 0;
        double newestPts = -1e300;
    };

    // Worker: empties the queue for a new seek generation.
    void reset(long long generation) {
        std::lock_guard lock(m_mutex);
        m_frames.clear();
        m_generation = generation;
        m_eof = false;
    }

    // Worker: queues a frame of the current generation; drops a stale one.
    bool push(Ptr frame) {
        std::lock_guard lock(m_mutex);
        if (frame->generation != m_generation) return false;
        m_frames.push_back(std::move(frame));
        return true;
    }

    void setEof(long long generation) {
        std::lock_guard lock(m_mutex);
        if (generation == m_generation) m_eof = true;
    }

    // Drops frames behind `targetSec` (the front stays when no later frame
    // starts by the target).
    void prune(double targetSec) {
        std::lock_guard lock(m_mutex);
        pruneLocked(targetSec);
    }

    // Consumer: prunes, then reads the pick and its context under one lock.
    Snapshot pick(double targetSec) {
        std::lock_guard lock(m_mutex);
        pruneLocked(targetSec);
        Snapshot s;
        s.front = m_frames.empty() ? nullptr : m_frames.front();
        for (const auto& f : m_frames) {
            if (!frameStartsBy(f->ptsSec, targetSec)) {
                s.frameAfter = true;
                break;
            }
        }
        s.eof = m_eof;
        s.generation = m_generation;
        s.size = static_cast<int>(m_frames.size());
        s.newestPts = m_frames.empty() ? -1e300 : m_frames.back()->ptsSec;
        return s;
    }

    int size() const {
        std::lock_guard lock(m_mutex);
        return static_cast<int>(m_frames.size());
    }

    // Newest queued pts, or -1e300 when empty.
    double newestPts() const {
        std::lock_guard lock(m_mutex);
        return m_frames.empty() ? -1e300 : m_frames.back()->ptsSec;
    }

private:
    void pruneLocked(double targetSec) {
        std::vector<double> pts;
        pts.reserve(m_frames.size());
        for (const auto& f : m_frames) pts.push_back(f->ptsSec);
        for (int i = framesBehindTarget(pts, targetSec); i > 0; --i) m_frames.pop_front();
    }

    mutable std::mutex m_mutex;
    std::deque<Ptr> m_frames;
    long long m_generation = 0;
    bool m_eof = false;
};

}  // namespace nt
