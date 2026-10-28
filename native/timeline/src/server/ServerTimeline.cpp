#include "server/ServerTimeline.h"

#include "model/TimelineJson.h"
#include "preview/FfmpegSource.h"
#include "server/FieldAudit.h"
#include "server/ServerClient.h"

#include <QCryptographicHash>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QSaveFile>
#include <QUrlQuery>

#include <map>
#include <set>

namespace nt::server {
namespace {

QString shortHash(const QByteArray& bytes) {
    return QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex().left(16));
}

QString extensionFor(const QUrl& url, const QString& contentType) {
    const QString suffix = QFileInfo(url.path()).suffix().toLower();
    if (!suffix.isEmpty() && suffix.size() <= 5) return suffix;
    static const std::map<QString, QString> byType = {
        {QStringLiteral("video/mp4"), QStringLiteral("mp4")},   {QStringLiteral("video/webm"), QStringLiteral("webm")},
        {QStringLiteral("video/quicktime"), QStringLiteral("mov")}, {QStringLiteral("image/png"), QStringLiteral("png")},
        {QStringLiteral("image/jpeg"), QStringLiteral("jpg")},  {QStringLiteral("image/webp"), QStringLiteral("webp")},
        {QStringLiteral("audio/wav"), QStringLiteral("wav")},   {QStringLiteral("audio/mpeg"), QStringLiteral("mp3")},
    };
    const auto it = byType.find(contentType.toLower());
    return it != byType.end() ? it->second : QStringLiteral("bin");
}

// `currentAssetId` forms: a server asset id, `asset://<id>`, or a
// `package://<pkg>/<path>` file that ships with a node package.
struct AssetRef {
    enum Kind { Asset, Package, Invalid } kind = Invalid;
    QString id;     // asset id, or the package URI
    QString cacheId;
};

AssetRef parseRef(const QString& raw) {
    static const QRegularExpression assetId(QStringLiteral("^[0-9a-f]{32}$"));
    AssetRef ref;
    QString s = raw.trimmed();
    if (s.startsWith(u"package://")) {
        const QString rest = s.mid(10);
        const int slash = rest.indexOf(u'/');
        if (slash > 0 && slash < rest.size() - 1) {
            ref.kind = AssetRef::Package;
            ref.id = s;
            ref.cacheId = QStringLiteral("pkg-") + shortHash(s.toUtf8());
        }
        return ref;
    }
    if (s.startsWith(u"asset://")) s = s.mid(8);
    if (assetId.match(s).hasMatch()) {
        ref.kind = AssetRef::Asset;
        ref.id = s;
        ref.cacheId = s;
    }
    return ref;
}

QUrl packageUrl(const ServerClient& client, const QString& uri) {
    const QString rest = uri.mid(10);
    const int slash = rest.indexOf(u'/');
    QStringList segments;
    for (const QString& seg : rest.mid(slash + 1).split(u'/', Qt::SkipEmptyParts)) {
        segments << QString::fromLatin1(QUrl::toPercentEncoding(seg));
    }
    const QString path = QStringLiteral("/api/assets/packages/%1/%2")
                             .arg(QString::fromLatin1(QUrl::toPercentEncoding(rest.left(slash))), segments.join(u'/'));
    QUrl url = client.base();
    url.setPath(path, QUrl::TolerantMode);
    return url;
}

bool showsAsset(const QString& status) {
    return status == u"generated" || status == u"stale" || status == u"locked" || status == u"generating";
}

bool needsPicture(MediaType t) { return t == MediaType::Video || t == MediaType::Image; }
bool needsAudio(MediaType t) { return t == MediaType::Video || t == MediaType::Audio; }

}  // namespace

QString originalVersion(const QJsonObject& asset) {
    const QJsonValue size = asset.value(u"size");
    const QByteArray key = asset.value(u"updated_at").toString().toUtf8() + '\n' +
                           (size.isDouble() ? QByteArray::number(static_cast<qint64>(size.toDouble())) : QByteArray("null")) +
                           '\n' + asset.value(u"content_type").toString().toUtf8();
    return shortHash(key);
}

