#pragma once

// The Program monitor's mini timeline, as in Premiere and filmcraft's
// monitor.rs `mini_timeline`: frame ticks at the bottom, the sequence markers
// as flags at the top, the in/out range shaded with a curly brace at each end
// and the playhead as a pentagon over a line. It shows the part of the
// sequence that the zoom bar selects (`zoomStart`..`zoomEnd`, fractions).
// A press seeks, a drag scrubs. A press on a flag reports the marker instead.

#include <QColor>
#include <QQuickPaintedItem>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class MonitorMiniTimeline : public QQuickPaintedItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(double durationMs READ durationMs WRITE setDurationMs NOTIFY changed)
    Q_PROPERTY(double fps READ fps WRITE setFps NOTIFY changed)
    Q_PROPERTY(double timeMs READ timeMs WRITE setTimeMs NOTIFY changed)
    Q_PROPERTY(double zoomStart READ zoomStart WRITE setZoomStart NOTIFY changed)
    Q_PROPERTY(double zoomEnd READ zoomEnd WRITE setZoomEnd NOTIFY changed)
    // -1: not set.
    Q_PROPERTY(double rangeInMs READ rangeInMs WRITE setRangeInMs NOTIFY changed)
    Q_PROPERTY(double rangeOutMs READ rangeOutMs WRITE setRangeOutMs NOTIFY changed)
    // The document's markers ({id, timeMs, color?, durationMs?}).
    Q_PROPERTY(QVariantList markers READ markers WRITE setMarkers NOTIFY changed)
    Q_PROPERTY(double uiScale READ uiScale WRITE setUiScale NOTIFY changed)
    Q_PROPERTY(QColor tickColor READ tickColor WRITE setTickColor NOTIFY changed)
    Q_PROPERTY(QColor rangeColor READ rangeColor WRITE setRangeColor NOTIFY changed)
    Q_PROPERTY(QColor playheadColor READ playheadColor WRITE setPlayheadColor NOTIFY changed)
    Q_PROPERTY(QColor markerColor READ markerColor WRITE setMarkerColor NOTIFY changed)
    Q_PROPERTY(bool scrubbing READ scrubbing NOTIFY scrubbingChanged)
    Q_PROPERTY(int paintCount READ paintCount NOTIFY painted)

public:
    explicit MonitorMiniTimeline(QQuickItem* parent = nullptr);

    double durationMs() const { return m_durationMs; }
    void setDurationMs(double v);
    double fps() const { return m_fps; }
    void setFps(double v);
    double timeMs() const { return m_timeMs; }
    void setTimeMs(double v);
    double zoomStart() const { return m_zoomStart; }
    void setZoomStart(double v);
    double zoomEnd() const { return m_zoomEnd; }
    void setZoomEnd(double v);
    double rangeInMs() const { return m_rangeInMs; }
    void setRangeInMs(double v);
    double rangeOutMs() const { return m_rangeOutMs; }
    void setRangeOutMs(double v);
    QVariantList markers() const { return m_markers; }
    void setMarkers(const QVariantList& v);
    double uiScale() const { return m_scale; }
    void setUiScale(double v);
    QColor tickColor() const { return m_tick; }
    void setTickColor(const QColor& c);
    QColor rangeColor() const { return m_range; }
    void setRangeColor(const QColor& c);
    QColor playheadColor() const { return m_playhead; }
    void setPlayheadColor(const QColor& c);
    QColor markerColor() const { return m_marker; }
    void setMarkerColor(const QColor& c);
    bool scrubbing() const { return m_scrubbing; }
    int paintCount() const { return m_paintCount; }

    // The first and last shown times.
    Q_INVOKABLE double shownStartMs() const;
    Q_INVOKABLE double shownEndMs() const;
    // The x of a time, and the time under an x, snapped to a frame.
    Q_INVOKABLE double xForTime(double ms) const;
    Q_INVOKABLE double timeAt(double x) const;
    // The index in `markers` of the flag under a point, or -1.
    Q_INVOKABLE int markerAt(double x, double y) const;
    // The minor and major tick steps in frames for the current zoom and width.
    Q_INVOKABLE QVariantList tickSteps() const;

    void paint(QPainter* painter) override;

signals:
    void changed();
    void painted();
    void scrubbingChanged();
    // A press away from the flags.
    void seekRequested(double ms);
    // A drag that started away from the flags.
    void scrubRequested(double ms);
    void markerClicked(int index, int modifiers);
    void markerDoubleClicked(int index);
    void markerMenuRequested(int index, double x, double y);

protected:
    void mousePressEvent(QMouseEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void mouseDoubleClickEvent(QMouseEvent* event) override;
    void mouseUngrabEvent() override;

private:
    void changedValue();
    void setScrubbing(bool on);
    double frameMs() const;

    double m_durationMs = 0;
    double m_fps = 30;
    double m_timeMs = 0;
    double m_zoomStart = 0;
    double m_zoomEnd = 1;
    double m_rangeInMs = -1;
    double m_rangeOutMs = -1;
    QVariantList m_markers;
    double m_scale = 1;
    QColor m_tick;
    QColor m_range;
    QColor m_playhead;
    QColor m_marker;
    bool m_scrubbing = false;
    bool m_dragged = false;
    int m_pressedMarker = -1;
    int m_paintCount = 0;
};
