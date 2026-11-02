// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), MIT OR Apache-2.0.
#pragma once
#include <QJsonObject>
#include <QStringList>

namespace nt::framehold {
struct Result {
    QJsonObject doc;
    QStringList clipIds;
    QString error;
    bool unchanged = false;  // the document already says this, which is not a failure to report
    bool ok() const { return error.isEmpty(); }
};
struct OptionsRequest {
    QStringList clipIds;
    bool enabled = true;
    QString holdOn = "in";
    double playheadMs = 0;
    double timeMs = 0;
};
bool isHold(const QJsonObject& clip);
double sourceMsAt(const QJsonObject& clip, double timelineMs);
Result addFrameHold(const QJsonObject& doc, const QStringList& clipIds, double atMs);
Result insertFrameHoldSegment(const QJsonObject& doc, const QString& clipId, double atMs, double durationMs);
Result setFrameHoldOptions(const QJsonObject& doc, const OptionsRequest& request);
}
