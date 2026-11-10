#pragma once

// The zoom scroll bar under the Program monitor's mini timeline, as in
// filmcraft's monitor.rs `time_zoom_bar`. The thumb is the part of the
// sequence the mini timeline shows (`start`..`end`, fractions). Drag a handle
// at either end to zoom with the other end fixed, drag the middle to scroll,
// or press beside the thumb to bring it there. A full thumb shows everything.

#include <QColor>
#include <QQuickPaintedItem>
#include <QtQmlIntegration/qqmlintegration.h>

class MonitorZoomBar : public QQuickPaintedItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(double start READ start WRITE setStart NOTIFY changed)
    Q_PROPERTY(double end READ end WRITE setEnd NOTIFY changed)
    // The narrowest span, as a fraction of the whole.
    Q_PROPERTY(double minSpan READ minSpan WRITE setMinSpan NOTIFY changed)
    Q_PROPERTY(double uiScale READ uiScale WRITE setUiScale NOTIFY changed)
    Q_PROPERTY(QColor trackColor READ trackColor WRITE setTrackColor NOTIFY changed)
    Q_PROPERTY(QColor thumbColor READ thumbColor WRITE setThumbColor NOTIFY changed)
    Q_PROPERTY(QColor thumbHoverColor READ thumbHoverColor WRITE setThumbHoverColor NOTIFY changed)
    Q_PROPERTY(QColor handleFill READ handleFill WRITE setHandleFill NOTIFY changed)
    Q_PROPERTY(QColor handleStroke READ handleStroke WRITE setHandleStroke NOTIFY changed)
    Q_PROPERTY(QRectF thumbRect READ thumbRect NOTIFY changed)

public:
    explicit MonitorZoomBar(QQuickItem* parent = nullptr);

    double start() const { return m_start; }
    void setStart(double v);
    double end() const { return m_end; }
    void setEnd(double v);
    double minSpan() const { return m_minSpan; }
    void setMinSpan(double v);
    double uiScale() const { return m_scale; }
    void setUiScale(double v);
    QColor trackColor() const { return m_track; }
    void setTrackColor(const QColor& c);
    QColor thumbColor() const { return m_thumb; }
    void setThumbColor(const QColor& c);
    QColor thumbHoverColor() const { return m_thumbHover; }
    void setThumbHoverColor(const QColor& c);
    QColor handleFill() const { return m_handleFill; }
    void setHandleFill(const QColor& c);
    QColor handleStroke() const { return m_handleStroke; }
    void setHandleStroke(const QColor& c);
    QRectF thumbRect() const;

    void paint(QPainter* painter) override;

signals:
    void changed();
    // The user moved the thumb or a handle. The host stores the range.
    void rangeEdited(double start, double end);

protected:
    void mousePressEvent(QMouseEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void mouseReleaseEvent(QMouseEvent* event) override;
    void hoverMoveEvent(QHoverEvent* event) override;
    void hoverLeaveEvent(QHoverEvent* event) override;

private:
    enum class Part { Beside, Left, Middle, Right };
    Part partAt(double x) const;
    double perPixel() const;
    double jump(double x) const;
    void edit(double start, double end);
    void changedValue();

    double m_start = 0;
    double m_end = 1;
    double m_minSpan = 0;
    double m_scale = 1;
    QColor m_track;
    QColor m_thumb;
    QColor m_thumbHover;
    QColor m_handleFill;
    QColor m_handleStroke;
    bool m_hover = false;
    Part m_grab = Part::Beside;
    double m_grabX = 0;
    double m_grabStart = 0;
    double m_lastX = 0;
};
