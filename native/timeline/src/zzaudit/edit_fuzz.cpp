// Random-payload fuzzer for every registered document edit. Checks document invariants.
#include "app/EditRegistry.h"
#include "model/TimelineJson.h"

#include <QCoreApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSet>
#include <QHash>
#include <QTextStream>
#include <cmath>
#include <cstdio>
#include <random>

static std::mt19937_64 rng(12345);
static int R(int n) { return n <= 0 ? 0 : int(rng() % unsigned(n)); }

static QStringList clipIds(const QJsonObject& d) { QStringList r; for (auto v : d["clips"].toArray()) r << v.toObject()["id"].toString(); return r; }
static QStringList trackIds(const QJsonObject& d) { QStringList r; for (auto v : d["tracks"].toArray()) r << v.toObject()["id"].toString(); return r; }

static QJsonValue num(const QJsonObject& d) {
    static const double pool[] = {-1000, -1, 0, 0.4, 1, 16.7, 33.333, 100, 500, 999, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 8000, 10000, 1e7};
    if (R(3) == 0) {
        auto clips = d["clips"].toArray();
        if (!clips.isEmpty()) {
            auto c = clips[R(clips.size())].toObject();
            double s = c["startMs"].toDouble(), du = c["durationMs"].toDouble();
            double opts[] = {s, s + du, s + du / 2, s + 1, s + du - 1};
            return opts[R(5)];
        }
    }
    return pool[R(int(std::size(pool)))];
}
static QJsonValue idOf(const QStringList& ids) { if (ids.isEmpty() || R(10) == 0) return QStringLiteral("nope"); return ids[R(ids.size())]; }
static QJsonArray idsOf(const QStringList& ids) { QJsonArray a; int n = 1 + R(3); for (int i = 0; i < n; ++i) a.append(idOf(ids)); if (R(6)==0) a.append(a.first()); return a; }

static const char* KEYS[] = {"clipId","toTrackId","frames","offsetMs","maxSourceDurationMs","sourceDeltaMs","groups","source","heightPx","volumeDb","fadeInMs","opacity","trackId","text","durationMs","startMs","mode","selectedIds","atMs","clipIds","value","field","linked","speedMultiplier","speed","timeMs","timesMs","endMs","snapMs","ripple","ids","orderedIds","orderedClipIds","sourceTrackId","newTrackId","index","atIndex","edge","deltaMs","delta","deltaPx","inMs","outMs","sourceMs","sourceDurationMs","videoTrackId","audioTrackId","type","name","newIndex","oldIndex","db","videoClipId","audioClipId","newVideoTrack","newAudioTrack","untargetedTrackIds","syncLockOffTrackIds","patch","transition","effectId","role","volumes","zoom","x","y","width","height","kind","first","last","before","after","fps"};

