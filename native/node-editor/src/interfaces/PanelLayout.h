#pragma once
#include <QObject>
#include <QString>

namespace nodetool::node_editor {

// What the icon rail (Rail.qml), the document bar's toggles (HeaderRow.qml)
// and the status bar's tabs (StatusBar.qml) read and do: which panels are
// open, the toggle requests, and the tool tip request.
//
// The owner fills the state with the setters and handles the *Requested
// signals. A test can use a plain instance and a QSignalSpy. QML gets a
// non-owning pointer through a required property.
//
// UI thread only.
class PanelLayout : public QObject {
    Q_OBJECT
    // The workflow browser, the documents view of the rail.
    Q_PROPERTY(bool browserVisible READ browserVisible NOTIFY panelsChanged)
    Q_PROPERTY(bool chatVisible READ chatVisible NOTIFY panelsChanged)
    Q_PROPERTY(bool libraryVisible READ libraryVisible NOTIFY panelsChanged)
    // The node library.
    Q_PROPERTY(bool catalogVisible READ catalogVisible NOTIFY panelsChanged)
    Q_PROPERTY(bool inspectorVisible READ inspectorVisible NOTIFY panelsChanged)
    Q_PROPERTY(bool miniMapVisible READ miniMapVisible NOTIFY panelsChanged)
    // The status bar's views: the run output (logs), run trace and versions.
    Q_PROPERTY(bool outputVisible READ outputVisible NOTIFY panelsChanged)
    Q_PROPERTY(bool traceVisible READ traceVisible NOTIFY panelsChanged)
    Q_PROPERTY(bool versionsVisible READ versionsVisible NOTIFY panelsChanged)
public:
    // One field per panel, so the owner sets them in one call.
    struct Panels {
        bool browser = false;
        bool chat = false;
        bool library = false;
        bool catalog = false;
        bool inspector = false;
        bool miniMap = false;
        bool output = false;
        bool trace = false;
        bool versions = false;
        bool operator==(const Panels &) const = default;
    };

    explicit PanelLayout(QObject *parent = nullptr);
    ~PanelLayout() override;

    bool browserVisible() const { return panels_.browser; }
    bool chatVisible() const { return panels_.chat; }
    bool libraryVisible() const { return panels_.library; }
    bool catalogVisible() const { return panels_.catalog; }
    bool inspectorVisible() const { return panels_.inspector; }
    bool miniMapVisible() const { return panels_.miniMap; }
    bool outputVisible() const { return panels_.output; }
    bool traceVisible() const { return panels_.trace; }
    bool versionsVisible() const { return panels_.versions; }

    void setPanels(const Panels &panels);

    Q_INVOKABLE void toggleBrowser() { emit toggleBrowserRequested(); }
    Q_INVOKABLE void toggleChat() { emit toggleChatRequested(); }
    Q_INVOKABLE void toggleLibrary() { emit toggleLibraryRequested(); }
    Q_INVOKABLE void toggleCatalog() { emit toggleCatalogRequested(); }
    Q_INVOKABLE void toggleInspector() { emit toggleInspectorRequested(); }
    // The rail's last button: the left panel, as the web PanelLeft toggle.
    Q_INVOKABLE void togglePanel() { emit togglePanelRequested(); }
    Q_INVOKABLE void setMiniMapVisible(bool visible) { emit miniMapRequested(visible); }
    // Opens or closes a status bar view: logs, trace or versions.
    Q_INVOKABLE void toggleStatusView(const QString &view) { emit statusViewRequested(view); }
    // Empty text hides the tool tip.

signals:
    void panelsChanged();
    void toggleBrowserRequested();
    void toggleChatRequested();
    void toggleLibraryRequested();
    void toggleCatalogRequested();
    void toggleInspectorRequested();
    void togglePanelRequested();
    void miniMapRequested(bool visible);
    void statusViewRequested(const QString &view);

private:
    Panels panels_;
};

}  // namespace nodetool::node_editor
