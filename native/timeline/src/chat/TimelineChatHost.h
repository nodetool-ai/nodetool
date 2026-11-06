#pragma once
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QObject>
#include <QVariantMap>

namespace nt::chat {
// Routes the advertised chat capabilities through the editor's existing commands.
class TimelineChatHost : public QObject {
    Q_OBJECT
    Q_PROPERTY(QStringList selection READ selection WRITE setSelection NOTIFY contextChanged)
public:
    TimelineChatHost(TimelineModel& model, PlaybackClock& clock, QObject* parent = nullptr);
    QStringList selection() const { return m_selection; }
    void setSelection(const QStringList& ids);
    QVariantMap context() const;
    static QVariantList tools();
    QVariantMap execute(const QString& name, const QVariantMap& args);
signals:
    void contextChanged();
private:
    TimelineModel& m_model;
    PlaybackClock& m_clock;
    QStringList m_selection;
};
}
