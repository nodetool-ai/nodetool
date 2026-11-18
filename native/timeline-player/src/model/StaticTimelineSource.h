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

    RenderState renderState() const override { return m_state; }
    std::shared_ptr<const nt::Timeline> snapshot() const override { return m_state.snapshot; }
    quint64 documentGeneration() const override { return m_state.generation; }

    // Replaces the document. The snapshot gets a new revision and its clip
    // index, and the generation goes up.
    void setTimeline(nt::Timeline timeline, std::shared_ptr<void> mediaLeases = {});
    // Drops the document. snapshot() is null afterwards.
    void clear();

private:
    // The renderer may keep a copy after the source is cleared. The audio
    // engine stops before the controller clears or destroys the source.
    RenderState m_state;
};
