#pragma once

#include "server/TimelineList/TimelineListController.h"
#include <QPointer>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::app { class ShellMenus; }
namespace nt::server {
class TimelineDocumentController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QQuickItem* anchor READ anchor WRITE setAnchor NOTIFY anchorChanged)
    Q_PROPERTY(QObject* controller READ controller CONSTANT)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
public:
    explicit TimelineDocumentController(QObject* parent = nullptr);
    QQuickItem* anchor() const { return m_anchor; }
    void setAnchor(QQuickItem* anchor);
    QObject* controller() { return &m_list; }
    QString error() const { return m_error; }
    Q_INVOKABLE void createAndOpen();
signals:
    void openRequested();
    void anchorChanged();
    void errorChanged();
private:
    void bind();
    void switchTo(const QString& source);
    void fail(const QString& error);
    QPointer<QQuickItem> m_anchor;
    QPointer<nt::app::ShellMenus> m_menus;
    TimelineListController m_list;
    QString m_error;
    bool m_switching = false;
};
}
