#pragma once

#include "model/TimelineDocumentLoader.h"
#include "model/TimelineJson.h"
#include "model/TimelineTypes.h"

#include <QJsonArray>
#include <QJsonObject>
#include <QStringList>

#include <memory>

// A loader the test answers by hand. UI thread only. The test owns it.
class FakeTimelineLoader final : public nt::TimelineDocumentLoader {
    Q_OBJECT

public:
    using nt::TimelineDocumentLoader::TimelineDocumentLoader;

    void load(const QString& timelineId, const QUuid& request) override {
        requests.append(timelineId);
        tokens.append(request);
    }
    void cancel() override { ++cancels; }

    void answer(const QString& id, std::shared_ptr<void> leases = {}) {
        answerRequest(requests.lastIndexOf(id), std::move(leases));
    }
    void reject(const QString& id, const QString& message) {
        rejectRequest(requests.lastIndexOf(id), message);
    }
    void answerRequest(qsizetype index, std::shared_ptr<void> leases = {}) {
        const auto id = requests.at(index);
        emit loaded(id, tokens.at(index), document(id), std::move(leases));
    }
    void rejectRequest(qsizetype index, const QString& message = QStringLiteral("late")) {
        emit failed(requests.at(index), tokens.at(index), message);
    }

    // One video track with two clips that have no media, so the compositor
    // draws its synthetic test pattern: 25 fps, 4 s.
    static std::shared_ptr<const nt::Timeline> document(const QString& id) {
        QJsonArray clips;
        for (int k = 0; k < 2; ++k) {
            clips.append(QJsonObject{{"id", QStringLiteral("c%1").arg(k)}, {"trackId", "v1"}, {"name", "clip"},
                                     {"startMs", k * 2000}, {"durationMs", 2000}, {"mediaType", "video"},
                                     {"sourceType", "imported"}, {"status", "generated"}, {"versions", QJsonArray()}});
        }
        const QJsonObject doc{{"id", id}, {"name", id}, {"fps", 25}, {"width", 640}, {"height", 360},
                              {"durationMs", 4000},
                              {"tracks", QJsonArray{QJsonObject{{"id", "v1"}, {"name", "V1"}, {"type", "video"},
                                                                {"index", 0}, {"visible", true}}}},
                              {"clips", clips}};
        nt::ParseResult parsed = nt::parseTimeline(doc);
        if (!parsed.timeline) {
            qFatal("fake timeline does not parse");
        }
        return std::make_shared<const nt::Timeline>(std::move(*parsed.timeline));
    }

    QStringList requests;
    int cancels = 0;

private:
    QList<QUuid> tokens;
};