static QJsonValue valueFor(const QString& k, const QJsonObject& d) {
    const auto clips = clipIds(d), tracks = trackIds(d);
    if (k == "clipId" || k == "videoClipId" || k == "audioClipId" || k=="first"||k=="last"||k=="before"||k=="after") return idOf(clips);
    if (k.endsWith("TrackId") || k == "trackId") return idOf(tracks);
    if (k == "selectedIds" || k == "clipIds" || k == "ids" || k == "orderedClipIds") return idsOf(clips);
    if (k == "orderedIds") { QJsonArray a; auto t = tracks; std::shuffle(t.begin(), t.end(), rng); for (auto& s : t) a.append(s); if (R(4)==0 && !a.isEmpty()) a.removeLast(); return a; }
    if (k == "untargetedTrackIds" || k == "syncLockOffTrackIds") return idsOf(tracks);
    if (k == "mode") { static const char* m[] = {"overwrite","insert","ripple","roll","slip","slide","rate","replace","peak","loudness","before","after","start","end",""}; return QString(m[R(15)]); }
    if (k == "edge") { static const char* m[] = {"start","end","left","right","in","out"}; return QString(m[R(6)]); }
    if (k == "type" || k == "kind") { static const char* m[] = {"video","audio","overlay","subtitle","midi","chord","crossfade","dipToColor","bogus"}; return QString(m[R(9)]); }
    if (k == "linked" || k == "ripple" || k == "newVideoTrack" || k == "newAudioTrack") return bool(R(2));
    if (k == "text" || k == "name" || k == "role" || k == "field") {
        static const char* m[] = {"Text","","volumeDb","opacity","startMs","durationMs","dialogue","music","name","speedMultiplier","fadeInMs","hidden"}; return QString(m[R(12)]); }
    if (k == "timesMs") { QJsonArray a; for (int i = 0; i < 1 + R(3); ++i) a.append(num(d)); return a; }
    if (k == "patch") { QJsonObject p; static const char* f[] = {"startMs","durationMs","inPointMs","trackId","opacity","speedMultiplier","volumeDb","fadeInMs","fadeOutMs","hidden","locked","id","linkId"}; for (int i=0;i<1+R(3);++i){ QString kk=f[R(13)]; p[kk]= kk=="trackId"? idOf(tracks) : kk=="id"||kk=="linkId" ? idOf(clips) : kk=="hidden"||kk=="locked" ? QJsonValue(bool(R(2))) : num(d);} return p; }
    if (k == "transition") return QJsonObject{{"type", "crossfade"}, {"durationMs", num(d)}};
    if (k == "volumes") { QJsonObject o; for (auto c : clips) if (R(2)) o[c] = num(d); return o; }
    return num(d);
}

static QJsonObject randomPayload(const QJsonObject& d) {
    QJsonObject p;
    for (auto k : KEYS) if (R(3) == 0) p[k] = valueFor(k, d);
    // most edits key off clipId/selectedIds, give them often
    if (R(2)) p["clipId"] = valueFor("clipId", d);
    if (R(2)) p["selectedIds"] = valueFor("selectedIds", d);
    if (R(3)==0) p["trackId"] = valueFor("trackId", d);
    return p;
}

struct Issue { QString edit; QString what; QJsonObject payload; QJsonObject before; };

