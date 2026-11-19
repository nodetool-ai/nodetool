#include "transcript/CaptionCues.h"

#include <QJsonObject>
#include <QString>
#include <utility>

namespace nt::transcript {

std::vector<std::vector<int>> captionCues(const QJsonArray& words, double durationMs) {
    std::vector<std::vector<int>> cues;
    std::vector<int> current;
    double previousEnd = 0;
    for (qsizetype i = 0; i < words.size(); ++i) {
        const auto word = words.at(i).toObject();
        const double start = word.value("startMs").toDouble();
        const double end = word.value("endMs").toDouble();
        if (end <= 0 || start >= durationMs) { continue; }
        if (!current.empty()) {
            const auto mark = word.value("cue").toString();
            const bool natural = static_cast<int>(current.size()) >= CUE_MAX_WORDS || start - previousEnd >= CUE_GAP_MS;
            if (mark == "start" || (mark != "continue" && natural)) {
                cues.push_back(std::move(current));
                current.clear();
            }
        }
        current.push_back(static_cast<int>(i));
        previousEnd = end;
    }
    if (!current.empty()) { cues.push_back(std::move(current)); }
    return cues;
}

}  // namespace nt::transcript
