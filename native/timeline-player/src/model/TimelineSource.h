#pragma once

#include <QObject>

#include <memory>

namespace nt { struct Timeline; }

// A document that the preview, the audio and the player read. It hands out
// immutable snapshots, which the render thread may keep by pointer
// (DESIGN.md D8).
// Thread affinity: UI thread only. The host owns it. Consumers hold a QPointer.
// TimelineSourceQml.h registers it with QML.
class TimelineSource : public QObject {
    Q_OBJECT

public:
    using QObject::QObject;

    // The current snapshot. A new document or edit makes a new snapshot; an
    // old one stays valid while held.
    virtual std::shared_ptr<const nt::Timeline> snapshot() const = 0;
    // Counts document replacements. It goes up when a different document
    // replaces the current one, not on an edit.
    virtual quint64 documentGeneration() const = 0;

signals:
    // The snapshot or the generation can have changed.
    void sourceChanged();
};
