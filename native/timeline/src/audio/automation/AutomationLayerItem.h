#pragma once
#include "ui/SceneLayerItem.h"
#include <QVariantList>
#include <QJsonObject>
#include <QtQmlIntegration/qqmlintegration.h>

// GUI thread owns points and the visible curve snapshot. SceneLayerItem copies
// geometry only during blocked-GUI sync and releases nodes on the render thread.
class AutomationLayerItem : public SceneLayerItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(double msPerPx MEMBER m_msPerPx NOTIFY msPerPxChanged)
    Q_PROPERTY(double contentLeft MEMBER m_contentLeft NOTIFY contentLeftChanged)
    Q_PROPERTY(double minimum MEMBER m_min NOTIFY minimumChanged)
    Q_PROPERTY(double maximum MEMBER m_max NOTIFY maximumChanged)
    Q_PROPERTY(double defaultValue MEMBER m_default NOTIFY defaultValueChanged)
    Q_PROPERTY(bool logarithmic MEMBER m_log NOTIFY logarithmicChanged)
    Q_PROPERTY(bool valid MEMBER m_valid NOTIFY validChanged)
    Q_PROPERTY(int selected MEMBER m_selected NOTIFY selectedChanged)
    Q_PROPERTY(double pointRadius MEMBER m_radius NOTIFY pointRadiusChanged)
    Q_PROPERTY(double selectionWidth MEMBER m_selectionWidth NOTIFY selectionWidthChanged)
    Q_PROPERTY(QColor stroke MEMBER m_stroke NOTIFY strokeChanged)
    Q_PROPERTY(QColor selectedColor MEMBER m_selectedColor NOTIFY selectedColorChanged)
    Q_PROPERTY(int paintedPointCount READ paintedPointCount NOTIFY prepared)
public:
    explicit AutomationLayerItem(QQuickItem* parent=nullptr);
    // Document/gesture boundary, called on point changes rather than on zoom.
    Q_INVOKABLE void setPoints(const QVariantList&);
    int paintedPointCount() const { return m_paintedCount; }
signals:
    void pointsChanged();
    void msPerPxChanged();
    void contentLeftChanged();
    void minimumChanged();
    void maximumChanged();
    void defaultValueChanged();
    void logarithmicChanged();
    void validChanged();
    void selectedChanged();
    void pointRadiusChanged();
    void strokeChanged();
    void selectionWidthChanged();
    void selectedColorChanged();
    void prepared();
protected:
    void prepare() override;
private:
    struct Point { double time,value; QJsonObject json; int sourceIndex; };
    QVariantList m_input;
    std::vector<Point> m_points;
    double m_msPerPx=10,m_contentLeft=0,m_min=0,m_max=1,m_default=0,m_radius=3,m_selectionWidth=2;
    bool m_log=false,m_valid=true;
    int m_selected=-1,m_paintedCount=0;
    QColor m_stroke,m_selectedColor;
};
