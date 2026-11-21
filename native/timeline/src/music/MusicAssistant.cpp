#include "music/MusicAssistant.h"

#include "aiassist/AssistDocument.h"
#include "model/TimelineModel.h"
#include "music/MusicDocument.h"
#include "music/MusicJobs.h"
#include "music/MusicPlan.h"
#include "music/MusicRange.h"
#include "music/MusicTime.h"

#include <QJsonArray>
#include <QRegularExpression>

#include <algorithm>
#include <array>
#include <cmath>
#include <optional>

namespace nt::music::assistant {
namespace {

constexpr int kDefaultCandidates = 2;
// Far past the 600-second window limit at any music tempo, and small enough
// that the frame math cannot overflow.
constexpr double kMaxBar = 100000;
// The models the music panel offers (MusicPanelModel.cpp): Add instrument
// runs only on the base model.
const QString kTurboModel = QStringLiteral("acestep-v15-turbo-Q8_0.gguf");
const QString kBaseModel = QStringLiteral("acestep-v15-base-Q8_0.gguf");

struct Tool {
    const char* name;
    MusicTask task;
    const char* description;
};
const std::array<Tool, 3> kTools{{
    {"ui_timeline_music_generate", MusicTask::Text2Music,
     "Generate music from a prompt into an empty bar range on one audio track of a music project, where no other track "
     "plays. The takes arrive on a new clip, with the first one active. Runs on the local ACE-Step backend at no cost."},
    {"ui_timeline_music_regenerate", MusicTask::Repaint,
     "Regenerate a bar range inside one audio clip of a music project. The new takes replace only those bars, and the "
     "rest of the clip stays as it was. Runs on the local ACE-Step backend at no cost."},
    {"ui_timeline_music_add_instrument", MusicTask::Lego,
     "Add an instrument to an empty bar range on one audio track of a music project, following what the other audible "
     "tracks play there. The track's music role names the instrument. Runs on the local ACE-Step backend at no cost."},
}};

const Tool* findTool(const QString& name) {
    const auto found = std::ranges::find_if(kTools, [&](const Tool& tool) { return name == QLatin1String(tool.name); });
    return found == kTools.end() ? nullptr : &*found;
}
QString toolFor(MusicTask task) {
    for (const auto& tool : kTools) {
        if (tool.task == task) return QString::fromLatin1(tool.name);
    }
    return {};
}
QJsonObject failure(const QString& error) { return {{"ok", false}, {"error", error}}; }
QString taskText(MusicTask task) {
    const auto name = taskName(task);
    return QString::fromLatin1(name.data(), static_cast<qsizetype>(name.size()));
}

// A whole number from `min` to `max`, or nullopt.
std::optional<double> wholeNumber(const QJsonValue& value, double min, double max) {
    if (!value.isDouble()) return std::nullopt;
    const double number = value.toDouble();
    if (!std::isfinite(number) || std::floor(number) != number || number < min || number > max) return std::nullopt;
    return number;
}

QString resolveTrack(const QString& input, const QJsonArray& tracks, QString* error) {
    QStringList ids;
    for (const auto& value : tracks) ids.append(value.toObject().value("id").toString());
    if (const auto match = nt::aiassist::resolveId(input, ids)) return *match;
    static const QRegularExpression shortId(QStringLiteral("^[0-9a-f]{12}$"));
    if (shortId.match(input).hasMatch() &&
        std::ranges::count_if(ids, [&](const QString& id) { return id.startsWith(input); }) > 1) {
        *error = QStringLiteral("Track %1 matches more than one track. Pass the full id.").arg(input);
    } else {
        *error = QStringLiteral("Track %1 is not on this timeline. Read ui_timeline_get_state and pass its id.").arg(input);
    }
    return {};
}

}  // namespace

QVariantList tools() {
    QVariantList out;
    for (const auto& tool : kTools) {
        QVariantMap model{{"type", "string"},
                          {"description", tool.task == MusicTask::Lego
                                              ? QStringLiteral("The model. Add instrument runs on the base model only.")
                                              : QStringLiteral("The model. Defaults to the turbo model.")}};
        model.insert("enum", tool.task == MusicTask::Lego ? QVariantList{kBaseModel} : QVariantList{kTurboModel, kBaseModel});
        const QVariantMap properties{
            {"timeline_id", QVariantMap{{"type", "string"}}},
            {"track_id", QVariantMap{{"type", "string"}, {"description", "The audio track, by the id ui_timeline_get_state returns."}}},
            {"start_bar", QVariantMap{{"type", "integer"}, {"minimum", 1}, {"description", "The first bar of the range. Bar 1 starts at the tempo offset."}}},
            {"end_bar", QVariantMap{{"type", "integer"}, {"minimum", 1},
                                    {"description", "The last bar of the range, included. start_bar 1 and end_bar 4 select four bars."}}},
            {"prompt", QVariantMap{{"type", "string"}, {"description", "What the music sounds like: genre, instruments, mood."}}},
            {"candidates", QVariantMap{{"type", "integer"}, {"minimum", 1}, {"maximum", 4}, {"description", "How many takes to generate. Defaults to 2."}}},
            {"seed", QVariantMap{{"type", "integer"}, {"minimum", 0}, {"description", "A fixed seed. Defaults to a random one."}}},
            {"model", model},
        };
        out.append(QVariantMap{
            {"name", QString::fromLatin1(tool.name)},
            {"description", QString::fromLatin1(tool.description) +
                                QStringLiteral(" Returns the job id at once; the music panel's job list shows its progress.")},
            {"parameters", QVariantMap{{"type", "object"},
                                       {"properties", properties},
                                       {"required", QStringList{"timeline_id", "track_id", "start_bar", "end_bar", "prompt"}},
                                       {"additionalProperties", false}}}});
    }
    return out;
}

bool handles(const QString& name) { return findTool(name) != nullptr; }

QJsonObject run(const QString& name, const QJsonObject& args, TimelineModel& model, MusicJobs& jobs) {
    const auto* tool = findTool(name);
    if (!tool) return failure(QStringLiteral("There is no music tool %1.").arg(name));
    const auto& raw = model.timeline().raw;
    if (!isMusicSequence(raw)) {
        return failure(QStringLiteral("This sequence is not a music project. A person creates one with File > New Music Project."));
    }
    if (!args.value("track_id").isString() || args.value("track_id").toString().isEmpty()) {
        return failure(QStringLiteral("track_id must be a track id from ui_timeline_get_state."));
    }
    QString trackError;
    const auto trackId = resolveTrack(args.value("track_id").toString(), raw.value("tracks").toArray(), &trackError);
    if (trackId.isEmpty()) return failure(trackError);
    const auto startBar = wholeNumber(args.value("start_bar"), 1, kMaxBar);
    const auto endBar = wholeNumber(args.value("end_bar"), 1, kMaxBar);
    if (!startBar || !endBar) {
        return failure(QStringLiteral("start_bar and end_bar must be whole bar numbers from 1 to %1.").arg(kMaxBar));
    }
    if (*endBar < *startBar) return failure(QStringLiteral("end_bar must be at or after start_bar."));
    const auto prompt = args.value("prompt").toString().trimmed();
    if (!args.value("prompt").isString() || prompt.isEmpty()) return failure(QStringLiteral("prompt must describe the music."));
    int candidates = kDefaultCandidates;
    if (args.contains("candidates")) {
        const auto value = wholeNumber(args.value("candidates"), 1, 4);
        if (!value) return failure(QStringLiteral("candidates must be from 1 to 4."));
        candidates = static_cast<int>(*value);
    }
    double seed = -1;
    if (args.contains("seed")) {
        // A seed the request carries as a whole number.
        const auto value = wholeNumber(args.value("seed"), 0, 4294967295.0);
        if (!value) return failure(QStringLiteral("seed must be a whole number from 0 to 4294967295."));
        seed = *value;
    }
    const QStringList models = tool->task == MusicTask::Lego ? QStringList{kBaseModel} : QStringList{kTurboModel, kBaseModel};
    QString modelName = models.first();
    if (args.contains("model")) {
        modelName = args.value("model").toString();
        if (!models.contains(modelName)) return failure(QStringLiteral("model must be one of %1.").arg(models.join(", ")));
    }

    // The frame math needs a tempo it can read; the planner states the rule.
    // A sequence with no tempo object reads at DEFAULT_TEMPO, as in the panel and MusicJobs.
    auto tempo = tempoFromJson(raw.value("tempo").toObject());
    if (const auto sequence = sequenceTempo(raw)) tempo = *sequence;
    if (const auto refusal = musicTempoRefusal(tempo); !refusal.empty()) {
        auto refused = failure(QString::fromStdString(refusal));
        refused.insert("refusal", "tempo");
        return refused;
    }
    const auto startFrame = barStartFrame(static_cast<std::int64_t>(*startBar), tempo);
    const auto endFrame = barStartFrame(static_cast<std::int64_t>(*endBar) + 1, tempo);

    // The plan the panel shows for this range, for the refusal and the tools that would fit.
    const QJsonObject planJson{{"tempo", raw.value("tempo")},
                               {"selection", QJsonObject{{"trackId", trackId},
                                                         {"startFrame", static_cast<double>(startFrame)},
                                                         {"endFrame", static_cast<double>(endFrame)}}},
                               {"tracks", raw.value("tracks")},
                               {"clips", model.clipsJson()},
                               {"operation", taskText(tool->task)}};
    auto planInput = planInputFromJson(planJson);
    static_cast<MusicTempo&>(planInput.tempo) = tempo;
    const auto plan = planMusicOperation(planInput);
    if (!plan.refusal.empty()) {
        auto refused = failure(QString::fromStdString(plan.reason));
        refused.insert("refusal", QString::fromStdString(plan.refusal));
        QJsonArray valid;
        for (const auto task : plan.valid) valid.append(toolFor(task));
        refused.insert("valid_tools", valid);
        return refused;
    }

    const auto jobId = jobs.submit(trackId, static_cast<double>(startFrame), static_cast<double>(endFrame),
                                   taskText(tool->task),
                                   prompt, candidates, seed, modelName);
    if (jobId.isEmpty()) return failure(jobs.error());
    const auto job = QJsonObject::fromVariantMap(jobs.job(jobId));
    return {{"ok", true},
            {"job_id", jobId},
            {"operation", toolFor(tool->task)},
            {"state", job.value("state")},
            {"clip_id", job.value("clipId")},
            {"track_id", trackId},
            {"start_bar", *startBar},
            {"end_bar", *endBar},
            {"start_frame", static_cast<double>(startFrame)},
            {"end_frame", static_cast<double>(endFrame)},
            {"candidates", candidates},
            {"model", modelName},
            {"reason", QString::fromStdString(plan.reason)}};
}

}  // namespace nt::music::assistant
