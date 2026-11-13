// The music oracle: answers frame math, planner and tempo rule requests with
// the C++ port, so music-oracle.test.ts can compare them with the TypeScript.
// Reads a JSON array of {fn, args} on stdin and writes the results as a JSON
// array on stdout. A thrown error answers {error}.

#include "music/MusicDocument.h"
#include "music/MusicPlan.h"
#include "music/MusicTime.h"

#include <QCoreApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>

#include <cmath>
#include <exception>
#include <iostream>
#include <limits>

namespace {
using namespace nt::music;

GridDivision division(const QJsonValue& value) {
    return value.toString() == u"beat" ? GridDivision::Beat : GridDivision::Bar;
}

std::int64_t integer(const QJsonValue& value) { return static_cast<std::int64_t>(value.toDouble()); }

QJsonValue refusalValue(const QString& message) { return message.isEmpty() ? QJsonValue(QJsonValue::Null) : QJsonValue(message); }

QJsonValue answer(const QString& fn, const QJsonArray& args) {
    if (fn == u"barStartFrame") {
        return static_cast<qint64>(barStartFrame(integer(args.at(0)), tempoFromJson(args.at(1).toObject())));
    }
    if (fn == u"barStartFrameRange") {
        const auto tempo = tempoFromJson(args.at(2).toObject());
        QJsonArray frames;
        for (auto bar = integer(args.at(0)); bar <= integer(args.at(1)); ++bar) {
            frames.append(static_cast<qint64>(barStartFrame(bar, tempo)));
        }
        return frames;
    }
    if (fn == u"beatStartFrame") {
        return static_cast<qint64>(beatStartFrame(integer(args.at(0)), tempoFromJson(args.at(1).toObject())));
    }
    if (fn == u"beatLengthFrames") {
        return static_cast<qint64>(beatLengthFrames(tempoFromJson(args.at(0).toObject())));
    }
    if (fn == u"frameToMs") {
        return frameToMs(integer(args.at(0)));
    }
    if (fn == u"msToFrame") {
        return static_cast<qint64>(msToFrame(args.at(0).toDouble()));
    }
    if (fn == u"gridLineAtOrBefore" || fn == u"gridLineAtOrAfter" || fn == u"snapFrameToGrid") {
        const auto frame = integer(args.at(0));
        const auto tempo = tempoFromJson(args.at(1).toObject());
        const auto d = division(args.at(2));
        const auto result = fn == u"gridLineAtOrBefore" ? gridLineAtOrBefore(frame, tempo, d)
                            : fn == u"gridLineAtOrAfter" ? gridLineAtOrAfter(frame, tempo, d)
                                                         : snapFrameToGrid(frame, tempo, d);
        return static_cast<qint64>(result);
    }
    if (fn == u"planMusicOperation") {
        return planToJson(planMusicOperation(planInputFromJson(args.at(0).toObject())));
    }
    if (fn == u"musicTempoRefusal") {
        return refusalValue(QString::fromStdString(musicTempoRefusal(tempoFromJson(args.at(0).toObject()))));
    }
    if (fn == u"isTempoLocked") {
        return isTempoLocked(args.at(0).toObject());
    }
    if (fn == u"tempoChangeRefusal") {
        return refusalValue(tempoChangeRefusal(args.at(0).toObject(), args.at(1).toObject()));
    }
    if (fn == u"musicRoleLabel") {
        const auto role = args.at(0).toString().toStdString();
        return QString::fromUtf8(musicRoleLabel(role).data(), static_cast<qsizetype>(musicRoleLabel(role).size()));
    }
    throw std::invalid_argument("unknown function " + fn.toStdString());
}
} // namespace

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) {
        return 2;
    }
    QJsonParseError error;
    const auto document = QJsonDocument::fromJson(input.readAll(), &error);
    if (error.error != QJsonParseError::NoError || !document.isArray()) {
        std::cerr << "Expected a JSON array of music requests\n";
        return 2;
    }
    QJsonArray results;
    for (const auto& value : document.array()) {
        const auto request = value.toObject();
        try {
            results.append(answer(request.value(u"fn").toString(), request.value(u"args").toArray()));
        } catch (const std::exception& failure) {
            results.append(QJsonObject{{"error", QString::fromUtf8(failure.what())}});
        }
    }
    QFile output;
    if (!output.open(stdout, QIODevice::WriteOnly)) {
        return 2;
    }
    output.write(QJsonDocument(results).toJson(QJsonDocument::Compact));
    return 0;
}
