#pragma once
#include "assets/AssetMedia.h"
#include "server/AutosaveController.h"
#include <QObject>
#include <QPointer>
#include <QSet>
#include <QThread>
#include <deque>
#include <memory>

class TimelineModel;
namespace nt::motion {
class MatteResolver final : public QObject {
public:
    MatteResolver(TimelineModel& model, nt::server::SaveTarget target);
    ~MatteResolver() override;
private:
    void reset();
    void scan();
    void next();
    QPointer<TimelineModel> m_model;
    nt::server::SaveTarget m_target;
    std::shared_ptr<nt::assets::MediaProtection> m_protection = std::make_shared<nt::assets::MediaProtection>();
    QPointer<QThread> m_worker;
    QSet<QString> m_queued;
    std::deque<QString> m_pending;
};
}
