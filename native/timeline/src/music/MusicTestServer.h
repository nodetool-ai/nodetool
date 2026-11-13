#pragma once

// The scripted NodeTool server of the music tests (tst_musicjobs, tst_musicwire).
// It answers with the wire shapes of packages/websocket: `rpc_response` frames
// from CommandRouter.runRpc (session/commands.ts), `lookup_generations` rows
// with `music_status` while a row runs and `music_takes`/`timing` once it is
// complete (commands.ts lookup_generations), and takes as runMusicGeneration
// builds them (session/music-generation.ts). Take assets come from a scripted
// HTTP asset store, as tst_ai_controller serves them.
//
// Thread affinity: GUI thread only; the test's event loop drives both servers.

#include "../../tests/TestHttpServer.h"
#include "assets/AssetWav.h"

#include <QFile>
#include <QHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QPointer>
#include <QTemporaryDir>
#include <QUrlQuery>
#include <QWebSocket>
#include <QWebSocketServer>

#include <random>
#include <vector>

namespace nt::music::testing {

constexpr qint64 kBar = 96000;  // 4/4 at 120 BPM

inline QString assetId(int n) { return QStringLiteral("%1").arg(n, 32, 16, QLatin1Char('0')); }

inline std::vector<float> noise(qint64 frames, unsigned seed) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(-0.3f, 0.3f);
    std::vector<float> out(static_cast<std::size_t>(frames) * 2);
    for (auto& sample : out) sample = dist(rng);
    return out;
}

inline QJsonObject takeRecord(const QString& task, qint64 start, qint64 end, int candidate, int segment) {
    return {{"task", task}, {"backend", "acestep.cpp@07abf07"}, {"steps", 8}, {"bpm", 120}, {"beatsPerBar", 4},
            {"beatUnit", 4}, {"seed", 1000 + candidate}, {"candidateIndex", candidate}, {"segmentIndex", segment},
            {"targetStartFrame", start}, {"targetEndFrame", end}, {"requestFrames", 792000},
            {"key", QJsonObject{{"tonic", "A"}, {"mode", "minor"}}},
            {"alignment", QJsonObject{{"offsetFrames", 12}, {"corrected", true}, {"confidence", 3.5}, {"tempoRatio", 1.0},
                                      {"lastBeatErrorMs", 0.5}}}};
}