std::optional<RemoteFile> originalFile(const ServerClient& client, const QJsonObject& asset, QString* why) {
    if (asset.value(u"content_type").toString() == u"folder") {
        *why = QStringLiteral("the asset is a folder");
        return std::nullopt;
    }
    if (asset.value(u"offline").toBool(false)) {
        *why = QStringLiteral("the asset's file is offline");
        return std::nullopt;
    }
    const QString getUrl = asset.value(u"get_url").toString();
    if (getUrl.isEmpty()) {
        *why = QStringLiteral("the asset has no get_url");
        return std::nullopt;
    }
    RemoteFile f;
    f.url = client.resolve(getUrl);
    f.version = originalVersion(asset);
    f.expectedSize = asset.value(u"size").isDouble() ? static_cast<qint64>(asset.value(u"size").toDouble()) : -1;
    f.ext = extensionFor(f.url, asset.value(u"content_type").toString());
    return f;
}

std::optional<RemoteFile> proxyFile(const ServerClient& client, const QJsonObject& asset, QString* why) {
    if (!asset.contains(u"proxy_status")) {
        *why = QStringLiteral("no proxy on this server");
        return std::nullopt;
    }
    const QString status = asset.value(u"proxy_status").toString();
    if (status != u"ready") {
        *why = status == u"queued" || status == u"running" ? QStringLiteral("proxy pending (%1)").arg(status)
                                                            : QStringLiteral("proxy %1").arg(status);
        return std::nullopt;
    }
    const QString proxyUrl = asset.value(u"proxy_url").toString();
    if (proxyUrl.isEmpty()) {
        *why = QStringLiteral("proxy ready but proxy_url is empty");
        return std::nullopt;
    }
    RemoteFile f;
    f.url = client.resolve(proxyUrl);
    f.version = QUrlQuery(f.url).queryItemValue(QStringLiteral("v"));
    if (f.version.isEmpty()) {
        *why = QStringLiteral("proxy_url has no ?v= version");
        return std::nullopt;
    }
    f.ext = extensionFor(f.url, QString());
    return f;
}

