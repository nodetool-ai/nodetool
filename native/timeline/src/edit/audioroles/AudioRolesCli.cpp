// `nodetool-timeline <fixture.json> --audio-roles match|normalize|duck [options]`: the Match loudness, Normalize and Duck
// music actions without a window, for scripts and tests. It measures the document, applies the same edit the panel applies
// (setClipsVolumeDb or applyDucking) and writes the resulting document, so `--render-audio` can render it. Prints a JSON
// report on stdout.
//   --clips ID[,ID]     the clips to act on (default: every clip the action applies to)
//   --out FILE          write the edited document here
//   --target DB         normalize: LUFS or, with --mode peak, dBFS
//   --mode loudness|peak
//   --reduce DB --sensitivity N --fade S --against ROLE[,ROLE]   ducking settings
//   --target-DIALOGUE, ... not supported: match uses the default role targets (-23, -25, -21, -30 LUFS)

#include "AudioRoleJson.h"
#include "RoleAnalysis.h"
#include "app/CliModes.h"
#include "app/EditRegistry.h"
#include "model/TimelineJson.h"

#include <QCommandLineParser>
#include <QCoreApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cstdio>

namespace {

using namespace nt::audioroles;

int audioRolesCli(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument("fixture", "Timeline JSON file");
    const QCommandLineOption action("audio-roles", "match, normalize or duck", "ACTION");
    const QCommandLineOption clips("clips", "Clip ids, comma separated", "IDS");
    const QCommandLineOption out("out", "Write the edited document", "FILE");
    const QCommandLineOption target("target", "Normalize target", "DB");
    const QCommandLineOption mode("mode", "loudness or peak", "MODE", "loudness");
    const QCommandLineOption reduce("reduce", "Ducking depth in dB", "DB", "15");
    const QCommandLineOption sensitivity("sensitivity", "Ducking sensitivity, 0 to 10", "N", "6");
    const QCommandLineOption fade("fade", "Ducking fade in seconds", "S", "0.8");
    const QCommandLineOption against("against", "Trigger roles, comma separated", "ROLES", "dialogue");
    parser.addOptions({action, clips, out, target, mode, reduce, sensitivity, fade, against});
    parser.process(app);
    if (parser.positionalArguments().size() != 1) {
        std::fprintf(stderr, "usage: nodetool-timeline <fixture.json> --audio-roles match|normalize|duck [--clips IDS] [--out FILE]\n");
        return 2;
    }
    const auto loaded = nt::loadTimelineFile(parser.positionalArguments().first());
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    const nt::Timeline& timeline = *loaded.timeline;
    const QString what = parser.value(action);
    std::vector<std::string> ids;
    for (const auto& id : parser.value(clips).split(',', Qt::SkipEmptyParts)) ids.push_back(id.toStdString());
    const auto wants = [&](const nt::Clip& clip, const std::function<bool(const QString&)>& role) {
        if (!soundingType(clip.raw.value("mediaType").toString()) || !role(effectiveRole(clip.raw))) return false;
        return ids.empty() || std::find(ids.begin(), ids.end(), clip.id) != ids.end();
    };
    const auto never = [] { return false; };
    QJsonObject doc = timeline.raw;
    QJsonObject report{{"action", what}};
    std::vector<std::string> list;
    if (what == u"match" || what == u"normalize") {
        for (const auto& clip : timeline.clips) {
            if (wants(clip, [&](const QString& role) { return what == u"normalize" || !role.isEmpty(); })) list.push_back(clip.id);
        }
        const bool peak = parser.value(mode) == u"peak";
        const double wanted = parser.value(target).toDouble();
        const Goal goal{[&](const nt::Clip& clip) { return what == u"normalize" ? wanted : defaultTargetLufs(effectiveRole(clip.raw)); }, peak};
        const auto plan = volumesFor(measureClips(timeline, list, goal, never, {}));
        report.insert("clips", plan.rows);
        report.insert("silent", plan.silent);
        if (const auto edit = nt::app::findEdit("setClipsVolumeDb")) doc = edit(doc, {{"volumes", plan.volumes}});
    } else if (what == u"duck") {
        for (const auto& clip : timeline.clips) {
            if (wants(clip, [](const QString& role) { return role == u"music" || role == u"ambience"; })) list.push_back(clip.id);
        }
        DuckSettings settings;
        settings.reduceDb = parser.value(reduce).toDouble();
        settings.sensitivity = parser.value(sensitivity).toDouble();
        settings.fadeS = parser.value(fade).toDouble();
        settings.against = parser.value(against).split(',', Qt::SkipEmptyParts);
        const auto plans = planDucking(timeline, list, settings, never, {});
        QJsonArray rows;
        for (const auto& plan : plans) {
            QJsonArray points, regions, triggers;
            for (const auto& [t, v] : plan.points) points.append(QJsonObject{{"timeMs", t}, {"value", v}});
            for (const auto& [a, b] : plan.regionsMs) regions.append(QJsonArray{a, b});
            for (const auto& id : plan.triggerIds) triggers.append(QString::fromStdString(id));
            rows.append(QJsonObject{{"clipId", QString::fromStdString(plan.clipId)}, {"problem", plan.problem},
                                    {"baseDb", plan.baseDb}, {"regionsMs", regions}, {"points", points}, {"triggers", triggers}});
        }
        report.insert("clips", rows);
        if (const auto edit = nt::app::findEdit("applyDucking")) doc = edit(doc, duckingPayload(plans));
    } else {
        std::fprintf(stderr, "error: --audio-roles takes match, normalize or duck\n");
        return 2;
    }
    if (parser.isSet(out)) {
        QFile file(parser.value(out));
        if (!file.open(QIODevice::WriteOnly) || file.write(QJsonDocument(doc).toJson(QJsonDocument::Compact)) < 0) {
            std::fprintf(stderr, "error: cannot write %s\n", qPrintable(parser.value(out)));
            return 1;
        }
    }
    std::printf("%s\n", QJsonDocument(report).toJson(QJsonDocument::Compact).constData());
    return 0;
}

const bool registered = nt::app::registerCliMode({QStringLiteral("--audio-roles"), audioRolesCli});

}  // namespace
