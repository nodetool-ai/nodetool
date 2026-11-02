#pragma once

// Trim mode in the editor: the selected edit points, keyboard and dynamic trims,
// looping around the edit, and the state the Trim Monitor and the clip marks draw.
// The logic is in TrimModel.h, and this connects it to the model and the clock.
//
// A dynamic trim writes the model with no undo entry while it runs, like a pointer
// gesture, and K pushes one entry from the document at its start. Any press, key
// command, undo or command from elsewhere commits it first.
// Looping only moves the clock, so it writes nothing to any model.

#include "edit/trim/TrimModel.h"

#include <QElapsedTimer>
#include <QJsonArray>
#include <QObject>
#include <QPointer>
#include <QTimer>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

#include <functional>
#include <memory>
#include <optional>

class ClipGestureController;
class PlaybackClock;
class QQuickWindow;
class TimelineModel;

class TrimMode : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Owned by ClipGestureController")
    Q_PROPERTY(bool active READ active NOTIFY pointsChanged)
    // "ripple", "roll" or "trim", for the first point. Empty when not active.
    Q_PROPERTY(QString kind READ kind NOTIFY pointsChanged)
    Q_PROPERTY(int pointCount READ pointCount NOTIFY pointsChanged)
    // Clip id to {start, end}, each the kind of the mark on that edge.
    Q_PROPERTY(QVariantMap marks READ marks NOTIFY pointsChanged)
    // outgoing and incoming ({clipId, name, trackId, mediaType, frameTimeMs,
    // sourceTimeMs}, or null), outgoingMoves, incomingMoves, outShift, inShift.
    Q_PROPERTY(QVariantMap monitor READ monitor NOTIFY monitorChanged)
    Q_PROPERTY(bool dynamicActive READ dynamicActive NOTIFY dynamicChanged)
    Q_PROPERTY(double dynamicSpeed READ dynamicSpeed NOTIFY dynamicChanged)
    Q_PROPERTY(bool atLimit READ atLimit NOTIFY dynamicChanged)
    Q_PROPERTY(bool looping READ looping NOTIFY loopingChanged)
    Q_PROPERTY(bool dragging READ dragging NOTIFY dragChanged)
    Q_PROPERTY(int largeFrames READ largeFrames CONSTANT)

public:
    static constexpr int LARGE_FRAMES = 5;

    explicit TrimMode(ClipGestureController& gestures);

    bool active() const { return !m_points.empty(); }
    QString kind() const;
    int pointCount() const { return static_cast<int>(m_points.size()); }
    QVariantMap marks() const { return m_marks; }
    QVariantMap monitor() const { return m_monitor; }
    bool dynamicActive() const { return m_dynamic != nullptr; }
    double dynamicSpeed() const;
    bool atLimit() const;
    bool looping() const { return m_looping; }
    bool dragging() const { return m_drag.has_value(); }
    int largeFrames() const { return LARGE_FRAMES; }
    const nt::edit::trim::EditPoints& points() const { return m_points; }

    // The clock a dynamic trim runs on, in ms. A test passes its own.
    void setClockSource(std::function<double()> now) { m_now = std::move(now); }
    // Brings a running dynamic trim up to the clock. The timer calls it.
    void advance();

    // A press or a release on an edge with the Ripple or Rolling tool.
    void selectEdge(const QString& clipId, bool out, const QString& mode, bool add, bool dragged);
    // The first key handler. True when trim mode used the key.
    bool handleKey(int key, int modifiers, bool autoRepeat);
    // An action about to run. True when trim mode ran it instead. Any other
    // action commits a dynamic trim and stops the loop before it runs.
    bool interceptAction(const QString& action, const QVariantMap& context);
    // Commits a dynamic trim or abandons a drag, and stops the loop, staying in trim mode.
    Q_INVOKABLE void settle();

    Q_INVOKABLE bool selectNearest();
    Q_INVOKABLE bool toggleKind();
    Q_INVOKABLE bool nudge(int frames, bool merge = false);
    Q_INVOKABLE bool extendToPlayhead(bool merge = false);
    Q_INVOKABLE bool applyDefaultTransition();
    Q_INVOKABLE void leave();
    // Space: true when trim mode took it. Starts or stops the loop around the edit.
    Q_INVOKABLE bool toggleLoop();
    Q_INVOKABLE void shuttle(int direction, bool slow = false);
    Q_INVOKABLE void stop();
    // side: "outgoing", "incoming" or "between".
    Q_INVOKABLE void beginDrag(const QString& side);
    Q_INVOKABLE void dragFrames(int frames);
    Q_INVOKABLE void endDrag(bool commit);

signals:
    void pointsChanged();
    void monitorChanged();
    void dynamicChanged();
    void loopingChanged();
    void dragChanged();

protected:
    bool eventFilter(QObject* watched, QEvent* event) override;

private:
    struct Drag {
        nt::edit::EditDoc base;
        QJsonArray before;
        nt::edit::trim::EditPoints previous;
        nt::edit::trim::EditPoints points;
        nt::edit::trim::Env env;
        bool moved = false;
    };

    nt::edit::trim::Env env();
    nt::edit::ClipList runEdge(const nt::edit::EditDoc& doc, const nt::edit::trim::EdgeRequest& request);
    void rebind();
    void onClipsChanged();
    void setPoints(nt::edit::trim::EditPoints points, bool newSession);
    void refresh();
    void showMonitor(bool on);
    void write(const nt::edit::ClipList& clips);
    // A mergeable entry takes in the next one that says `merge`, as a held key's repeats do.
    bool commit(const QString& text, const QJsonArray& before, const QJsonArray& after, bool mergeable = false, bool merge = false);
    void commitTrim(const nt::edit::trim::TrimResult& result, const QString& text, bool merge);
    void commitDynamic(bool liveClips = false);
    // Puts a running dynamic trim or drag on the undo stack. `liveClips`: end at the
    // model's clips, which someone else has changed, instead of the trim's own.
    void settleEdits(bool liveClips = false);
    void cancelDynamic();
    void endDynamic();
    void writeDynamic();
    void seekToEdit();
    void stopLoop();
    double editTime() const;

    ClipGestureController& m_gestures;
    QPointer<TimelineModel> m_timeline;
    QPointer<PlaybackClock> m_clock;
    QPointer<QQuickWindow> m_window;
    nt::edit::trim::EditPoints m_points;
    nt::edit::trim::ShiftAnchor m_anchor;
    QVariantMap m_marks;
    QVariantMap m_monitor;
    QString m_previousDisplay;
    std::unique_ptr<nt::edit::trim::DynamicTrim> m_dynamic;
    std::optional<Drag> m_drag;
    QTimer m_timer;
    QElapsedTimer m_elapsed;
    std::function<double()> m_now;
    bool m_looping = false;
    bool m_writing = false;
};