// The scripted NodeTool server: a WebSocket that acknowledges text mode and
// records every command, and an HTTP asset store that serves float WAVs and
// takes uploads.
class Server : public QObject {
public:
    Server() : socket(QStringLiteral("fixture"), QWebSocketServer::NonSecureMode) {
        socket.listen(QHostAddress::LocalHost, 0);
        connect(&socket, &QWebSocketServer::newConnection, this, [this] {
            peer = socket.nextPendingConnection();
            peer->setParent(&socket);
            connect(peer, &QWebSocket::textMessageReceived, this, [this](const QString& text) {
                const auto message = QJsonDocument::fromJson(text.toUtf8()).object();
                if (message.value("command") == "set_mode") {
                    peer->sendTextMessage(R"({"message":"Mode set to text"})");
                } else {
                    messages.append(message);
                }
            });
        });
        http.setJson([this](const QByteArray&, const QUrl& url) {
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            const auto id = input.value("id").toString();
            if (!files.contains(id)) {
                return QByteArray(R"({"error":{"message":"Asset not found","data":{"code":"NOT_FOUND"}}})");
            }
            const QJsonObject asset{{"id", id}, {"name", id + ".wav"}, {"content_type", "audio/wav"}, {"duration", 1},
                                    {"size", files.value(id).size()}, {"get_url", "/media/" + id + ".wav"}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson(QJsonDocument::Compact);
        });
        http.setPost([this](const QByteArray& path, const QByteArray& body) {
            if (path == "/api/assets") {
                uploads.append(body);
                const auto id = assetId(0xc0000 + static_cast<int>(uploads.size()));
                return QJsonDocument(QJsonObject{{"id", id}, {"name", "bounce.wav"}, {"content_type", "audio/wav"}}).toJson();
            }
            return QByteArray(R"({"result":{"data":{}}})");
        });
    }
    QUrl base() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(socket.serverPort())); }

    // A take asset the HTTP store serves, `frames` long as a real take is.
    void addAsset(const QString& id, qint64 frames) {
        QTemporaryDir dir;
        const auto path = dir.filePath("take.wav");
        nt::assets::writeStereoFloatWav(path, noise(frames, static_cast<unsigned>(files.size() + 1)));
        QFile file(path);
        const auto bytes = file.open(QIODevice::ReadOnly) ? file.readAll() : QByteArray();
        files.insert(id, bytes);
        http.setFile("/media/" + id.toUtf8() + ".wav", ServedFile(bytes));
    }
    void send(const QJsonObject& frame) { peer->sendTextMessage(QString::fromUtf8(QJsonDocument(frame).toJson(QJsonDocument::Compact))); }
    // runRpc's success frame.
    void result(const QString& requestId, const QString& command, const QJsonObject& value) {
        send({{"type", "rpc_response"}, {"request_id", requestId}, {"command", command}, {"result", value}});
    }
    // runRpc's error frame.
    void error(const QString& requestId, const QString& command, const QString& message) {
        send({{"type", "rpc_response"}, {"request_id", requestId}, {"command", command},
              {"error", QJsonObject{{"code", "INTERNAL_ERROR"}, {"message", message}, {"retryable", false},
                                    {"apiCode", QJsonValue::Null}}}});
    }
    // The lookup_generations answer for the last lookup.
    void lookupReply(const QJsonArray& rows) {
        const auto lookup = last("lookup_generations");
        result(lookup.value("request_id").toString(), "lookup_generations", {{"generations", rows}});
    }
    QJsonObject last(const QString& command) const {
        for (auto it = messages.crbegin(); it != messages.crend(); ++it) {
            if (it->value("command") == command) return *it;
        }
        return {};
    }
    QList<QJsonObject> all(const QString& command) const {
        QList<QJsonObject> out;
        for (const auto& message : messages) {
            if (message.value("command") == command) out.append(message);
        }
        return out;
    }
    // music_takes for `request`, one take per candidate and segment. A Generate
    // segment's record names its original segment (`index`, else its position)
    // and the clip range as its target: window_start_frame + start_frame -
    // index * length (the segment replay contract of generateTakes in
    // packages/websocket/src/session/music-generation.ts).
    QJsonObject takes(const QJsonObject& request, int firstAsset) {
        const auto music = request.value("data").toObject().value("music").toObject();
        const auto task = music.value("task").toString();
        const auto windowStart = music.value("window_start_frame").toInteger();
        QJsonArray ranges = task == u"text2music" ? music.value("segments").toArray() : QJsonArray{music.value("region")};
        QJsonArray takes;
        QJsonArray ids;
        int n = firstAsset;
        for (int candidate = 0; candidate < music.value("candidates").toInt(); ++candidate) {
            for (int segment = 0; segment < ranges.size(); ++segment) {
                const auto range = ranges[segment].toObject();
                const auto id = assetId(n++);
                const auto length = range.value("end_frame").toInteger() - range.value("start_frame").toInteger();
                const int index = range.value("index").toInt(segment);
                const auto target = windowStart + range.value("start_frame").toInteger() - index * length;
                addAsset(id, length);
                ids.append(id);
                auto record = takeRecord(task, target, target + length, candidate, index);
                record.insert("requestFrames", music.value("request_frames").toInteger());
                takes.append(QJsonObject{{"asset_id", id}, {"candidate", candidate}, {"segment", segment}, {"record", record}});
            }
        }
        return {{"asset_ids", ids}, {"music_takes", takes}, {"timing", QJsonObject{{"queue_ms", 10}, {"lm_ms", 4000}, {"synth_ms", 4250}}},
                {"generation_id", "generation"}};
    }

    QWebSocketServer socket;
    QPointer<QWebSocket> peer;
    QList<QJsonObject> messages;
    TestHttpServer http;
    QHash<QString, QByteArray> files;
    QList<QByteArray> uploads;
};

}  // namespace nt::music::testing
