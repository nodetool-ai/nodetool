#pragma once

#include "model/TimelineSource.h"

#include <memory>

namespace nt { struct Timeline; }

// A read-only document: it holds one immutable snapshot until the owner
// replaces it. TimelinePlayerController keeps the loaded document in one.
// Thread affinity: UI thread only. The owner holds it, consumers hold a
// QPointer, as with every TimelineSource.
class StaticTimelineSource final : public TimelineSource {
    Q_OBJECT

public:
    using TimelineSource::TimelineSource;
    ~StaticTimelineSource() override;

    std::shared_ptr<const nt::Timeline> snapshot() const override { return m_snapshot; }
    quint64 documentGeneration() const override { return m_generation; }

    // Replaces the document. The snapshot gets a new revision and its clip
    // index, and the generation goes up.
    void setTimeline(nt::Timeline timeline);
    // Drops the document. snapshot() is null afterwards.
    void clear();

private:
    // Shared with the render thread and the audio engine (DESIGN.md D8), so
    // a snapshot stays valid while any of them holds it.
    std::shared_ptr<const nt::Timeline> m_snapshot;
    quint64 m_generation = 0;
};