ServerOpenResult openServerTimeline(const ServerOpenOptions& options) {
    QElapsedTimer total;
    total.start();
    ServerOpenResult out;
    ServerClient client(options.server, options.token);
    QJsonObject report{
        {QStringLiteral("source"),
         QJsonObject{{QStringLiteral("server"), options.server.toString()},
                     {QStringLiteral("timelineId"), options.timelineId},
                     {QStringLiteral("user"), client.userKey()},
                     {QStringLiteral("cacheRoot"), options.cacheRoot}}},
    };
    QJsonObject timings;
    auto fail = [&](const QString& error) {
        timings.insert(QStringLiteral("totalMs"), static_cast<double>(total.elapsed()));
        report.insert(QStringLiteral("timings"), timings);
        report.insert(QStringLiteral("error"), error);
        out.error = error;
        out.report = report;
        return out;
    };

    QElapsedTimer step;
    step.start();
    const QueryResult got = client.getTimeline(options.timelineId);
    timings.insert(QStringLiteral("getMs"), static_cast<double>(step.elapsed()));
    if (!got.ok()) return fail(QStringLiteral("timeline.get: %1").arg(got.describe()));
    const QJsonObject raw = got.data.toObject();
    const QByteArray rawBytes = QJsonDocument(raw).toJson(QJsonDocument::Compact);

    // D4: the raw document of the last load stays on disk next to the cache.
    const QString userDir = QDir(options.cacheRoot)
                                .filePath(safePathPart(client.serverKey()) + u'/' + safePathPart(client.userKey()));
    const QString rawPath = QDir(userDir).filePath(QStringLiteral("timelines/%1.json").arg(safePathPart(options.timelineId)));
    // Written to a temporary file and renamed into place, so a failure keeps
    // the previous backup whole. A failure is reported, not a load error.
    QString backupError;
    if (!QDir().mkpath(QFileInfo(rawPath).absolutePath())) {
        backupError = QStringLiteral("cannot create %1").arg(QFileInfo(rawPath).absolutePath());
    } else {
        QSaveFile f(rawPath);
        if (!f.open(QIODevice::WriteOnly)) {
            backupError = QStringLiteral("cannot open %1: %2").arg(rawPath, f.errorString());
        } else if (f.write(rawBytes) != rawBytes.size()) {
            backupError = QStringLiteral("cannot write %1: %2").arg(rawPath, f.errorString());
            f.cancelWriting();
        } else if (!f.commit()) {
            backupError = QStringLiteral("cannot save %1: %2").arg(rawPath, f.errorString());
        }
    }
    if (backupError.isEmpty()) {
        report.insert(QStringLiteral("rawDocument"), rawPath);
    } else {
        report.insert(QStringLiteral("rawDocumentError"), backupError);
    }
    report.insert(QStringLiteral("fields"), auditTimelineFields(raw));

    ParseResult parsed = parseTimelineJson(rawBytes);
    if (!parsed.timeline) return fail(QStringLiteral("parse: %1").arg(parsed.error));
    Timeline tl = std::move(*parsed.timeline);

    // Which clips need which asset.
    struct Need {
        AssetRef ref;
        bool picture = false;
        bool audio = false;
        std::vector<size_t> clips;
    };
    std::map<QString, Need> needs;  // by ref id
    QJsonArray missing;
    int mediaClips = 0;
    for (size_t i = 0; i < tl.clips.size(); ++i) {
        const Clip& clip = tl.clips[i];
        const bool pic = needsPicture(clip.mediaType);
        const bool aud = needsAudio(clip.mediaType);
        if (!pic && !aud) continue;
        ++mediaClips;
        const QString refText = clip.raw.value(u"currentAssetId").toString();
        const QString status = clip.raw.value(u"status").toString();
        if (refText.isEmpty() || !showsAsset(status)) {
            missing.append(QJsonObject{{QStringLiteral("clipId"), QString::fromStdString(clip.id)},
                                       {QStringLiteral("assetId"), refText},
                                       {QStringLiteral("reason"),
                                        refText.isEmpty() ? QStringLiteral("no currentAssetId")
                                                          : QStringLiteral("status %1 shows no asset").arg(status)}});
            continue;
        }
        const AssetRef ref = parseRef(refText);
        if (ref.kind == AssetRef::Invalid) {
            missing.append(QJsonObject{{QStringLiteral("clipId"), QString::fromStdString(clip.id)},
                                       {QStringLiteral("assetId"), refText},
                                       {QStringLiteral("reason"), QStringLiteral("not an asset id or package URI")}});
            continue;
        }
        Need& n = needs[ref.id];
        n.ref = ref;
        n.picture = n.picture || pic;
        n.audio = n.audio || aud;
        n.clips.push_back(i);
    }

    // Metadata for every asset at once: assets.get, or HEAD for package files.
    step.restart();
    std::vector<const Need*> assetNeeds;
    std::vector<const Need*> packageNeeds;
    std::vector<std::pair<QString, QJsonObject>> calls;
    std::vector<HttpRequest> heads;
    for (const auto& [id, n] : needs) {
        if (n.ref.kind == AssetRef::Asset) {
            assetNeeds.push_back(&n);
            calls.push_back({QStringLiteral("assets.get"), QJsonObject{{QStringLiteral("id"), id}}});
        } else {
            packageNeeds.push_back(&n);
            heads.push_back({packageUrl(client, id), true});
        }
    }
    const std::vector<QueryResult> metas = client.queryAll(calls);
    const std::vector<HttpResponse> headResults = client.sendAll(heads);
    timings.insert(QStringLiteral("metadataMs"), static_cast<double>(step.elapsed()));

    struct Plan {
        const Need* need = nullptr;
        std::optional<RemoteFile> picture;  // the file the picture reads
        QString pictureVariant;
        std::optional<RemoteFile> original;
        QString originalVariant = QStringLiteral("original");
        QString proxyStatus;
        QString pictureReason;  // why the picture reads the original
        QString error;          // missing asset
        QJsonObject asset;
    };
    std::vector<Plan> plans;
    for (size_t i = 0; i < assetNeeds.size(); ++i) {
        Plan p;
        p.need = assetNeeds[i];
        if (!metas[i].ok()) {
            p.error = QStringLiteral("assets.get: %1").arg(metas[i].describe());
        } else {
            p.asset = metas[i].data.toObject();
            QString why;
            p.original = originalFile(client, p.asset, &why);
            if (!p.original) p.error = why;
            p.proxyStatus = p.asset.value(u"proxy_status").toString();
            const QString type = p.asset.value(u"content_type").toString();
            if (p.need->picture && p.original) {
                QString proxyWhy;
                const auto proxy = type.startsWith(u"video/") ? proxyFile(client, p.asset, &proxyWhy) : std::nullopt;
                if (proxy) {
                    p.picture = proxy;
                    p.pictureVariant = QStringLiteral("proxy");
                } else {
                    p.picture = p.original;
                    p.pictureVariant = QStringLiteral("original");
                    p.pictureReason = type.startsWith(u"video/") ? proxyWhy : QString();
                }
            }
        }
        plans.push_back(std::move(p));
    }
    for (size_t i = 0; i < packageNeeds.size(); ++i) {
        Plan p;
        p.need = packageNeeds[i];
        const HttpResponse& h = headResults[i];
        if (h.status != 200) {
            p.error = h.status == 0 ? QStringLiteral("HEAD failed: %1").arg(h.networkError)
                                    : QStringLiteral("HEAD answered HTTP %1").arg(h.status);
        } else {
            RemoteFile f;
            f.url = packageUrl(client, p.need->ref.id);
            bool okLen = false;
            f.expectedSize = h.header("content-length").toLongLong(&okLen);
            if (!okLen) f.expectedSize = -1;
            f.version = shortHash(h.header("etag") + '\n' + h.header("content-length") + '\n' +
                                  h.header("last-modified") + '\n' + h.header("content-type"));
            f.ext = extensionFor(f.url, QString::fromLatin1(h.header("content-type")));
            p.original = f;
            p.originalVariant = QStringLiteral("package");
            if (p.need->picture) {
                p.picture = f;
                p.pictureVariant = QStringLiteral("package");
            }
        }
        plans.push_back(std::move(p));
    }

    // Downloads, one file per asset and variant.
    step.restart();
    AssetCache cache(options.cacheRoot, client.serverKey(), client.userKey(),
                     [&client](QNetworkRequest& r) { client.decorate(r); });
    int downloads = 0;
    int hits = 0;
    QJsonArray assetsReport;
    std::map<QString, QString> pathByKey;  // "<cacheId>/<variant>" -> path
    auto fetchVariant = [&](Plan& p, const QString& variant, const RemoteFile& file) -> FetchResult {
        const QString key = p.need->ref.cacheId + u'/' + variant;
        if (const auto it = pathByKey.find(key); it != pathByKey.end()) {
            FetchResult r;
            r.path = it->second;
            r.hit = true;
            return r;
        }
        const bool isAsset = p.need->ref.kind == AssetRef::Asset;
        const QString assetId = p.need->ref.id;
        AssetCache::Recheck recheck = [&client, isAsset, assetId, variant]() -> std::optional<RemoteFile> {
            if (!isAsset) return std::nullopt;
            const QueryResult now = client.getAsset(assetId);
            if (!now.ok()) return std::nullopt;
            QString why;
            return variant == u"proxy" ? proxyFile(client, now.data.toObject(), &why)
                                       : originalFile(client, now.data.toObject(), &why);
        };
        FetchResult r = cache.fetch(p.need->ref.cacheId, variant, file, isAsset ? recheck : AssetCache::Recheck{});
        if (r.ok()) {
            pathByKey[key] = r.path;
            (r.hit ? hits : downloads) += 1;
            cache.protect(r.path);  // this open uses it: a later download never evicts it
        }
        return r;
    };

    const QString missingDir = QDir(options.cacheRoot).filePath(QStringLiteral("missing"));
    auto missingPath = [&missingDir](const QString& ref) {
        return QDir(missingDir).filePath(safePathPart(ref)).toStdString();
    };
    for (Plan& p : plans) {
        QJsonObject entry{{QStringLiteral("assetId"), p.need->ref.id}};
        QJsonArray clipIds;
        for (size_t i : p.need->clips) clipIds.append(QString::fromStdString(tl.clips[i].id));
        entry.insert(QStringLiteral("clips"), clipIds);
        if (!p.proxyStatus.isEmpty()) entry.insert(QStringLiteral("proxyStatus"), p.proxyStatus);
        std::string picturePath;
        std::string audioPath;
        if (p.error.isEmpty() && p.picture) {
            FetchResult r = fetchVariant(p, p.pictureVariant, *p.picture);
            if (!r.ok() && p.pictureVariant == u"proxy") {
                // A proxy that does not download falls back to the original.
                p.pictureReason = QStringLiteral("proxy download failed: %1").arg(r.error);
                p.pictureVariant = QStringLiteral("original");
                r = fetchVariant(p, p.pictureVariant, *p.original);
            }
            if (r.ok()) {
                picturePath = r.path.toStdString();
                QJsonObject pic{{QStringLiteral("variant"), p.pictureVariant}, {QStringLiteral("path"), r.path},
                                {QStringLiteral("cacheHit"), r.hit}};
                if (r.resumed) pic.insert(QStringLiteral("resumed"), true);
                if (r.restarts) pic.insert(QStringLiteral("restarts"), r.restarts);
                if (!p.pictureReason.isEmpty()) pic.insert(QStringLiteral("reason"), p.pictureReason);
                entry.insert(QStringLiteral("picture"), pic);
            } else {
                p.error = r.error;
            }
        }
        if (p.error.isEmpty() && p.need->audio && p.original) {
            const FetchResult r = fetchVariant(p, p.originalVariant, *p.original);
            if (r.ok()) {
                audioPath = r.path.toStdString();
                entry.insert(QStringLiteral("audio"), QJsonObject{{QStringLiteral("variant"), p.originalVariant},
                                                                  {QStringLiteral("path"), r.path},
                                                                  {QStringLiteral("cacheHit"), r.hit}});
            } else {
                p.error = r.error;
            }
        }
        if (!p.error.isEmpty()) {
            entry.insert(QStringLiteral("error"), p.error);
            for (size_t i : p.need->clips) {
                missing.append(QJsonObject{{QStringLiteral("clipId"), QString::fromStdString(tl.clips[i].id)},
                                           {QStringLiteral("assetId"), p.need->ref.id},
                                           {QStringLiteral("reason"), p.error}});
            }
            picturePath = missingPath(p.need->ref.id);
            audioPath.clear();
        }
        for (size_t i : p.need->clips) {
            Clip& clip = tl.clips[i];
            if (needsPicture(clip.mediaType)) clip.mediaPath = picturePath;
            if (needsAudio(clip.mediaType)) clip.audioPath = audioPath;
        }
        assetsReport.append(entry);
    }
    // Media clips with no usable reference draw a placeholder too.
    for (const QJsonValue& m : missing) {
        const std::string clipId = m.toObject().value(u"clipId").toString().toStdString();
        for (Clip& clip : tl.clips) {
            if (clip.id == clipId && needsPicture(clip.mediaType) && clip.mediaPath.empty()) {
                clip.mediaPath = missingPath(m.toObject().value(u"assetId").toString());
            }
        }
    }
    timings.insert(QStringLiteral("downloadMs"), static_cast<double>(step.elapsed()));

    // D10a facts per picture file, once per file.
    step.restart();
    QJsonArray rejected;
    if (options.probeMedia) {
        std::map<std::string, MediaFacts> facts;
        for (const Clip& clip : tl.clips) {
            if (clip.mediaPath.empty() || !needsPicture(clip.mediaType)) continue;
            if (QString::fromStdString(clip.mediaPath).startsWith(missingDir)) continue;
            auto it = facts.find(clip.mediaPath);
            if (it == facts.end()) it = facts.emplace(clip.mediaPath, probeMedia(clip.mediaPath)).first;
            const MediaFacts& f = it->second;
            if (f.usable()) continue;
            rejected.append(QJsonObject{{QStringLiteral("clipId"), QString::fromStdString(clip.id)},
                                        {QStringLiteral("assetId"), clip.raw.value(u"currentAssetId").toString()},
                                        {QStringLiteral("path"), QString::fromStdString(clip.mediaPath)},
                                        {QStringLiteral("reason"), QString::fromStdString(!f.opened ? f.error : f.rejection)}});
        }
    }
    timings.insert(QStringLiteral("probeMs"), static_cast<double>(step.elapsed()));

    const QJsonObject fields = report.value(u"fields").toObject().value(u"fields").toObject();
    timings.insert(QStringLiteral("totalMs"), static_cast<double>(total.elapsed()));
    report.insert(QStringLiteral("timings"), timings);
    report.insert(QStringLiteral("assets"), assetsReport);
    report.insert(QStringLiteral("missingAssets"), missing);
    report.insert(QStringLiteral("rejectedMedia"), rejected);
    report.insert(QStringLiteral("summary"),
                  QJsonObject{{QStringLiteral("tracks"), static_cast<int>(tl.tracks.size())},
                              {QStringLiteral("clips"), static_cast<int>(tl.clips.size())},
                              {QStringLiteral("mediaClips"), mediaClips},
                              {QStringLiteral("assets"), static_cast<int>(needs.size())},
                              {QStringLiteral("unsupportedFields"), fields.size()},
                              {QStringLiteral("missingAssets"), missing.size()},
                              {QStringLiteral("rejectedMedia"), rejected.size()},
                              {QStringLiteral("downloads"), downloads},
                              {QStringLiteral("cacheHits"), hits}});
    out.timeline = std::move(tl);
    out.report = report;
    return out;
}

}  // namespace nt::server
