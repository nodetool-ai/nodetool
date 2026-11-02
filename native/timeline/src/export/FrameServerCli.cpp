#include "app/CliModes.h"
#include "export/OffscreenFrames.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "preview/FfmpegSource.h"
#include "preview/hw/HwWindow.h"
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QImageReader>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSaveFile>
#include <QTimer>
#include <QUuid>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <deque>
#include <iostream>
#include <list>
#include <mutex>
#include <set>
#include <stdexcept>
#include <thread>

namespace nt::exporting {
namespace {
struct Document {
    QString key;
    TimelineModel model;
    std::unique_ptr<OffscreenFrames> frames;
    bool image = false;
};
class FrameServer : public QObject {
public:
    void enqueue(QJsonObject request) {
        m_requests.push_back(std::move(request));
        if (!m_busy) next();
    }
    void cancel(int id) {
        std::scoped_lock lock(m_mutex);
        m_cancelled.insert(id);
    }
    void close() { m_eof = true; }
private:
    bool cancelled(int id) {
        std::scoped_lock lock(m_mutex);
        return m_eof || m_cancelled.contains(id);
    }
    Document& document(const QJsonObject& request) {
        const bool sequence = request.value("kind") == "sequence";
        const QString path = request.value(sequence ? "snapshot" : "path").toString();
        const QString key = (sequence ? "sequence:" : "source:") + path;
        for (auto it = m_documents.begin(); it != m_documents.end(); ++it) {
            if ((*it)->key == key) {
                m_documents.splice(m_documents.begin(), m_documents, it);
                return **m_documents.begin();
            }
        }
        if (m_documents.size() == 2) m_documents.pop_back();
        auto doc = std::make_unique<Document>();
        doc->key = key;
        if (sequence) {
            auto parsed = nt::loadTimelineFile(path);
            if (!parsed.timeline) throw std::runtime_error(parsed.error.toStdString());
            doc->model.setTimeline(pictureTimeline(*parsed.timeline));
        } else {
            QImageReader reader(path);
            doc->image = reader.canRead();
            QSize size;
            double fps = 30;
            if (doc->image) {
                size = reader.size();
            } else {
                const auto facts = nt::probeMedia(path.toStdString());
                if (!facts.usable() || facts.width <= 0 || facts.height <= 0) {
                    const auto reason = !facts.error.empty() ? facts.error : !facts.rejection.empty()
                        ? facts.rejection : "The source has no picture.";
                    throw std::runtime_error(reason);
                }
                size = QSize(facts.width, facts.height);
                if (facts.frameRate > 0 && std::isfinite(facts.frameRate)) fps = facts.frameRate;
            }
            if (!size.isValid()) throw std::runtime_error("Cannot read the source image size.");
            const QJsonObject clip{{"id", "source"}, {"trackId", "v"},
                {"mediaType", doc->image ? "image" : "video"}, {"status", "generated"},
                {"sourceType", "imported"}, {"mediaPath", path}, {"startMs", 0},
                {"durationMs", 1000}, {"inPointMs", doc->image ? 0 : request.value("timeMs").toDouble()},
                {"width", size.width()}, {"height", size.height()}};
            const QJsonObject raw{{"width", size.width()}, {"height", size.height()}, {"fps", fps},
                {"durationMs", 1000}, {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
                {"clips", QJsonArray{clip}}};
            auto parsed = nt::parseTimeline(raw);
            if (!parsed.timeline) throw std::runtime_error(parsed.error.toStdString());
            doc->model.setTimeline(std::move(*parsed.timeline));
        }
        doc->frames = std::make_unique<OffscreenFrames>(doc->model);
        m_documents.push_front(std::move(doc));
        return **m_documents.begin();
    }
    void next() {
        if (m_requests.empty()) { m_busy = false; return; }
        m_busy = true;
        const auto request = m_requests.front();
        m_requests.pop_front();
        const int id = request.value("id").toInt();
        const double time = request.value("timeMs").toDouble(-1);
        QJsonObject response{{"id", id}};
        QString output;
        try {
            const auto kind = request.value("kind").toString();
            if (id <= 0 || !std::isfinite(time) || time < 0 || (kind != "sequence" && kind != "source")) {
                throw std::runtime_error("Invalid frame request.");
            }
            if (!cancelled(id)) {
                auto& doc = document(request);
                if (kind == "source" && !doc.image) {
                    auto clips = doc.model.clipsJson();
                    auto clip = clips[0].toObject();
                    clip.insert("inPointMs", time);
                    clips[0] = clip;
                    doc.model.replaceClips(clips);
                }
                const auto image = doc.frames->captureAt(kind == "sequence" ? time : 0, [&] { return cancelled(id); });
                if (!cancelled(id)) {
                    if (image.isNull()) throw std::runtime_error("Empty captured frame.");
                    output = QDir(request.value("dir").toString()).filePath(QUuid::createUuid().toString(QUuid::Id128) + ".rgba");
                    QSaveFile file(output);
                    file.setDirectWriteFallback(false);
                    if (!file.open(QIODevice::WriteOnly) ||
                        file.write(reinterpret_cast<const char*>(image.constBits()), image.sizeInBytes()) != image.sizeInBytes() ||
                        !file.commit()) {
                        throw std::runtime_error("Cannot write captured frame.");
                    }
                    response.insert("file", output);
                    response.insert("width", image.width());
                    response.insert("height", image.height());
                    response.insert("stride", image.bytesPerLine());
                    response.insert("timeMs", time);
                }
            }
        } catch (const std::exception& error) {
            response.insert("error", QString::fromUtf8(error.what()));
            m_documents.clear();  // a render error stays on the compositor
        } catch (...) {
            response.insert("error", "Unknown frame capture error.");
            m_documents.clear();
        }
        if (cancelled(id)) {
            if (!output.isEmpty()) QFile::remove(output);
            response = {{"id", id}, {"cancelled", true}};
        }
        {
            std::scoped_lock lock(m_mutex);
            m_cancelled.erase(id);
        }
        if (m_eof) { m_busy = false; return; }
        const auto bytes = QJsonDocument(response).toJson(QJsonDocument::Compact);
        std::fwrite(bytes.constData(), 1, bytes.size(), stdout);
        std::fputc('\n', stdout);
        std::fflush(stdout);
        QTimer::singleShot(0, this, [this] { next(); });
    }
    std::deque<QJsonObject> m_requests;
    std::list<std::unique_ptr<Document>> m_documents;
    std::mutex m_mutex;
    std::set<int> m_cancelled;
    std::atomic<bool> m_eof = false;
    bool m_busy = false;
};
int frameServerCli(int argc, char** argv) {
    qputenv("QT_MAC_DISABLE_FOREGROUND_APPLICATION_TRANSFORM", "1");
    qputenv("QT_MAC_SET_RAISE_PROCESS", "0");
    QGuiApplication app(argc, argv);
    nt::setDecodeMode(nt::DecodeMode::Software);
    nt::hw::selectGraphicsApi(false);
    FrameServer server;
    std::jthread reader([&] {
        std::string line;
        while (std::getline(std::cin, line)) {
            const auto request = QJsonDocument::fromJson(QByteArray::fromStdString(line)).object();
            if (request.contains("cancel")) {
                server.cancel(request.value("cancel").toInt());
            } else {
                QMetaObject::invokeMethod(&server, [&server, request] { server.enqueue(request); }, Qt::QueuedConnection);
            }
        }
        server.close();
        QMetaObject::invokeMethod(&app, &QCoreApplication::quit, Qt::QueuedConnection);
    });
    return app.exec();
}
const bool registered = app::registerCliMode({QStringLiteral("--frame-server"), frameServerCli});
}
}
