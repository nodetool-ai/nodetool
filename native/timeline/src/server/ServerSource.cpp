#include "server/ServerSource.h"

#include "server/AssetCache.h"
#include "server/ServerClient.h"
#include "server/ServerTimeline.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QStandardPaths>

#include <cstdio>
#include <cstring>
#include <string>

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
    std::string label;  // the positional argument put into argv
};

Args& args() {
    static Args a;
    return a;
}

QString defaultCacheDir() {
    const QString env = qEnvironmentVariable("NODETOOL_TIMELINE_CACHE_DIR");
    if (!env.isEmpty()) return env;
    const QString base = QStandardPaths::writableLocation(QStandardPaths::GenericCacheLocation);
    return QDir(base).filePath(QStringLiteral("nodetool-timeline/assets"));
}

}  // namespace

int takeServerArgs(int& argc, char** argv) {
    Args& a = args();
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
        } else if (std::strcmp(arg, "--loader-report") == 0) {
            if (!value(a.reportPath)) return 2;
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
    const QUrl url(a.server);
    if (!url.isValid() || (url.scheme() != u"http" && url.scheme() != u"https") || url.host().isEmpty()) {
        std::fprintf(stderr, "error: --server must be an http(s) URL, got '%s'\n", qPrintable(a.server));
        return 2;
    }
    if (a.cacheDir.isEmpty()) a.cacheDir = defaultCacheDir();
    if (a.token.isEmpty()) a.token = qEnvironmentVariable("NODETOOL_API_TOKEN");
    a.active = true;
    if (!a.list) {
        a.label = (a.server + QStringLiteral("#timeline=") + a.timeline).toStdString();
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

std::optional<SaveTarget> serverSaveTarget() {
    const Args& a = args();
    if (!a.active || a.list) return std::nullopt;
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

ParseResult loadTimelineSource(const QString& source) {
    const Args& a = args();
    if (!a.active || source.toStdString() != a.label) return loadTimelineFile(source);

    ServerOpenOptions options;
    options.server = QUrl(a.server);
    options.timelineId = a.timeline;
    options.cacheRoot = a.cacheDir;
    options.token = a.token;
    ServerOpenResult opened = openServerTimeline(options);

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
        return result;
    }
    result.timeline = std::move(opened.timeline);
    return result;
}

}  // namespace nt::server
