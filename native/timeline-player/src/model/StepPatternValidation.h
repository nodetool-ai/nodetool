#pragma once

#include <QJsonArray>
#include <QJsonObject>
#include <QSet>
#include <QStringList>
#include <cmath>

namespace nt::midi {

// Stateless document validation. Runs on the caller's control or loading thread.
inline QStringList validateStoredStepPattern(const QJsonObject& pattern) {
    QStringList errors;
    const auto number = [&](const QJsonObject& object, const char* field, double lo, double hi, bool required = true) {
        const auto v = object.value(QLatin1String(field));
        if (!required && v.isUndefined()) return;
        const double n = v.toDouble(lo - 1);
        if (!v.isDouble() || !std::isfinite(n) || std::floor(n) != n || n < lo || n > hi) {
            errors.append(QStringLiteral("%1 must be an integer in %2..%3.").arg(QLatin1String(field)).arg(lo).arg(hi));
        }
    };
    const auto enumeration = [&](const QJsonObject& object, const char* field, const QStringList& choices, bool required = true) {
        const auto v = object.value(QLatin1String(field));
        if (!required && v.isUndefined()) return;
        if (!v.isString() || !choices.contains(v.toString())) errors.append(QStringLiteral("Invalid %1.").arg(QLatin1String(field)));
    };
    const auto boolean = [&](const QJsonObject& object, const char* field, bool required = true) {
        const auto v = object.value(QLatin1String(field));
        if ((!v.isUndefined() || required) && !v.isBool()) errors.append(QStringLiteral("%1 must be boolean.").arg(QLatin1String(field)));
    };
    const QStringList rates{"4", "2", "1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", "1T", "2T", "4T", "8T", "16T", "32T", "1D", "2D", "4D", "8D", "16D", "32D", "64D"};
    const QStringList playback{"forward", "backward", "pingPong", "pendulum", "wander", "shuffle", "random"};
    const QStringList modes{"onOff", "velocity", "value", "gate", "tie", "note", "octave", "repeat", "chance", "offset", "stepRate", "skip", "loop"};
    const auto settings = [&](const QJsonObject& object) {
        enumeration(object, "stepRate", rates);
        enumeration(object, "playback", playback);
        enumeration(object, "automationMode", {"latch", "slide"});
        number(object, "midiChannel", 1, 16);
    };
    settings(pattern);
    number(pattern, "version", 1, 1);
    number(pattern, "seed", 0, 4294967295.0);
    number(pattern, "lengthSteps", 1, 64);
    number(pattern, "swing", 0, 100);
    enumeration(pattern, "swingDivision", {"1/8", "1/16"});
    enumeration(pattern, "pitchSource", {"off", "key", "chords"});
    enumeration(pattern, "scale", {"chromatic", "major", "minor", "dorian", "mixolydian", "phrygian", "lydian", "locrian", "harmMinor", "melMinor", "phrygDom", "lydDom", "locrian2", "altered", "wholeTone", "dimHW", "dimWH", "majPent", "minPent", "blues"});
    enumeration(pattern, "rowSort", {"none", "typeAsc", "typeDesc", "typeAndNoteAsc", "typeAndNoteDesc", "typeAndNameAsc", "typeAndNameDesc", "typeAndKitPadAsc", "typeAndKitPadDesc"}, false);
    for (const char* field : {"legato", "noTranspose", "scaleQuantize", "mono"}) boolean(pattern, field);
    if (!pattern.value(u"name").isString()) errors.append("name must be text.");
    if (pattern.contains(u"key")) {
        if (!pattern.value(u"key").isObject()) errors.append("key must be an object.");
        const auto key = pattern.value(u"key").toObject();
        number(key, "tonic", 0, 11);
        enumeration(key, "mode", {"major", "minor"});
    }
    if (!pattern.value(u"rows").isArray()) errors.append("rows must be an array.");
    const auto rows = pattern.value(u"rows").toArray();
    if (rows.size() > 128) errors.append("A pattern supports at most 128 rows.");
    QSet<QString> ids;
    for (const auto& rv : rows) {
        if (!rv.isObject()) errors.append("row must be an object.");
        const auto row = rv.toObject();
        const auto id = row.value(u"id").toString();
        if (id.isEmpty() || ids.contains(id)) errors.append("Row ids must be nonempty and unique.");
        ids.insert(id);
        settings(row);
        for (const char* field : {"name", "color"}) {
            const auto text = row.value(QLatin1String(field));
            if (!text.isUndefined() && !text.isString()) {
                errors.append(QStringLiteral("Row %1 must be text.").arg(QLatin1String(field)));
            }
        }
        number(row, "lengthSteps", 1, 64);
        number(row, "loopStart", 0, 63);
        number(row, "loopEnd", 1, row.value(u"lengthSteps").toDouble());
        if (row.value(u"loopStart").toDouble() >= row.value(u"loopEnd").toDouble()) errors.append("Invalid row loop range.");
        boolean(row, "mute"); boolean(row, "solo"); boolean(row, "subrowsExpanded", false);
        if (!row.value(u"subrows").isArray()) errors.append("subrows must be an array.");
        QSet<QString> seen;
        for (const auto& v : row.value(u"subrows").toArray()) {
            if (!v.isString() || !modes.contains(v.toString()) || seen.contains(v.toString())) errors.append("Invalid or duplicate subrow.");
            seen.insert(v.toString());
        }
        const auto assignment = row.value(u"assignment").toObject();
        enumeration(assignment, "type", {"note", "melodic", "kit", "degree", "automation"});
        const auto type = assignment.value(u"type").toString();
        if (type == u"note" || type == u"melodic") number(assignment, "pitch", 0, 127);
        if (type == u"kit") number(assignment, "pad", 0, 15);
        if (type == u"degree") {
            enumeration(assignment, "degree", {"root", "2nd", "3rd", "4th", "5th", "6th", "7th"});
            number(assignment, "octave", -2, 8);
        }
        if (type == u"automation") {
            const auto target = assignment.value(u"target").toObject();
            enumeration(target, "kind", {"cc", "pitchBend", "channelPressure", "device"});
            if (target.value(u"kind").toString() == u"cc") number(target, "cc", 0, 127);
            if (target.value(u"kind").toString() == u"device") {
                for (const char* field : {"deviceId", "param"}) {
                    if (target.value(QLatin1String(field)).toString().isEmpty()) errors.append("Device target needs deviceId and param.");
                }
            }
        }
        if (!row.value(u"steps").isArray()) errors.append("steps must be an array.");
        const auto steps = row.value(u"steps").toArray();
        if (steps.size() != row.value(u"lengthSteps").toDouble()) errors.append("steps must match lengthSteps.");
        for (const auto& sv : steps) {
            if (!sv.isObject()) errors.append("step must be an object.");
            const auto step = sv.toObject();
            for (const char* field : {"on", "tie", "skip"}) boolean(step, field, false);
            number(step, "velocity", 1, 127, false); number(step, "gate", 1, 100, false);
            number(step, "note", -12, 12, false); number(step, "octave", -2, 8, false);
            number(step, "repeat", 1, 16, false); number(step, "chance", 0, 100, false);
            number(step, "offset", -50, 50, false); number(step, "midiChannel", 1, 16, false);
            number(step, "articulation", 0, 255, false);
            for (const char* field : {"velocityRamp", "velocityCurve", "distribution"}) number(step, field, -100, 100, false);
            enumeration(step, "stepRate", rates, false);
            if (step.contains(u"value") && (!step.value(u"value").isDouble() || !std::isfinite(step.value(u"value").toDouble()))) errors.append("value must be finite.");
            if (step.contains(u"condition")) {
                const auto condition = step.value(u"condition").toObject();
                enumeration(condition, "type", {"always", "first", "last", "recurrence"});
                if (condition.value(u"type").toString() == u"recurrence") {
                    number(condition, "cycles", 2, 16);
                    number(condition, "iteration", 1, condition.value(u"cycles").toDouble());
                }
            }
        }
    }
    return errors;
}

}  // namespace nt::midi
