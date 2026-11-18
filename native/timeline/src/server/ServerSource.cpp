#include "server/ServerSource.h"

#include "server/AssetCache.h"
#include "server/ServerClient.h"
#include "server/ServerTimelineProbe.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QStandardPaths>
#include <QUrlQuery>
#include <QVariant>

#include <cstdio>
#include <cstring>
#include <string>
#include <utility>

Q_DECLARE_METATYPE(nt::server::AssetCacheRoot)

namespace nt::server {
namespace {

struct Args {
    bool active = false;
    bool list = false;
    QString server;
    QString timeline;
    QString cacheDir;
    QString token;
    QString reportPath;
    // A cloud timeline: `server` is the cloud origin and `token` the
    // account's access token, which main sets with setCloudToken.
    bool cloud = false;
    QString role;
    // Set with the token by setCloudToken.
    RequestAuthorizer authorizer;
    std::string label;  // the positional argument put into argv
};

Args& args() {
    // native-rules #14: function-local static mutable Args
    static Args a;
    return a;
}

// argv keeps a pointer into args().label, so loaded sources need separate storage.
std::optional<Args>& loadedSource() {
    // native-rules #14: function-local static mutable optional Args
    static std::optional<Args> source;
    return source;
}

QString defaultCacheDir() {
    const QString env = qEnvironmentVariable("NODETOOL_TIMELINE_CACHE_DIR");
    if (!env.isEmpty()) return env;
    const QString base = QStandardPaths::writableLocation(QStandardPaths::GenericCacheLocation);
    return QDir(base).filePath(QStringLiteral("nodetool-timeline/assets"));
}

bool isServerUrl(const QUrl& url) {
    return url.isValid() && (url.scheme() == u"http" || url.scheme() == u"https") && !url.host().isEmpty();
}

}  // namespace

int takeServerArgs(int& argc, char** argv) {
    Args& a = args();
    a.cloud = false;
    a.role.clear();
    bool tokenGiven = false;
    int out = 1;
    bool seen = false;
    for (int i = 1; i < argc; ++i) {
        const char* arg = argv[i];
        auto value = [&](QString& target) -> bool {
            if (i + 1 >= argc) {
                std::fprintf(stderr, "error: %s needs a value\n", arg);
                return false;
            }
            target = QString::fromLocal8Bit(argv[++i]);
            return true;
        };
        if (std::strcmp(arg, "--server") == 0) {
            if (!value(a.server)) return 2;
            seen = true;
        } else if (std::strcmp(arg, "--timeline") == 0) {
            if (!value(a.timeline)) return 2;
            seen = true;
        } else if (std::strcmp(arg, "--cache-dir") == 0) {
            if (!value(a.cacheDir)) return 2;
        } else if (std::strcmp(arg, "--token") == 0) {
            if (!value(a.token)) return 2;
            tokenGiven = true;
        } else if (std::strcmp(arg, "--loader-report") == 0) {
            if (!value(a.reportPath)) return 2;
        } else if (std::strcmp(arg, "--cloud-server") == 0) {
            if (!value(a.server)) return 2;
            a.cloud = true;
            seen = true;
        } else if (std::strcmp(arg, "--cloud-timeline") == 0) {
            if (!value(a.timeline)) return 2;
            a.cloud = true;
            seen = true;
        } else if (std::strcmp(arg, "--cloud-role") == 0) {
            if (!value(a.role)) return 2;
        } else if (std::strcmp(arg, "--list-timelines") == 0) {
            a.list = true;
            seen = true;
        } else {
            argv[out++] = argv[i];
        }
    }
    if (!seen) {
        if (!a.cacheDir.isEmpty() || !a.token.isEmpty() || !a.reportPath.isEmpty()) {
            std::fprintf(stderr, "error: --cache-dir, --token and --loader-report need --server\n");
            return 2;
        }
        argc = out;
        argv[argc] = nullptr;
        return 0;
    }
    if (a.server.isEmpty() || (a.timeline.isEmpty() && !a.list)) {
        std::fprintf(stderr, "usage: nodetool-timeline --server URL --timeline ID [--cache-dir DIR] [--token T] "
                             "[--loader-report FILE] [mode options]\n"
                             "       nodetool-timeline --server URL --list-timelines\n");
        return 2;
    }
    if (a.cloud && (a.list || tokenGiven)) {
        std::fprintf(stderr, "error: --cloud-server opens one timeline with the signed-in account\n");
        return 2;
    }
    const QUrl url(a.server);
    if (a.cloud && url.scheme() != u"https") {
        std::fprintf(stderr, "error: --cloud-server must be an https origin, got '%s'\n", qPrintable(a.server));
        return 2;
    }
    if (!isServerUrl(url)) {
        std::fprintf(stderr, "error: --server must be an http(s) URL, got '%s'\n", qPrintable(a.server));
        return 2;
    }
    if (a.cacheDir.isEmpty()) a.cacheDir = defaultCacheDir();
    if (a.cloud) {
        // Set by main from the account (setCloudToken), never from the environment.
        a.token.clear();
    } else if (a.token.isEmpty()) {
        a.token = qEnvironmentVariable("NODETOOL_API_TOKEN");
    }
    if (a.cloud && a.role.isEmpty()) a.role = QStringLiteral("owner");
    a.active = true;
    if (!a.list) {
        const auto key = a.cloud ? QStringLiteral("#cloud_timeline=") : QStringLiteral("#timeline=");
        a.label = (a.server + key + a.timeline).toStdString();
        // The removed options took at least two slots, so the label fits.
        argv[out++] = a.label.data();
    }
    argc = out;
    argv[argc] = nullptr;
    return 0;
}

bool listTimelinesRequested() { return args().active && args().list; }

int listTimelinesMain() {
    const Args& a = args();
    ServerClient client(QUrl(a.server), a.token);
    const QueryResult r = client.listTimelines();
    if (!r.ok()) {
        std::fprintf(stderr, "error: timeline.list: %s\n", qPrintable(r.describe()));
        return 1;
    }
    std::printf("%s\n", QJsonDocument(r.data.toArray()).toJson(QJsonDocument::Compact).constData());
    return 0;
}

std::optional<CloudSource> cloudTimelineSource() {
    const Args& a = args();
    if (!a.active || !a.cloud) return std::nullopt;
    return CloudSource{QUrl(a.server), a.timeline, a.role};
}

void setCloudToken(const QString& token, RequestAuthorizer authorizer) {
    if (!args().cloud) return;
    args().token = token;
    args().authorizer = std::move(authorizer);
}

std::optional<SaveTarget> serverSaveTarget() {
    if (args().active && args().cloud) return std::nullopt;
    const Args& a = loadedSource() ? *loadedSource() : args();
    if (!a.active || a.list || a.cloud) return std::nullopt;
    SaveTarget t;
    t.server = QUrl(a.server);
    t.token = a.token;
    t.timelineId = a.timeline;
    // Set by scripts/scratch-server.mjs: saves go only to that server instance.
    t.expectedInstance = qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE");
    const ServerClient client(t.server, t.token);
    t.backupDir = QDir(a.cacheDir).filePath(safePathPart(client.serverKey()) + u'/' + safePathPart(client.userKey()) +
                                            QStringLiteral("/timelines"));
    return t;
}

QString timelineCacheDirectory() {
    return args().active ? args().cacheDir : defaultCacheDir();
}

void setTimelineAssetCache(QCoreApplication& app, const AssetCacheRoot& cache) {
    app.setProperty("timelineAssetCache", QVariant::fromValue(cache));
}

static std::optional<AssetCacheRoot> configuredTimelineAssetCache() {
    if (const auto* app = QCoreApplication::instance()) {
        const auto configured = app->property("timelineAssetCache");
        if (configured.isValid()) {
            return configured.value<AssetCacheRoot>();
        }
    }
    return std::nullopt;
}

AssetCacheRoot timelineAssetCache() {
    if (auto cache = configuredTimelineAssetCache()) {
        return *cache;
    }
    return AssetCacheRoot(timelineCacheDirectory());
}

ParseResult loadTimelineSource(const QString& source) {
    if (auto cache = configuredTimelineAssetCache()) {
        return loadTimelineSource(source, *cache);
    }
    const auto directory = args().active && source.toStdString() == args().label ? args().cacheDir : defaultCacheDir();
    return loadTimelineSource(source, AssetCacheRoot(directory));
}

ParseResult loadTimelineSource(const QString& source, const AssetCacheRoot& cache) {
    Args selected = args();
    if (!selected.active || source.toStdString() != selected.label) {
        QUrl url(source);
        const auto fragment = QUrlQuery(url.fragment()).queryItems(QUrl::FullyDecoded);
        if (!isServerUrl(url) || fragment.size() != 1 || fragment.front().first != u"timeline" ||
            fragment.front().second.isEmpty()) {
            return loadTimelineFile(source);
        }
        url.setFragment(QString());
        selected = Args{};
        selected.active = true;
        selected.server = url.toString();
        selected.timeline = fragment.front().second;
        selected.token = qEnvironmentVariable("NODETOOL_API_TOKEN");
    }
    selected.cacheDir = cache.path();
    loadedSource() = std::move(selected);
    const Args& a = *loadedSource();

    const ServerOpenOptions options{
        .server = QUrl(a.server), .timelineId = a.timeline, .cacheRoot = cache,
        .token = a.token, .expectedInstance = {}, .authorizer = a.authorizer,
    };
    ServerOpenResult opened = openProbedServerTimeline(options);

    QString reportPath = a.reportPath;
    if (reportPath.isEmpty()) {
        const QString raw = opened.report.value(u"rawDocument").toString();
        reportPath = raw.isEmpty() ? QString() : QFileInfo(raw).absolutePath() + u'/' +
                                                     QFileInfo(raw).completeBaseName() + QStringLiteral(".report.json");
    }
    if (!reportPath.isEmpty()) {
        QDir().mkpath(QFileInfo(reportPath).absolutePath());
        QFile f(reportPath);
        if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
            f.write(QJsonDocument(opened.report).toJson(QJsonDocument::Indented));
        }
    }
    if (opened.report.contains(QStringLiteral("rawDocumentError"))) {
        std::fprintf(stderr, "loader: warning: raw document backup failed: %s\n",
                     qPrintable(opened.report.value(u"rawDocumentError").toString()));
    }
    const QJsonObject s = opened.report.value(u"summary").toObject();
    const QJsonObject t = opened.report.value(u"timings").toObject();
    std::fprintf(stderr,
                 "loader: %s timeline %s: %d clips, %d media clips, %d unsupported fields, %d missing assets, "
                 "%d rejected media, %d downloads, %d cache hits, %.0f ms; report %s\n",
                 qPrintable(a.server), qPrintable(a.timeline), s.value(u"clips").toInt(), s.value(u"mediaClips").toInt(),
                 s.value(u"unsupportedFields").toInt(), s.value(u"missingAssets").toInt(),
                 s.value(u"rejectedMedia").toInt(), s.value(u"downloads").toInt(), s.value(u"cacheHits").toInt(),
                 t.value(u"totalMs").toDouble(), qPrintable(reportPath));

    ParseResult result;
    if (!opened.timeline) {
        result.error = opened.error;
        result.unsupportedColorSpaceVersion = opened.unsupportedColorSpaceVersion;
        result.unsupportedColorSpaceVersionText = opened.unsupportedColorSpaceVersionText;
        return result;
    }
    result.timeline = std::move(opened.timeline);
    return result;
}

}  // namespace nt::server
