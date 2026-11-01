#include "edit/OpCli.h"

#include "edit/ClipOps.h"
#include "edit/EditActions.h"
#include "edit/Keymap.h"

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cstdio>

namespace nt::edit {

namespace {

ClipList clipsFrom(const QJsonValue& v) {
    ClipList out;
    for (const QJsonValue& c : v.toArray()) out.push_back(c.toObject());
    return out;
}

QJsonArray clipsJson(const ClipList& clips) {
    QJsonArray out;
    for (const auto& c : clips) out.append(c);
    return out;
}

IdSet idsFrom(const QJsonValue& v) {
    IdSet out;
    for (const QJsonValue& id : v.toArray()) out.insert(id.toString());
    return out;
}

RippleOptions optionsFrom(const QJsonValue& v) {
    const QJsonObject o = v.toObject();
    RippleOptions options;
    options.lockedTrackIds = idsFrom(o.value(u"lockedTrackIds"));
    options.lockedClipIds = idsFrom(o.value(u"lockedClipIds"));
    options.followLinks = o.value(u"followLinks").toBool(true);
    return options;
}

std::optional<double> optionalNumber(const QJsonValue& v) {
    return v.isDouble() ? std::optional<double>(v.toDouble()) : std::nullopt;
}

std::vector<double> numbers(const QJsonValue& v) {
    std::vector<double> out;
    for (const QJsonValue& n : v.toArray()) out.push_back(n.toDouble());
    return out;
}

// A source-duration callback from a {clipId: durationMs} map.
SourceDurationFor sourceMapFrom(const QJsonValue& v) {
    const QJsonObject map = v.toObject();
    return [map](const QJsonObject& clip) -> std::optional<double> {
        const QJsonValue d = map.value(clipId(clip));
        return d.isDouble() ? std::optional<double>(d.toDouble()) : std::nullopt;
    };
}

QJsonValue call(const QString& fn, const QJsonArray& a) {
    if (fn == u"rateStretchClips") {
        return clipsJson(rateStretchClips(clipsFrom(a.at(0)), idsFrom(a.at(1)), a.at(2).toString(), a.at(3).toString(),
                                          a.at(4).toDouble()));
    }
    if (fn == u"slideDeltaLimit") {
        return slideDeltaLimit(clipsFrom(a.at(0)), idsFrom(a.at(1)), a.at(2).toDouble(), sourceMapFrom(a.at(3)));
    }
    if (fn == u"slideClips") {
        return clipsJson(slideClips(clipsFrom(a.at(0)), idsFrom(a.at(1)), a.at(2).toDouble(), sourceMapFrom(a.at(3))));
    }
    if (fn == u"slipSourceWindow") {
        return slipSourceWindow(a.at(0).toObject(), a.at(1).toDouble(), optionalNumber(a.at(2)));
    }
    if (fn == u"trackSelectIds") {
        return QJsonArray::fromStringList(
            trackSelectIds(clipsFrom(a.at(0)), a.at(1).toDouble(), a.at(2).toString(), a.at(3).toString()));
    }
    if (fn == u"trimClip") {
        return trimClip(a.at(0).toObject(), a.at(1).toString(), a.at(2).toDouble(), optionalNumber(a.at(3)));
    }
    if (fn == u"splitClip") {
        const auto [l, r] = splitClip(a.at(0).toObject(), a.at(1).toDouble());
        return QJsonArray{l, r};
    }
    if (fn == u"planShift") {
        const auto out = planShift(clipsFrom(a.at(0)), a.at(1).toDouble(), a.at(2).toDouble(), idsFrom(a.at(3)),
                                   optionsFrom(a.at(4)));
        return out ? QJsonValue(clipsJson(*out)) : QJsonValue(QJsonValue::Null);
    }
    if (fn == u"shiftClipsFrom") {
        return clipsJson(shiftClipsFrom(clipsFrom(a.at(0)), a.at(1).toDouble(), a.at(2).toDouble(), idsFrom(a.at(3)),
                                        optionsFrom(a.at(4))));
    }
    if (fn == u"rippleTrim") {
        return clipsJson(rippleTrim(clipsFrom(a.at(0)), a.at(1).toString(), a.at(2).toString(), a.at(3).toDouble(),
                                    optionsFrom(a.at(4)),
                                    optionalNumber(a.at(4).toObject().value(u"maxSourceDurationMs"))));
    }
    if (fn == u"findRollNeighbour") {
        const ClipList clips = clipsFrom(a.at(0));
        const int i = findRollNeighbour(clips, a.at(1).toObject(), a.at(2).toString());
        return i < 0 ? QJsonValue(QJsonValue::Null) : QJsonValue(clips[static_cast<size_t>(i)]);
    }
    if (fn == u"rollEdit") {
        return clipsJson(rollEdit(clipsFrom(a.at(0)), a.at(1).toString(), a.at(2).toString(), a.at(3).toDouble(),
                                  a.at(4).toObject().value(u"followLinks").toBool(true)));
    }
    if (fn == u"rippleDelete") {
        return clipsJson(rippleDelete(clipsFrom(a.at(0)), idsFrom(a.at(1)), optionsFrom(a.at(2))));
    }
    if (fn == u"findGap") {
        const auto gap = findGap(clipsFrom(a.at(0)), a.at(1).toString(), a.at(2).toDouble());
        return gap ? QJsonValue(QJsonObject{{QStringLiteral("startMs"), gap->startMs},
                                            {QStringLiteral("endMs"), gap->endMs}})
                   : QJsonValue(QJsonValue::Null);
    }
    if (fn == u"closeGap") {
        return clipsJson(closeGap(clipsFrom(a.at(0)), a.at(1).toString(), a.at(2).toDouble(), optionsFrom(a.at(3))));
    }
    if (fn == u"resolveOverwrite") {
        return clipsJson(resolveOverwrite(clipsFrom(a.at(0)), idsFrom(a.at(1)), optionsFrom(a.at(2))));
    }
    if (fn == u"resolveInsert") {
        return clipsJson(resolveInsert(clipsFrom(a.at(0)), idsFrom(a.at(1)), optionsFrom(a.at(2))));
    }
    if (fn == u"resolveDrop") {
        return clipsJson(
            resolveDrop(clipsFrom(a.at(0)), idsFrom(a.at(1)), a.at(2).toString(), optionsFrom(a.at(3))));
    }
    if (fn == u"snap") {
        return snap(a.at(0).toDouble(), numbers(a.at(1)), a.at(2).toDouble(), a.at(3).toDouble());
    }
    if (fn == u"resolveSnap") {
        const SnapResolution r = resolveSnap(a.at(0).toDouble(), numbers(a.at(1)), a.at(2).toDouble(), a.at(3).toDouble());
        return QJsonObject{{QStringLiteral("value"), r.value},
                           {QStringLiteral("snapped"), r.snapped},
                           {QStringLiteral("distanceMs"), r.distanceMs},
                           {QStringLiteral("distancePx"), r.distancePx}};
    }
    if (fn == u"buildSnapPoints") {
        const QJsonObject s = a.at(0).toObject();
        const ClipList clips = clipsFrom(s.value(u"clips"));
        SnapPointSource source;
        if (s.contains(u"clips")) source.clips = &clips;
        for (const QJsonValue& m : s.value(u"markers").toArray()) source.markers.push_back(m.toObject().value(u"timeMs").toDouble());
        source.playheadMs = optionalNumber(s.value(u"playheadMs"));
        source.tickIntervalMs = s.value(u"tickIntervalMs").toDouble(0);
        source.maxTimeMs = s.value(u"maxTimeMs").toDouble(0);
        source.excludeClipIds = idsFrom(s.value(u"excludeClipIds"));
        QJsonArray out;
        for (double t : buildSnapPoints(source)) out.append(t);
        return out;
    }
    if (fn == u"storeAction") {
        // args: [{clips, tracks:[{id,type,locked}], linkedSelection}, action, ...params]
        const QJsonObject state = a.at(0).toObject();
        EditDoc doc;
        doc.clips = clipsFrom(state.value(u"clips"));
        for (const QJsonValue& t : state.value(u"tracks").toArray()) {
            const QJsonObject o = t.toObject();
            doc.tracks.push_back({o.value(u"id").toString(), o.value(u"type").toString(), o.value(u"locked").toBool()});
        }
        const bool linked = state.value(u"linkedSelection").toBool(true);
        const QString action = a.at(1).toString();
        const auto strings = [](const QJsonValue& v) {
            QStringList out;
            for (const QJsonValue& s : v.toArray()) out.append(s.toString());
            return out;
        };
        const auto ids = [&](const QJsonValue& v) {
            const QStringList l = strings(v);
            return IdSet(l.begin(), l.end());
        };
        if (action == u"moveClip") {
            return clipsJson(moveClip(doc, a.at(2).toString(), a.at(3).toDouble(), a.at(4).toString(), linked));
        }
        if (action == u"moveSelectedClips") {
            return clipsJson(moveSelectedClips(doc, a.at(2).toString(), strings(a.at(3)), a.at(4).toDouble(),
                                               a.at(5).toString(), linked));
        }
        if (action == u"trimClipStart") return clipsJson(trimClipStart(doc, a.at(2).toString(), a.at(3).toDouble(), linked));
        if (action == u"trimClipEnd") {
            return clipsJson(trimClipEnd(doc, a.at(2).toString(), a.at(3).toDouble(), optionalNumber(a.at(4)), linked));
        }
        if (action == u"rippleTrimClipStart") {
            return clipsJson(rippleTrimClipStart(doc, a.at(2).toString(), a.at(3).toDouble(), linked));
        }
        if (action == u"rippleTrimClipEnd") {
            return clipsJson(
                rippleTrimClipEnd(doc, a.at(2).toString(), a.at(3).toDouble(), optionalNumber(a.at(4)), linked));
        }
        if (action == u"rollClipEdge") {
            return clipsJson(rollClipEdge(doc, a.at(2).toString(), a.at(3).toString(), a.at(4).toDouble(),
                                          optionalNumber(a.at(5)), linked));
        }
        if (action == u"deleteSelected") return clipsJson(deleteSelected(doc, ids(a.at(2))));
        if (action == u"rippleDeleteSelected") return clipsJson(rippleDeleteSelected(doc, ids(a.at(2))));
        if (action == u"splitClipAtTime") {
            return clipsJson(splitClipAtTime(doc, a.at(2).toString(), a.at(3).toDouble()));
        }
        if (action == u"splitSelectedAtPlayhead") {
            const SplitResult r = splitSelectedAtPlayhead(doc, a.at(2).toDouble(), strings(a.at(3)));
            return QJsonObject{{QStringLiteral("clips"), clipsJson(r.clips)},
                               {QStringLiteral("rightHalfIds"), QJsonArray::fromStringList(r.rightHalfIds)}};
        }
        if (action == u"resolveDrop") {
            return clipsJson(resolveDropAction(doc, ids(a.at(2)), a.at(3).toString()));
        }
        if (action == u"rateStretchClip") {
            return clipsJson(rateStretchClip(doc, a.at(2).toString(), a.at(3).toString(), a.at(4).toDouble(), linked));
        }
        if (action == u"slideClip") {
            return clipsJson(slideClip(doc, a.at(2).toString(), a.at(3).toDouble(), linked, sourceMapFrom(a.at(4))));
        }
        if (action == u"planSlip") {
            QJsonObject clip;
            for (const auto& c : doc.clips) {
                if (clipId(c) == a.at(2).toString()) clip = c;
            }
            const auto patches = planSlip(doc, clip, a.at(3).toDouble(), optionalNumber(a.at(4)), linked);
            if (!patches) return QJsonValue(QJsonValue::Null);
            QJsonArray out;
            for (const auto& p : *patches) {
                out.append(QJsonObject{{QStringLiteral("id"), p.id}, {QStringLiteral("patch"), p.patch}});
            }
            return out;
        }
        throw OpError(("unknown store action: " + action).toStdString());
    }
    if (fn == u"resolveTimelineActions") {
        // args: [[event, ...], preset] -> [action or null, ...]
        QJsonArray out;
        for (const QJsonValue& v : a.at(0).toArray()) {
            const QJsonObject e = v.toObject();
            KeyEventLike ev;
            ev.key = e.value(u"key").toString();
            ev.code = e.value(u"code").toString();
            ev.ctrlKey = e.value(u"ctrlKey").toBool();
            ev.metaKey = e.value(u"metaKey").toBool();
            ev.shiftKey = e.value(u"shiftKey").toBool();
            ev.altKey = e.value(u"altKey").toBool();
            const QString action = resolveTimelineAction(ev, a.at(1).toString());
            out.append(action.isEmpty() ? QJsonValue(QJsonValue::Null) : QJsonValue(action));
        }
        return out;
    }
    throw OpError(("unknown op function: " + fn).toStdString());
}

}  // namespace

int runOpCli() {
    QFile in;
    if (!in.open(stdin, QIODevice::ReadOnly)) {
        std::fprintf(stderr, "error: cannot read stdin\n");
        return 2;
    }
    const QJsonObject request = QJsonDocument::fromJson(in.readAll()).object();
    QJsonObject response;
    try {
        response.insert(QStringLiteral("result"),
                        call(request.value(u"fn").toString(), request.value(u"args").toArray()));
    } catch (const std::exception& e) {
        response.insert(QStringLiteral("error"), QString::fromUtf8(e.what()));
    }
    const QByteArray out = QJsonDocument(response).toJson(QJsonDocument::Compact);
    std::fwrite(out.constData(), 1, static_cast<size_t>(out.size()), stdout);
    std::fputc('\n', stdout);
    return 0;
}

}  // namespace nt::edit

int main() {
    return nt::edit::runOpCli();
}
