#pragma once

// The tick canvas of TimeRuler.tsx: minor and major ticks for the visible
// range, M:SS labels on the major ticks. It repaints only when the zoom, the
// scroll, the size or a colour changes, never on a playhead move (D30);
// `paintCount` lets a test check that.

#include <QColor>
#include <QFont>
#include <QQuickPaintedItem>
#include <QtQmlIntegration/qqmlintegration.h>

class RulerCanvas : public QQuickPaintedItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(double msPerPx READ msPerPx WRITE setMsPerPx NOTIFY changed)
    Q_PROPERTY(double scrollLeftPx READ scrollLeftPx WRITE setScrollLeftPx NOTIFY changed)
    Q_PROPERTY(double fps READ fps WRITE setFps NOTIFY changed)
    Q_PROPERTY(QColor background READ background WRITE setBackground NOTIFY changed)
    Q_PROPERTY(QColor textColor READ textColor WRITE setTextColor NOTIFY changed)
    Q_PROPERTY(QColor tickColor READ tickColor WRITE setTickColor NOTIFY changed)
    Q_PROPERTY(QFont font READ font WRITE setFont NOTIFY changed)
    Q_PROPERTY(int paintCount READ paintCount NOTIFY painted)
    Q_PROPERTY(int labelCount READ labelCount NOTIFY painted)

public:
    explicit RulerCanvas(QQuickItem* parent = nullptr);

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
    int paintCount() const { return m_paintCount; }
    int labelCount() const { return m_labelCount; }

    void paint(QPainter* painter) override;

signals:
    void changed();
    void painted();

private:
    void changedValue();

    double m_msPerPx = 10.0;
    double m_scrollLeftPx = 0.0;
    double m_fps = 0.0;
    QColor m_background;
    QColor m_text;
    QColor m_tick;
    QFont m_font;
    int m_paintCount = 0;
    int m_labelCount = 0;
};
