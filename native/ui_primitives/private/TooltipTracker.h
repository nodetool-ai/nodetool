#pragma once

#include <QPointer>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

class TooltipTracker : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QQuickItem* trigger READ trigger WRITE setTrigger NOTIFY triggerChanged)
    Q_PROPERTY(QQuickItem* overlay READ overlay WRITE setOverlay NOTIFY geometryChanged)
    Q_PROPERTY(QPointF anchor READ anchor NOTIFY geometryChanged)
    Q_PROPERTY(QRectF bounds READ bounds NOTIFY geometryChanged)
    Q_PROPERTY(bool active READ active WRITE setActive NOTIFY activeChanged)
    // Keeps anchor and bounds current while the tooltip is hidden.
    Q_PROPERTY(bool followsTrigger READ followsTrigger WRITE setFollowsTrigger NOTIFY followsTriggerChanged)
public:
    explicit TooltipTracker(QObject* parent = nullptr);
    ~TooltipTracker() override;
    QQuickItem* trigger() const { return m_trigger; }
    QQuickItem* overlay() const { return m_overlay; }
    QPointF anchor() const;
    QRectF bounds() const;
    bool active() const { return m_active; }
    bool followsTrigger() const { return m_follows; }
    void setTrigger(QQuickItem* trigger);
    void setOverlay(QQuickItem* overlay);
    void setActive(bool active);
    void setFollowsTrigger(bool follows);
    Q_INVOKABLE void prepare();
signals:
    void triggerChanged();
    void geometryChanged();
    void activeChanged();
    void followsTriggerChanged();
    void dismissed();
protected:
    bool eventFilter(QObject* watched, QEvent* event) override;
private:
    void watchAncestors();
    void dismiss();
    QPointer<QQuickItem> m_trigger;
    QPointer<QQuickItem> m_overlay;
    QList<QMetaObject::Connection> m_connections;
    bool m_active = false;
    bool m_follows = false;
    // native-rules #14: static mutable pointer to the active tracker
    static QPointer<TooltipTracker> s_current;
};
