#pragma once

// A ruler along the Program monitor's picture, in canvas pixels. It repaints only
// when the view changes, never on a playhead move (D30). It is at most as long as
// the monitor, whatever the zoom.

#include <QColor>
#include <QFont>
#include <QQuickPaintedItem>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class MonitorRulerCanvas : public QQuickPaintedItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(bool vertical READ vertical WRITE setVertical NOTIFY changed)
    // Where canvas coordinate 0 falls along the ruler, in item pixels.
    Q_PROPERTY(double origin READ origin WRITE setOrigin NOTIFY changed)
    Q_PROPERTY(double pixelsPerUnit READ pixelsPerUnit WRITE setPixelsPerUnit NOTIFY changed)
    Q_PROPERTY(QColor background READ background WRITE setBackground NOTIFY changed)
    Q_PROPERTY(QColor textColor READ textColor WRITE setTextColor NOTIFY changed)
    Q_PROPERTY(QColor tickColor READ tickColor WRITE setTickColor NOTIFY changed)
    Q_PROPERTY(QFont font READ font WRITE setFont NOTIFY changed)
    // Each entry: {position: canvas pixels, major: bool}.
    Q_PROPERTY(QVariantList ticks READ ticks NOTIFY changed)

public:
    explicit MonitorRulerCanvas(QQuickItem* parent = nullptr);

    bool vertical() const { return m_vertical; }
    void setVertical(bool value);
    double origin() const { return m_origin; }
    void setOrigin(double value);
    double pixelsPerUnit() const { return m_pixelsPerUnit; }
    void setPixelsPerUnit(double value);
    QColor background() const { return m_background; }
    void setBackground(const QColor& value);
    QColor textColor() const { return m_text; }
    void setTextColor(const QColor& value);
    QColor tickColor() const { return m_tick; }
    void setTickColor(const QColor& value);
    QFont font() const { return m_font; }
    void setFont(const QFont& value);
    QVariantList ticks() const;

    void paint(QPainter* painter) override;

signals:
    void changed();

private:
    void touch();
    bool m_vertical = false;
    double m_origin = 0;
    double m_pixelsPerUnit = 1;
    QColor m_background;
    QColor m_text;
    QColor m_tick;
    QFont m_font;
};
