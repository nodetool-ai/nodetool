#pragma once
#include "graph/CardBodies.h"
#include "graph/CompositorGeometry.h"
#include "graph/EditorScene.h"
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QVariantList>
#include <QVariantMap>
#include <QWidget>
#include <optional>

namespace nodetool::node_editor {
// CompositorEditor.tsx: the Compositor node's layout editor. It holds the
// node's layers, their images and the canvas size, the selected layer, and
// the drag in progress. A drag previews locally and commits once on release,
// so it is one undo step. Every edit leaves as a document command through
// commandRequested. Adding and deleting layers go through layerActionRequested,
// so the card and the dialog share one implementation.
// UI thread only. The dialog's QQuickWidget owns it as its Qt child.
class CompositorLayoutEditor final : public QObject {
    Q_OBJECT
    Q_PROPERTY(int canvasWidth READ canvasWidth NOTIFY changed)
    Q_PROPERTY(int canvasHeight READ canvasHeight NOTIFY changed)
    Q_PROPERTY(int selected READ selected NOTIFY changed)
    // The selected layer's X, Y, Scale X, Scale Y and Rotation in degrees.
    Q_PROPERTY(QVariantMap transform READ transformFields NOTIFY changed)
    // One entry per layer, image_0 first: {name, visible, opacity, blend}.
    Q_PROPERTY(QVariantList layers READ layerEntries NOTIFY changed)
    Q_PROPERTY(QVariantList blendModes READ blendModeEntries CONSTANT)
public:
    explicit CompositorLayoutEditor(QObject *parent = nullptr);
    // The node and the card's loaded sources. Called again whenever either
    // changes. A drag in progress keeps its preview.
    void setNode(const QJsonObject &node, const QHash<QString, CardMediaItem> &sources);
    QString nodeId() const { return nodeId_; }

    int canvasWidth() const { return canvas_.width(); }
    int canvasHeight() const { return canvas_.height(); }
    QSize canvas() const { return canvas_; }
    int selected() const { return selected_; }
    QVariantMap transformFields() const;
    QVariantList layerEntries() const;
    QVariantList blendModeEntries() const;

    // The layers as drawn, with a drag's preview applied.
    QVector<CompositorLayer> displayLayers() const;
    QStringList keys() const { return keys_; }
    const QHash<QString, CardMediaItem> &sources() const { return sources_; }
    // A layer's image size, and its transform with the default filled in.
    QSizeF layerSize(int index) const;
    compositor::LayerTransform layerTransform(int index) const;

    // The stage's pointer, in canvas pixels. viewScale is screen pixels per
    // canvas pixel, which sizes the handles.
    void press(const QPointF &point, double viewScale);
    void drag(const QPointF &point, bool uniform);
    void release();
    bool dragging() const { return drag_.has_value(); }

    Q_INVOKABLE void select(int index);
    Q_INVOKABLE void setCanvasSize(int width, int height);
    // name is x, y, scaleX, scaleY or rotation (degrees).
    Q_INVOKABLE void setTransformField(const QString &name, double value);
    Q_INVOKABLE void resetTransform();
    Q_INVOKABLE void toggleVisible(int index);
    // A slider drag previews with commit false and commits on release.
    Q_INVOKABLE void setOpacity(int index, double value, bool commit);
    Q_INVOKABLE void setBlend(int index, const QString &mode);
    Q_INVOKABLE void addLayer();
    Q_INVOKABLE void deleteLayer(int index);

signals:
    void changed();
    void commandRequested(const QJsonObject &command, const QString &title);
    void layerActionRequested(const QString &action, int index);

private:
    struct Drag {
        compositor::GizmoHandle handle;
        int layer;
        compositor::LayerTransform start;
        QPointF startPointer;
        double startAngle = 0;
        std::optional<compositor::LayerTransform> current;
    };
    void commitLayers(const QVector<CompositorLayer> &layers, const QString &title);
    void commitTransform(int index, const compositor::LayerTransform &transform, const QString &title);
    QString nodeId_;
    QJsonObject node_;
    QStringList keys_;
    QVector<CompositorLayer> layers_;
    QHash<QString, CardMediaItem> sources_;
    QSize canvas_{512, 512};
    int selected_ = -1;
    std::optional<Drag> drag_;
    // An opacity slider's value while it drags.
    std::optional<std::pair<int, double>> opacityDraft_;
};

// CompositorEditorCanvas.tsx: the composite fitted into the widget with a
// 32 px margin and at most 4x, over a checker, with the selected layer's
// outline, its corner and edge handles, and its rotate handle.
// UI thread only. Parented to the dialog. It borrows the editor through a
// QPointer, because the editor belongs to the dialog's QQuickWidget.
class CompositorStage final : public QWidget {
    Q_OBJECT
public:
    CompositorStage(CompositorLayoutEditor *editor, const CanvasTheme &theme, QWidget *parent);
    // Screen pixels per canvas pixel, and the canvas rectangle in the widget.
    double viewScale() const;
    QRectF canvasRect() const;
    QPointF toCanvas(const QPointF &widgetPoint) const;
    QPointF toWidget(const QPointF &canvasPoint) const;
    QSize sizeHint() const override { return {720, 560}; }

protected:
    void paintEvent(QPaintEvent *event) override;
    void mousePressEvent(QMouseEvent *event) override;
    void mouseMoveEvent(QMouseEvent *event) override;
    void mouseReleaseEvent(QMouseEvent *event) override;

private:
    QPointer<CompositorLayoutEditor> editor_;
    CanvasTheme theme_;
};
} // namespace nodetool::node_editor
