#pragma once
#include <QObject>
#include <QString>
#include <QVariantMap>

namespace nodetool::node_editor {

// The editor's named commands for the canvas toolbars (Toolbar.qml,
// SelectionToolbar.qml) and the group controls (AuthoredControls.qml): whether
// the document takes edits, whether a run is shown, and the command, tool tip
// and theme requests.
//
// Commands go up by name, as the window's command menu, shortcuts, headless
// harness and replays name them ("Run", "Auto layout", "Disable selected").
// The owner fills the state with the setters and handles the *Requested
// signals. A test can use a plain instance and a QSignalSpy. QML gets a
// non-owning pointer through a required property.
//
// UI thread only.
class EditorCommands : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool readOnly READ readOnly NOTIFY readOnlyChanged)
    // Debounced, so a burst of preview runs does not flicker the run controls.
    Q_PROPERTY(bool running READ running NOTIFY runningChanged)
public:
    explicit EditorCommands(QObject *parent = nullptr);
    ~EditorCommands() override;

    bool readOnly() const { return readOnly_; }
    bool running() const { return running_; }

    void setReadOnly(bool readOnly);
    void setRunning(bool running);

    Q_INVOKABLE void run(const QString &command) { emit commandRequested(command); }
    // Empty text hides the tool tip.
    Q_INVOKABLE void showToolTip(const QString &text) { emit toolTipRequested(text); }
    // The theme roles the canvas paints with, sent when the theme changes.
    Q_INVOKABLE void present(const QVariantMap &roles) { emit presentationRequested(roles); }

signals:
    void readOnlyChanged();
    void runningChanged();
    void commandRequested(const QString &command);
    void toolTipRequested(const QString &text);
    void presentationRequested(const QVariantMap &roles);

private:
    bool readOnly_ = false;
    bool running_ = false;
};

}  // namespace nodetool::node_editor
