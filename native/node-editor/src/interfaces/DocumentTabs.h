#pragma once
#include <QObject>
#include <QPointF>
#include <QString>
#include <QVariantList>

namespace nodetool::node_editor {

// What the workspace tab bar (TabBar.qml) and the subgraph strips
// (CanvasTabStrip.qml) read and do: the open tabs of the active project, the
// active tab, the project name, the canvas strips, the shared scroll offset,
// and the tab, project, tool tip and settings requests.
//
// The owner fills the state with the setters and handles the *Requested
// signals. Tab and surface indexes are the owner's: tab indexes count the tabs
// of the active project, surface indexes count every open surface. A test can
// use a plain instance and a QSignalSpy. QML gets a non-owning pointer through
// a required property.
//
// UI thread only.
class DocumentTabs : public QObject {
    Q_OBJECT
    // One map per tab: title, dirty, running, renamable.
    Q_PROPERTY(QVariantList tabs READ tabs NOTIFY tabsChanged)
    // -1 when no tab is active.
    Q_PROPERTY(int activeTab READ activeTab NOTIFY tabsChanged)
    Q_PROPERTY(QString projectName READ projectName NOTIFY tabsChanged)
    // One map per subgraph strip: depth, and entries of title, surface, host, selected.
    Q_PROPERTY(QVariantList canvasStrips READ canvasStrips NOTIFY tabsChanged)
    // Every tab hosts its own strip, so the owner keeps one offset for all of them.
    Q_PROPERTY(qreal stripOffset READ stripOffset NOTIFY stripOffsetChanged)
public:
    explicit DocumentTabs(QObject *parent = nullptr);
    ~DocumentTabs() override;

    QVariantList tabs() const { return tabs_; }
    int activeTab() const { return activeTab_; }
    QString projectName() const { return projectName_; }
    QVariantList canvasStrips() const { return canvasStrips_; }
    qreal stripOffset() const { return stripOffset_; }

    // Emits tabsChanged once on every call, which rebuilds the strip's delegates.
    void setTabs(const QVariantList &tabs, int activeTab, const QString &projectName, const QVariantList &canvasStrips);
    void setStripOffset(qreal offset);
    // Asks the strip to edit a tab's name in place.
    void beginRename(int index) { emit renameStarted(index); }

    Q_INVOKABLE void newTab() { emit newTabRequested(); }
    Q_INVOKABLE void activateTab(int index) { emit activateTabRequested(index); }
    Q_INVOKABLE void closeTab(int index) { emit closeTabRequested(index); }
    Q_INVOKABLE void dropTab(int source, int target, bool after) { emit dropTabRequested(source, target, after); }
    Q_INVOKABLE void renameTab(int index, const QString &name) { emit renameTabRequested(index, name); }
    Q_INVOKABLE void showTabMenu(int index, const QPointF &global) { emit tabMenuRequested(index, global); }
    Q_INVOKABLE void showProjectMenu(const QPointF &global) { emit projectMenuRequested(global); }
    // Empty text hides the tool tip.
    Q_INVOKABLE void showToolTip(const QString &text, const QPointF &global) { emit toolTipRequested(text, global); }
    Q_INVOKABLE void scrollStrip(qreal offset) { emit stripScrolled(offset); }
    Q_INVOKABLE void activateSurface(int surface) { emit activateSurfaceRequested(surface); }
    Q_INVOKABLE void closeSurface(int surface) { emit closeSurfaceRequested(surface); }
    // The settings button at the end of the bar.
    Q_INVOKABLE void openSettings() { emit settingsRequested(); }

signals:
    void tabsChanged();
    void stripOffsetChanged();
    void renameStarted(int index);
    void newTabRequested();
    void activateTabRequested(int index);
    void closeTabRequested(int index);
    void dropTabRequested(int source, int target, bool after);
    void renameTabRequested(int index, const QString &name);
    void tabMenuRequested(int index, const QPointF &global);
    void projectMenuRequested(const QPointF &global);
    void toolTipRequested(const QString &text, const QPointF &global);
    void stripScrolled(qreal offset);
    void activateSurfaceRequested(int surface);
    void closeSurfaceRequested(int surface);
    void settingsRequested();

private:
    QVariantList tabs_;
    int activeTab_ = -1;
    QString projectName_;
    QVariantList canvasStrips_;
    qreal stripOffset_ = 0;
};

}  // namespace nodetool::node_editor
