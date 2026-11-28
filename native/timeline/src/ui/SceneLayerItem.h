#pragma once
#include <QQuickItem>
#include <QColor>
#include <QFont>
#include <QImage>
#include <QHash>
#include <QtQmlIntegration/qqmlintegration.h>
#include <vector>

// GUI thread prepares immutable drawing commands in polish. Only blocked-GUI
// updatePaintNode publishes them. Scene-graph nodes own all render resources.
class SceneLayerItem : public QQuickItem {
    Q_OBJECT
    QML_ANONYMOUS
public:
    explicit SceneLayerItem(QQuickItem* parent = nullptr);
    Q_INVOKABLE void requestPaint();
protected:
    virtual void prepare() = 0; // GUI thread only, may query models and fonts.
    void updatePolish() override;
    QSGNode* updatePaintNode(QSGNode*, UpdatePaintNodeData*) override;
    void itemChange(ItemChange, const ItemChangeData&) override;
    void geometryChange(const QRectF&, const QRectF&) override;
    void rect(const QRectF&, const QColor&);
    void line(QPointF, QPointF, const QColor&, double thickness = 1);
    void circle(QPointF, double radius, const QColor&);
    void label(const QString&, QPointF, const QFont&, const QColor&, bool vertical = false);
private:
    struct Vertex { float x, y; QColor color; };
    struct Label { QImage image; QRectF rect; bool vertical; };
    std::vector<Vertex> m_vertices;
    std::vector<Label> m_labels;
    QHash<QString, QImage> m_text;
    qreal m_dpr = 1;
    bool m_dirty = true;
};
