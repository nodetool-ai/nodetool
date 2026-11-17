#pragma once

#include "server/AutosaveController.h"
#include "server/TimelineList/TimelineListController.h"
#include "nodetool/account/qt/AccountServers.h"
#include "nodetool/account/qt/CloudBrowser.h"
#include <QPointer>
#include <QProcessEnvironment>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>
#include <memory>

namespace nt::app { class ShellMenus; }
namespace nt::server {
class TimelineDocumentController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QQuickItem* anchor READ anchor WRITE setAnchor NOTIFY anchorChanged)
    Q_PROPERTY(QObject* controller READ controller CONSTANT)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
    // The list is on screen. A `documentfile` push of the open timeline's
    // socket refreshes it only then: opening the list refreshes it anyway.
    Q_PROPERTY(bool listShown READ listShown WRITE setListShown NOTIFY listShownChanged)
    // The app's cloud servers (main's nativeAccountServers), or null. With
    // them the list shows the Cloud and Shared with me groups of the
    // current server's account, and opens a chosen timeline in a new window.
    Q_PROPERTY(QObject* accountServers READ accountServers WRITE setAccountServers NOTIFY cloudChanged)
    Q_PROPERTY(QObject* cloudBrowser READ cloudBrowser NOTIFY cloudChanged)
public:
    explicit TimelineDocumentController(QObject* parent = nullptr);
    ~TimelineDocumentController() override;
    QQuickItem* anchor() const { return m_anchor; }
    void setAnchor(QQuickItem* anchor);
    QObject* controller() { return &m_list; }
    QString error() const { return m_error; }
    Q_INVOKABLE void createAndOpen();
    bool listShown() const { return m_listShown; }
    void setListShown(bool shown);
    QObject* accountServers() const;
    void setAccountServers(QObject* servers);
    QObject* cloudBrowser() const;
    // Opens the cloud timeline `id` of the current server in a new window,
    // as switchTo opens a local one.
    Q_INVOKABLE void openCloud(const QString& id, const QString& role);
    // Follows the open timeline's socket (bind() finds it above the anchor).
    void watch(AutosaveController* autosave);
signals:
    void listShownChanged();
    void openRequested();
    void anchorChanged();
    void errorChanged();
    void cloudChanged();
private:
    bool leaveCurrent();
    void launch(QStringList arguments, const QProcessEnvironment& environment);
    void bind();
    void switchTo(const QString& source);
    void fail(const QString& error);
    AutosaveController* findAutosave() const;
    QPointer<QQuickItem> m_anchor;
    QPointer<nt::app::ShellMenus> m_menus;
    QPointer<AutosaveController> m_autosave;
    bool m_listShown = false;
    TimelineListController m_list;
    QString m_error;
    bool m_switching = false;
    QPointer<nodetool::account::qt::AccountServers> m_servers;
    std::unique_ptr<nodetool::account::qt::CloudBrowser> m_cloud;
};
}
