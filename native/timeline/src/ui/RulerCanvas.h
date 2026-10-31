#pragma once

// The tick canvas of TimeRuler.tsx: minor and major ticks for the visible
// range, M:SS labels on the major ticks, the in/out range band behind them
// and a guide line per marker (the flags are QML items over it). It repaints only when the zoom, the
// scroll, the size or a colour changes, never on a playhead move (D30);
// `paintCount` lets a test check that.

#include "model/TimelineModel.h"
#include <QPointer>
#include <QColor>
#include <QFont>
#include <QQuickPaintedItem>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class RulerCanvas : public QQuickPaintedItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(QString rulerMode READ rulerMode WRITE setRulerMode NOTIFY changed)
    Q_PROPERTY(QString gridDivision READ gridDivision WRITE setGridDivision NOTIFY changed)
    Q_PROPERTY(QVariantList ticks READ ticks NOTIFY changed)
    Q_PROPERTY(double msPerPx READ msPerPx WRITE setMsPerPx NOTIFY changed)
    Q_PROPERTY(double scrollLeftPx READ scrollLeftPx WRITE setScrollLeftPx NOTIFY changed)
    Q_PROPERTY(double fps READ fps WRITE setFps NOTIFY changed)
    Q_PROPERTY(QColor background READ background WRITE setBackground NOTIFY changed)
    Q_PROPERTY(QColor textColor READ textColor WRITE setTextColor NOTIFY changed)
    Q_PROPERTY(QColor tickColor READ tickColor WRITE setTickColor NOTIFY changed)
    Q_PROPERTY(QFont font READ font WRITE setFont NOTIFY changed)
    Q_PROPERTY(QColor markerColor READ markerColor WRITE setMarkerColor NOTIFY changed)
    // -1: not set.
    Q_PROPERTY(double rangeInMs READ rangeInMs WRITE setRangeInMs NOTIFY changed)
    Q_PROPERTY(double rangeOutMs READ rangeOutMs WRITE setRangeOutMs NOTIFY changed)
    // The document's markers ({timeMs, color?}).
    Q_PROPERTY(QVariantList markers READ markers WRITE setMarkers NOTIFY changed)
    Q_PROPERTY(int paintCount READ paintCount NOTIFY painted)
    Q_PROPERTY(int labelCount READ labelCount NOTIFY painted)

public:
    explicit RulerCanvas(QQuickItem* parent = nullptr);

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    QString rulerMode() const { return m_rulerMode; }
    void setRulerMode(const QString& mode);
    QString gridDivision() const { return m_gridDivision; }
    void setGridDivision(const QString& division);
    QVariantList ticks() const;
    double msPerPx() const { return m_msPerPx; }
    void setMsPerPx(double v);
    double scrollLeftPx() const { return m_scrollLeftPx; }
    void setScrollLeftPx(double v);
    double fps() const { return m_fps; }
    void setFps(double v);
    QColor background() const { return m_background; }
    void setBackground(const QColor& c);
    QColor textColor() const { return m_text; }
    void setTextColor(const QColor& c);
    QColor tickColor() const { return m_tick; }
    void setTickColor(const QColor& c);
    QFont font() const { return m_font; }
    void setFont(const QFont& f);
    QColor markerColor() const { return m_marker; }
    void setMarkerColor(const QColor& c);
    double rangeInMs() const { return m_rangeInMs; }
    void setRangeInMs(double v);
    double rangeOutMs() const { return m_rangeOutMs; }
    void setRangeOutMs(double v);
    QVariantList markers() const { return m_markers; }
    void setMarkers(const QVariantList& markers);
    int paintCount() const { return m_paintCount; }
    int labelCount() const { return m_labelCount; }

    void paint(QPainter* painter) override;

signals:
    void changed();
    void painted();

private:
    void changedValue();

    QPointer<TimelineModel> m_timeline;
    QString m_rulerMode = QStringLiteral("time");
    QString m_gridDivision = QStringLiteral("beat");
    double m_msPerPx = 10.0;
    double m_scrollLeftPx = 0.0;
    double m_fps = 0.0;
    QColor m_background;
    QColor m_text;
    QColor m_tick;
    QFont m_font;
    QColor m_marker;
    double m_rangeInMs = -1;
    double m_rangeOutMs = -1;
    QVariantList m_markers;
    int m_paintCount = 0;
    int m_labelCount = 0;
};
