#include "edit/tracks/TrackHeaderActions.h"
#include <QJsonDocument>
#include <algorithm>
#include <vector>

namespace {
std::vector<nt::tracks::HeaderAction>& actions() {
    static std::vector<nt::tracks::HeaderAction> value;
    return value;
}
}
bool nt::tracks::registerHeaderAction(HeaderAction action) {
    if (action.id.isEmpty() || action.source.isEmpty() || !action.source.isValid()
        || std::ranges::any_of(actions(), [&](const auto& item) { return item.id == action.id; })) {
        return false;
    }
    actions().push_back(std::move(action));
    std::stable_sort(actions().begin(), actions().end(), [](const auto& a, const auto& b) { return a.order < b.order; });
    return true;
}
QVariantList TrackHeaderActions::items() const {
    QVariantList result;
    for (const auto& action : actions()) {
        result.append(QVariantMap{{"id", action.id}, {"source", action.source}});
    }
    return result;
}
int TrackHeaderActions::position(TimelineModel* timeline, const QString& trackId) const {
    if (!timeline) {
        return -1;
    }
    const auto tracks = timeline->timeline().raw.value("tracks").toArray();
    for (qsizetype i = 0; i < tracks.size(); ++i) {
        if (tracks[i].toObject().value("id") == trackId) {
            return static_cast<int>(i);
        }
    }
    return -1;
}
