#pragma once

// The music generation target (docs/MUSIC-MODE.md MD10, MT-5): one track and
// a start and end frame at 48 kHz, or nothing. View state of one editor
// window: it is not saved with the document and it is not an undo step, the
// same as the sequence In and Out range in TimelineViewState. The Range tool
// of ClipGestureController writes it; the range overlay and the music panel
// read it.
//
// Thread affinity: GUI thread only. ClipGestureController owns it as a Qt
// child, so it lives exactly as long as that editor's tracks panel.

#include <QObject>
#include <QString>
#include <QtQmlIntegration/qqmlintegration.h>

#include <cstdint>

class MusicSelection : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("ClipGestureController.musicSelection owns the music selection")
    Q_PROPERTY(bool active READ active NOTIFY changed)
    Q_PROPERTY(QString trackId READ trackId NOTIFY changed)
    // Whole 48 kHz frames, as doubles for QML.
    Q_PROPERTY(double startFrame READ startFrameValue NOTIFY changed)
    Q_PROPERTY(double endFrame READ endFrameValue NOTIFY changed)
    // The same edges as stored milliseconds: frame / 48.
    Q_PROPERTY(double startMs READ startMs NOTIFY changed)
    Q_PROPERTY(double endMs READ endMs NOTIFY changed)

public:
    explicit MusicSelection(QObject* parent = nullptr);

    bool active() const { return !m_trackId.isEmpty(); }
    QString trackId() const { return m_trackId; }
    std::int64_t startFrame() const { return m_start; }
    std::int64_t endFrame() const { return m_end; }
    double startFrameValue() const { return static_cast<double>(m_start); }
    double endFrameValue() const { return static_cast<double>(m_end); }
    double startMs() const;
    double endMs() const;

    // An empty track or an empty range clears the selection.
    void set(const QString& trackId, std::int64_t startFrame, std::int64_t endFrame);
    // Whole frames from QML or a test; fractions round to the nearest frame.
    Q_INVOKABLE void select(const QString& trackId, double startFrame, double endFrame);
    Q_INVOKABLE void clear();

signals:
    void changed();

private:
    QString m_trackId;
    std::int64_t m_start = 0;
    std::int64_t m_end = 0;
};
