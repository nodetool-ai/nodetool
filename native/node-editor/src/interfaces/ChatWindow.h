#pragma once
#include <QObject>

namespace nodetool::node_editor {

// What the canvas chat window (EditorChat.qml) does to its own frame: drag it,
// resize it from an edge, and put it back in its default place. The owner
// keeps the geometry and handles the *Requested signals. A test can use a
// plain instance and a QSignalSpy. QML gets a non-owning pointer through a
// required property.
//
// UI thread only.
class ChatWindow : public QObject {
    Q_OBJECT
public:
    explicit ChatWindow(QObject *parent = nullptr);
    ~ChatWindow() override;

    // A drag or resize starts from the window's current frame.
    Q_INVOKABLE void beginGeometry() { emit beginGeometryRequested(); }
    // The pointer's offset from the gesture start. `edges` is 0 for a move,
    // or a mask of 1 (left edge) and 2 (bottom edge) for a resize.
    Q_INVOKABLE void changeGeometry(int dx, int dy, int edges, bool finished) {
        emit changeGeometryRequested(dx, dy, edges, finished);
    }
    Q_INVOKABLE void resetPosition() { emit resetPositionRequested(); }

signals:
    void beginGeometryRequested();
    void changeGeometryRequested(int dx, int dy, int edges, bool finished);
    void resetPositionRequested();
};

}  // namespace nodetool::node_editor