static QStringList check(const QJsonObject& before, const QJsonObject& after) {
    QStringList out;
    auto parsed = nt::parseTimeline(after);
    if (!parsed.timeline) { out << "parse failed: " + parsed.error; return out; }
    const auto tlist = trackIds(after); QSet<QString> tracks(tlist.begin(), tlist.end());
    if (tracks.size() != after["tracks"].toArray().size()) out << "duplicate track id";
    QHash<QString, QJsonObject> byId;
    for (auto v : after["clips"].toArray()) {
        auto c = v.toObject(); auto id = c["id"].toString();
        if (id.isEmpty()) out << "clip without id";
        if (byId.contains(id)) out << "duplicate clip id " + id;
        byId.insert(id, c);
        const double s = c["startMs"].toDouble(), du = c["durationMs"].toDouble();
        if (!std::isfinite(s) || s < 0) out << QString("clip %1 bad startMs %2").arg(id).arg(s);
        if (!std::isfinite(du) || du <= 0) out << QString("clip %1 bad durationMs %2").arg(id).arg(du);
        if (c.contains("inPointMs") && (!std::isfinite(c["inPointMs"].toDouble()) || c["inPointMs"].toDouble() < -1e-6)) out << QString("clip %1 bad inPointMs %2").arg(id).arg(c["inPointMs"].toDouble());
        if (c.contains("speedMultiplier") && !(c["speedMultiplier"].toDouble() > 0)) out << QString("clip %1 bad speed %2").arg(id).arg(c["speedMultiplier"].toDouble());
        for (auto k : {"fadeInMs","fadeOutMs","volumeDb","opacity"}) if (c.contains(k) && !std::isfinite(c[k].toDouble())) out << QString("clip %1 non-finite %2").arg(id, k);
    }
    QHash<QString,QString> ttype; for (auto v : after["tracks"].toArray()) ttype[v.toObject()["id"].toString()] = v.toObject()["type"].toString();
    QHash<QString,QString> ttypeB; for (auto v : before["clips"].toArray()) ttypeB[v.toObject()["id"].toString()] = v.toObject()["trackId"].toString();
    for (auto& c : byId) {
        const auto mt = c["mediaType"].toString(), tt = ttype.value(c["trackId"].toString());
        bool fits = mt == "audio" ? tt == "audio" : mt == "midi" ? tt == "midi" : (tt == "video" || tt == "overlay" || (mt=="text" && tt=="subtitle"));
        if (!fits && ttypeB.value(c["id"].toString()) != c["trackId"].toString()) out << QString("misfit %1 %2 on %3").arg(c["id"].toString(), mt, tt);
    }
    for (auto& c : byId) {
        if (c.contains("parentId") && !byId.contains(c["parentId"].toString())) out << "dangling parentId on " + c["id"].toString();
    }
    // new overlaps on same track among top-level (no parentId) clips, excluding overlaps present before
    auto overlaps = [](const QJsonObject& d) {
        QSet<QString> r; auto a = d["clips"].toArray();
        for (int i = 0; i < a.size(); ++i) for (int j = i + 1; j < a.size(); ++j) {
            auto x = a[i].toObject(), y = a[j].toObject();
            if (x["trackId"] != y["trackId"] || x.contains("parentId") || y.contains("parentId")) continue;
            double xs = x["startMs"].toDouble(), xe = xs + x["durationMs"].toDouble(), ys = y["startMs"].toDouble(), ye = ys + y["durationMs"].toDouble();
            if (std::min(xe, ye) - std::max(xs, ys) > 0.5) { auto p = QStringList{x["id"].toString(), y["id"].toString()}; p.sort(); r.insert(p.join("|")); }
        }
        return r;
    };
    auto ob = overlaps(before), oa = overlaps(after);
    for (auto& p : oa) if (!ob.contains(p)) out << "new overlap " + p;
    // links: a linkId shared by exactly one clip
    QHash<QString,int> links; for (auto& c : byId) if (c.contains("linkId") && !c["linkId"].toString().isEmpty()) ++links[c["linkId"].toString()];
    QHash<QString,int> linksBefore; for (auto v : before["clips"].toArray()) { auto c=v.toObject(); if (c.contains("linkId") && !c["linkId"].toString().isEmpty()) ++linksBefore[c["linkId"].toString()]; }
    for (auto it = links.begin(); it != links.end(); ++it) if (it.value() == 1 && linksBefore.value(it.key()) != 1) out << "orphan linkId " + it.key();
    // locked tracks: no clip on a locked track may change
    QSet<QString> locked; for (auto v : before["tracks"].toArray()) if (v.toObject()["locked"].toBool()) locked.insert(v.toObject()["id"].toString());
    QHash<QString, QJsonObject> prev; for (auto v : before["clips"].toArray()) prev.insert(v.toObject()["id"].toString(), v.toObject());
    for (auto it = prev.begin(); it != prev.end(); ++it) {
        bool wasLocked = locked.contains(it->value("trackId").toString()) || it->value("locked").toBool();
        if (!wasLocked) continue;
        if (!byId.contains(it.key())) out << "locked clip removed " + it.key();
        else if (byId[it.key()] != *it) out << "locked clip changed " + it.key();
    }
    for (auto& c : byId) if (!prev.contains(c["id"].toString()) && locked.contains(c["trackId"].toString())) out << "clip added on locked track " + c["id"].toString();
    return out;
}

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (qEnvironmentVariableIsSet("REPRO")) {
        // REPRO=edit fixture payloadJson
        QFile file(argv[1]); file.open(QIODevice::ReadOnly);
        QJsonObject doc = QJsonDocument::fromJson(file.readAll()).object();
        QJsonObject payload = QJsonDocument::fromJson(QByteArray(argv[2])).object();
        auto edit = nt::app::findEdit(qEnvironmentVariable("REPRO"));
        if (!edit) { fprintf(stderr, "no edit\n"); return 2; }
        QJsonObject after = edit(doc, payload);
        if (after == doc) { printf("unchanged\n"); return 0; }
        for (const auto& issue : check(doc, after)) printf("ISSUE %s\n", qPrintable(issue));
        printf("%s\n", QJsonDocument(QJsonObject{{"clips", after["clips"]}, {"tracks", after["tracks"]}}).toJson(QJsonDocument::Indented).constData());
        return 0;
    }
    const int iters = argc > 2 ? atoi(argv[2]) : 300;
    QStringList files = QString(argv[1]).split(',');
    QStringList only = argc > 3 ? QString(argv[3]).split(',') : QStringList{};
    QHash<QString, QHash<QString, int>> counts;
    QHash<QString, QHash<QString, QPair<QJsonObject,QJsonObject>>> examples;
    QHash<QString,int> changedCount;
    auto names = nt::app::edits().keys(); names.sort();
    QTextStream err(stderr);
    for (const auto& f : files) {
        QFile file(f); file.open(QIODevice::ReadOnly);
        QJsonObject base = QJsonDocument::fromJson(file.readAll()).object();
        if (base.isEmpty()) { err << "bad fixture " << f << "\n"; continue; }
        // lock one track in a copy so locked invariants get exercised
        for (int variant = 0; variant < 2; ++variant) {
            QJsonObject doc0 = base;
            if (variant == 1) { auto t = doc0["tracks"].toArray(); if (t.size() > 1) { auto o = t[1].toObject(); o["locked"] = true; t[1] = o; doc0["tracks"] = t; } }
            for (const auto& name : names) {
                if (!only.isEmpty() && !only.contains(name)) continue;
                auto edit = nt::app::findEdit(name);
                QJsonObject doc = doc0;
                for (int i = 0; i < iters; ++i) {
                    if (i % 25 == 0) doc = doc0;
                    auto payload = randomPayload(doc);
                    err << ""; // keep
                    QJsonObject after;
                    try { after = edit(doc, payload); } catch (const std::exception& e) { if (!counts[name].contains("exception")) { QTextStream(stderr) << "EXC " << name << ": " << e.what() << "\n  payload " << QJsonDocument(payload).toJson(QJsonDocument::Compact) << "\n  fixture " << f << "\n  doc " << QJsonDocument(doc).toJson(QJsonDocument::Compact).left(20000) << "\n"; } counts[name]["exception"]++; continue; } catch (...) { counts[name]["exception"]++; continue; }
                    if (after == doc) continue;
                    changedCount[name]++;
                    for (const auto& issue : check(doc, after)) {
                        QString key = issue; key.replace(QRegularExpression("[0-9a-f]{32}|clip [^ ]+|[-0-9.e+]+$| [^ ]+\\|[^ ]+| [^ ]+$"), "");
                        key = issue.section(' ', 0, 1);
                        if (!counts[name].contains(key)) { examples[name][key] = {payload, doc}; if (qEnvironmentVariableIsSet("DUMP")) QTextStream(stderr) << "ISSUE " << name << ": " << issue << "\n  fixture " << f << "\n  payload " << QJsonDocument(payload).toJson(QJsonDocument::Compact) << "\n  before " << QJsonDocument(doc).toJson(QJsonDocument::Compact) << "\n  after " << QJsonDocument(after).toJson(QJsonDocument::Compact) << "\n"; }
                        counts[name][key]++;
                        if (!examples[name].contains(key + "#msg")) examples[name][key+"#msg"] = {QJsonObject{{"msg", issue}}, {}};
                    }
                    if (nt::parseTimeline(after).timeline) doc = after;
                }
            }
        }
    }
    QTextStream out(stdout);
    for (const auto& name : names) {
        if (counts[name].isEmpty()) continue;
        out << "== " << name << " (changed " << changedCount[name] << ")\n";
        for (auto it = counts[name].begin(); it != counts[name].end(); ++it) {
            auto ex = examples[name].value(it.key());
            out << "  " << it.key() << " x" << it.value() << " e.g. " << examples[name].value(it.key()+"#msg").first["msg"].toString() << "\n";
            out << "     payload " << QJsonDocument(ex.first).toJson(QJsonDocument::Compact) << "\n";
        }
    }
    out << "edits never changed doc: ";
    for (const auto& name : names) if (!changedCount.contains(name)) out << name << " ";
    out << "\n";
    return 0;
}
