#include "interchange/PremiereArchive.h"
#include "app/MenuRegistry.h"
#include "app/PanelRegistry.h"
#include "interchange/PremiereTransfer.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"

#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSettings>
#include <QSignalSpy>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QTimer>
#include <QtTest>

#include <functional>
#include <memory>

using nt::interchange::StreamZip;
using nt::interchange::writeImportArchive;

namespace {
struct Request {
    QByteArray method, target, body;
    QHash<QByteArray, QByteArray> headers;
};
struct Reply {
    int status = 200;
    QByteArray body;
    QHash<QByteArray, QByteArray> headers;
    int chunk = 0;    // > 0: send this many bytes per tick
    int delayMs = 0;  // the tick
};

// A small HTTP/1.1 server with the two Premiere routes. It runs on the test thread, which spins the event loop.
class Server : public QObject {
public:
    using Handler = std::function<Reply(const Request&)>;
    Server() {
        connect(&m_server, &QTcpServer::newConnection, this, [this] {
            while (QTcpSocket* socket = m_server.nextPendingConnection()) accept(socket);
        });
        m_server.listen(QHostAddress::LocalHost, 0);
    }
    QUrl base() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(m_server.serverPort())); }
    void setHandler(Handler handler) { m_handler = std::move(handler); }
    QList<Request> requests() const { return m_requests; }
private:
    void accept(QTcpSocket* socket) {
        // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
        auto buffer = std::make_shared<QByteArray>();
        connect(socket, &QTcpSocket::readyRead, socket, [this, socket, buffer] {
            buffer->append(socket->readAll());
            const int end = buffer->indexOf("\r\n\r\n");
            if (end < 0) return;
            Request request;
            qint64 length = 0;
            const auto lines = buffer->left(end).split('\n');
            const auto first = lines.value(0).trimmed().split(' ');
            request.method = first.value(0);
            request.target = first.value(1);
            for (int index = 1; index < lines.size(); ++index) {
                const int colon = lines[index].indexOf(':');
                if (colon > 0) request.headers.insert(lines[index].left(colon).trimmed().toLower(), lines[index].mid(colon + 1).trimmed());
            }
            length = request.headers.value("content-length").toLongLong();
            if (buffer->size() < end + 4 + length) return;
            request.body = buffer->mid(end + 4, length);
            buffer->clear();
            m_requests.append(request);
            respond(socket, m_handler ? m_handler(request) : Reply{404, "{}", {}, 0, 0});
        });
        connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
    }
    void respond(QTcpSocket* socket, const Reply& reply) {
        QByteArray head = "HTTP/1.1 " + QByteArray::number(reply.status) + " X\r\nConnection: close\r\nContent-Length: " + QByteArray::number(reply.body.size()) + "\r\n";
        for (auto it = reply.headers.begin(); it != reply.headers.end(); ++it) head += it.key() + ": " + it.value() + "\r\n";
        socket->write(head + "\r\n");
        if (reply.chunk <= 0) {
            socket->write(reply.body);
            socket->disconnectFromHost();
            return;
        }
        // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
        auto offset = std::make_shared<qint64>(0);
        auto* timer = new QTimer(socket);
        connect(timer, &QTimer::timeout, socket, [socket, timer, offset, reply] {
            socket->write(reply.body.mid(*offset, reply.chunk));
            *offset += reply.chunk;
            if (*offset >= reply.body.size()) {
                timer->stop();
                socket->disconnectFromHost();
            }
        });
        timer->start(reply.delayMs);
    }
    QTcpServer m_server;
    Handler m_handler;
    QList<Request> m_requests;
};

QByteArray bytesOf(qint64 size, int seed = 1) {
    QByteArray bytes(static_cast<qsizetype>(size), 0);
    quint32 state = static_cast<quint32>(seed) * 2654435761U;
    for (auto& byte : bytes) {
        state = state * 1664525U + 1013904223U;
        byte = static_cast<char>(state >> 24);
    }
    return bytes;
}

bool write(const QString& path, const QByteArray& bytes) {
    QDir().mkpath(QFileInfo(path).absolutePath());
    QFile file(path);
    return file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size();
}

QString sequenceXml(const QStringList& pathurls) {
    QString clips;
    int index = 0;
    for (const QString& url : pathurls) {
        ++index;
        clips += QStringLiteral("<clipitem id=\"c%1\"><name>Clip %1</name><file id=\"f%1\"><name>f%1</name><pathurl>%2</pathurl></file></clipitem>").arg(index).arg(url);
    }
    return QStringLiteral("<?xml version=\"1.0\"?><xmeml version=\"4\"><sequence><name>S</name><media><video><track>%1</track></video></media></sequence></xmeml>").arg(clips);
}

nt::server::SaveTarget targetFor(const Server& server) {
    nt::server::SaveTarget target;
    target.server = server.base();
    target.timelineId = QStringLiteral("abc123");
    return target;
}

QByteArray reportHeader(int exported, const QStringList& warnings, int omitted) {
    QJsonArray array;
    for (const auto& warning : warnings) array.append(warning);
    return QUrl::toPercentEncoding(QString::fromUtf8(QJsonDocument(QJsonObject{{"clipsExported", exported}, {"warnings", array}, {"omitted", omitted}}).toJson(QJsonDocument::Compact)));
}

QObject* byName(QObject* root, const QString& name) {
    if (!root) return nullptr;
    if (root->objectName() == name) return root;
    if (auto* item = qobject_cast<QQuickItem*>(root)) {
        for (auto* child : item->childItems()) {
            if (auto* found = byName(child, name)) return found;
        }
    }
    for (auto* child : root->children()) {
        if (auto* found = byName(child, name)) return found;
    }
    return nullptr;
}
}  // namespace

class PremiereTest : public QObject {
    Q_OBJECT
private:
    // Reads a zip with Python, which checks every CRC, and prints `name<TAB>size` per entry.
    static QString listZip(const QString& path, bool* ok) {
        QProcess python;
        python.start("python3", {"-I", "-c", R"(
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    assert z.testzip() is None
    assert all(i.compress_type == zipfile.ZIP_STORED for i in z.infolist())
    for i in z.infolist():
        print(i.filename + '\t' + str(i.file_size))
)", path});
        *ok = python.waitForFinished(30000) && python.exitCode() == 0;
        return QString::fromUtf8(python.readAllStandardOutput());
    }
    static QByteArray zipEntry(const QString& path, const QString& name) {
        QProcess python;
        python.start("python3", {"-I", "-c", "import sys, zipfile\nsys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))", path, name});
        python.waitForFinished(30000);
        return python.readAllStandardOutput();
    }
    std::unique_ptr<TimelineModel> serverModel(const QString& projectId) {
        const QJsonObject raw{{"width", 64}, {"height", 48}, {"fps", 3}, {"projectId", projectId}, {"name", "Cut: one/two"},
            {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}}, {"clips", QJsonArray{}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        auto model = std::make_unique<TimelineModel>();
        model->setTimeline(std::move(*parsed.timeline));
        return model;
    }

    static nt::app::ShellMenuEntry menuEntry(const QString& action) {
        for (const auto& entry : nt::app::shellMenuEntries(QStringLiteral("File"))) {
            if (entry.action == action) return entry;
        }
        return {};
    }

private slots:
    void fileMenuHoldsBothCommands() {
        const auto exported = menuEntry("exportPremiere");
        const auto imported = menuEntry("importPremiere");
        QCOMPARE(exported.label, QStringLiteral("Export to Premiere Pro…"));
        QCOMPARE(imported.label, QStringLiteral("Import Premiere XML…"));
        QCOMPARE(exported.group, imported.group);
        QVERIFY(imported.order < exported.order);
        // Enabled whenever an editor is open, so a timeline from a file can say why it cannot run.
        QQuickItem editor;
        const QVariantMap open{{"gestures", QVariant::fromValue<QObject*>(&editor)}};
        for (const auto& entry : {exported, imported}) {
            QVERIFY(!entry.enabled({}));
            QVERIFY(entry.enabled(open));
            // With no panel in the editor's window there is nothing to open, and the item says so by returning false.
            QVERIFY(!entry.run(open));
        }
        const auto panels = PanelRegistry().forSlot(QStringLiteral("overlay"));
        const bool found = std::any_of(panels.begin(), panels.end(), [](const QVariant& panel) {
            return panel.toMap().value("id") == "premiere" && panel.toMap().value("source").toUrl().path().endsWith("interchange/PremierePanel.qml");
        });
        QVERIFY(found);
    }

    void archivePacksTheXmlAndItsMedia() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QByteArray big = bytesOf(2'600'000, 3);
        const QByteArray small = bytesOf(1000, 4);
        QVERIFY(write(dir.filePath("seq/media/a b.mp4"), big));
        QVERIFY(write(dir.filePath("seq/media/c.mov"), small));
        QVERIFY(write(dir.filePath("seq/media/x&y.wav"), QByteArray("wave")));
        const QString xml = sequenceXml({
            "file://localhost" + dir.filePath("seq/media/a%20b.mp4"),
            "media/c.mov",
            "file://localhost/Users/other/gone.mp4",
            "file://localhost/Users/other/c.mov",  // another machine's path: the one c.mov below the XML
            "file://localhost" + dir.filePath("seq/media/x&amp;y.wav"),
            "media/c.mov"});
        QVERIFY(write(dir.filePath("seq/Cut one.xml"), xml.toUtf8()));
        QList<QPair<int, int>> steps;
        const auto result = writeImportArchive(dir.filePath("seq/Cut one.xml"), dir.filePath("out.zip"), [&](int done, int total) {
            if (steps.isEmpty() || steps.last() != qMakePair(done, total)) steps.append({done, total});
            return true;
        });
        QVERIFY2(result.ok, qPrintable(result.error));
        QCOMPARE(result.mediaFiles, 3);
        QCOMPARE(result.missing, QStringList{"file://localhost/Users/other/gone.mp4"});
        QCOMPARE(steps.last(), qMakePair(3, 3));
        bool ok = false;
        const QString listing = listZip(dir.filePath("out.zip"), &ok);
        QVERIFY2(ok, qPrintable(listing));
        QVERIFY(listing.contains(QStringLiteral("Cut_one.xml\t")));
        QVERIFY(listing.contains(QStringLiteral("media/1-a_b.mp4\t2600000")));
        QVERIFY(listing.contains(QStringLiteral("media/2-c.mov\t1000")));
        QVERIFY(listing.contains(QStringLiteral("media/3-x_y.wav\t4")));
        QCOMPARE(zipEntry(dir.filePath("out.zip"), "media/1-a_b.mp4"), big);
        QCOMPARE(zipEntry(dir.filePath("out.zip"), "media/2-c.mov"), small);
        const QString packed = QString::fromUtf8(zipEntry(dir.filePath("out.zip"), "Cut_one.xml"));
        QCOMPARE(packed.count(QStringLiteral("<pathurl>media/2-c.mov</pathurl>")), 3);
        QVERIFY(packed.contains(QStringLiteral("<pathurl>media/1-a_b.mp4</pathurl>")));
        // A file the disk does not hold keeps its path, and the server counts its clip as missing.
        QVERIFY(packed.contains(QStringLiteral("<pathurl>file://localhost/Users/other/gone.mp4</pathurl>")));
    }

    void archiveRefusesWhatIsNotASequence() {
        QTemporaryDir dir;
        QVERIFY(write(dir.filePath("notes.xml"), "<project/>"));
        const auto result = writeImportArchive(dir.filePath("notes.xml"), dir.filePath("out.zip"));
        QVERIFY(!result.ok);
        QVERIFY2(result.error.contains("not a Final Cut Pro XML"), qPrintable(result.error));
        QVERIFY(!QFile::exists(dir.filePath("out.zip")));
        QVERIFY(!writeImportArchive(dir.filePath("absent.xml"), dir.filePath("out.zip")).ok);
    }

    void archiveStopsWhenAskedAndLeavesNothing() {
        QTemporaryDir dir;
        QVERIFY(write(dir.filePath("a.mp4"), bytesOf(3'000'000)));
        QVERIFY(write(dir.filePath("b.mp4"), bytesOf(10)));
        QVERIFY(write(dir.filePath("seq.xml"), sequenceXml({"a.mp4", "b.mp4"}).toUtf8()));
        int calls = 0;
        const auto result = writeImportArchive(dir.filePath("seq.xml"), dir.filePath("out.zip"), [&](int, int) { return ++calls < 3; });
        QVERIFY(!result.ok);
        QCOMPARE(result.error, QStringLiteral("Cancelled."));
        QVERIFY(!QFile::exists(dir.filePath("out.zip")));
    }

    void mediaPathResolution() {
        QTemporaryDir dir;
        QVERIFY(write(dir.filePath("seq/media/one two.mp4"), "1"));
        QVERIFY(write(dir.filePath("seq/deep/only.mp4"), "2"));
        QVERIFY(write(dir.filePath("seq/a/twice.mp4"), "3"));
        QVERIFY(write(dir.filePath("seq/b/twice.mp4"), "4"));
        const QString base = dir.filePath("seq");
        QCOMPARE(nt::interchange::localMediaPath("media/one two.mp4", base), QFileInfo(dir.filePath("seq/media/one two.mp4")).absoluteFilePath());
        QCOMPARE(nt::interchange::localMediaPath("file://localhost" + QString::fromLatin1(QUrl::toPercentEncoding(dir.filePath("seq/media/one two.mp4"), "/")), base),
                 QFileInfo(dir.filePath("seq/media/one two.mp4")).absoluteFilePath());
        QCOMPARE(nt::interchange::localMediaPath("file://localhost/Users/me/only.mp4", base), QFileInfo(dir.filePath("seq/deep/only.mp4")).absoluteFilePath());
        QCOMPARE(nt::interchange::localMediaPath("C:\\Footage\\twice.mp4", base), QString());  // two files of that name
        QCOMPARE(nt::interchange::localMediaPath("nothing.mp4", base), QString());
        QCOMPARE(nt::interchange::localMediaPath("", base), QString());
    }

    void zipRefusesWhatItCannotHold() {
        QTemporaryDir dir;
        QFile out(dir.filePath("z.zip"));
        QVERIFY(out.open(QIODevice::WriteOnly));
        StreamZip zip(out);
        QVERIFY(!zip.add(QString(70000, u'n'), "x"));
        QVERIFY(zip.error().contains("4 GiB"));
        QVERIFY(!zip.addFile("missing", dir.filePath("absent")));
        QVERIFY(zip.error().contains("Cannot read") || !zip.error().isEmpty());
    }

    void exportSavesTheZipAndTheReport() {
        QTemporaryDir dir;
        const QByteArray zip = "PK\3\4" + bytesOf(300'000, 9);
        Server server;
        server.setHandler([&](const Request& request) -> Reply {
            if (request.target == "/api/timelines/abc123/export-premiere") {
                return {200, zip, {{"content-type", "application/zip"},
                    {"x-nodetool-export-report", reportHeader(2, {"Hero: effects require baking.", "Logo: blend mode requires baking."}, 4)}}, 40'000, 1};
            }
            return {404, R"({"detail":"Not found"})", {}, 0, 0};
        });
        PremiereTransfer transfer;
        auto target = targetFor(server);
        target.token = "secret-token";
        transfer.setTarget(target);
        QVERIFY(transfer.available());
        QSignalSpy finished(&transfer, &PremiereTransfer::finished);
        const QString path = dir.filePath("My_Cut-premiere");
        transfer.exportTo(QUrl::fromLocalFile(path).toString());
        QVERIFY(transfer.running());
        QCOMPARE(transfer.mode(), QStringLiteral("export"));
        QTRY_VERIFY_WITH_TIMEOUT(!transfer.running(), 20000);
        QCOMPARE(finished.count(), 1);
        QVERIFY2(transfer.error().isEmpty(), qPrintable(transfer.error()));
        QVERIFY(transfer.done());
        // A path with no extension gets .zip.
        QCOMPARE(transfer.outputPath(), QFileInfo(path + ".zip").absoluteFilePath());
        QFile saved(path + ".zip");
        QVERIFY(saved.open(QIODevice::ReadOnly));
        QCOMPARE(saved.readAll(), zip);
        QCOMPARE(transfer.clipsExported(), 2);
        QCOMPARE(transfer.notes(), (QStringList{"Hero: effects require baking.", "Logo: blend mode requires baking."}));
        QCOMPARE(transfer.omittedNotes(), 4);
        QCOMPARE(server.requests().size(), 1);
        QCOMPARE(server.requests().first().headers.value("authorization"), QByteArray("Bearer secret-token"));
        QVERIFY(server.requests().first().headers.value("x-nodetool-client").startsWith("native-timeline/"));
        // No partial file stays beside the result.
        QCOMPARE(QDir(dir.path()).entryList(QDir::Files), QStringList{"My_Cut-premiere.zip"});
        transfer.dismiss();
        QVERIFY(!transfer.done());
        QVERIFY(transfer.mode().isEmpty());
    }

    // The server's report cannot see param curves, so the note comes from the open document.
    void exportNamesTheKeysTheXmlLeavesOut() {
        QTemporaryDir dir;
        Server server;
        server.setHandler([&](const Request& request) -> Reply {
            if (request.target == "/api/timelines/abc123/export-premiere") {
                return {200, "PK\3\4", {{"content-type", "application/zip"}, {"x-nodetool-export-report", reportHeader(1, {}, 0)}}, 0, 0};
            }
            return {404, R"({"detail":"Not found"})", {}, 0, 0};
        });
        TimelineModel model;
        model.setTimeline(*nt::parseTimelineJson(QJsonDocument(QJsonObject{
            {"name", "Keys"}, {"width", 64}, {"height", 64}, {"fps", 30}, {"durationMs", 1000},
            {"tracks", QJsonArray{QJsonObject{{"id", "a"}, {"type", "audio"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "a"}, {"mediaType", "audio"}, {"startMs", 0}, {"durationMs", 1000},
                {"paramCurves", QJsonArray{QJsonObject{{"property", "volumeDb"},
                    {"keyframes", QJsonArray{QJsonObject{{"t", 0}, {"value", -6}}}}}}}}}}}).toJson()).timeline);
        PremiereTransfer transfer;
        transfer.setTimeline(&model);
        transfer.setTarget(targetFor(server));
        transfer.exportTo(QUrl::fromLocalFile(dir.filePath("keys.zip")).toString());
        QTRY_VERIFY_WITH_TIMEOUT(!transfer.running(), 20000);
        QVERIFY2(transfer.error().isEmpty(), qPrintable(transfer.error()));
        QCOMPARE(transfer.notes(), QStringList{"Premiere XML has no keyframes for Volume on 1 clip, so the XML carries the static values."});
    }
    void exportFailureKeepsTheFileThatWasThere() {
        QTemporaryDir dir;
        const QString path = dir.filePath("keep.zip");
        QVERIFY(write(path, "earlier export"));
        Server server;
        server.setHandler([](const Request&) -> Reply { return {404, R"({"detail":"Timeline not found"})", {}, 0, 0}; });
        PremiereTransfer transfer;
        transfer.setTarget(targetFor(server));
        transfer.exportTo(path);
        QTRY_VERIFY_WITH_TIMEOUT(!transfer.running(), 20000);
        QVERIFY(!transfer.done());
        QCOMPARE(transfer.error(), QStringLiteral("Timeline not found"));
        QFile kept(path);
        QVERIFY(kept.open(QIODevice::ReadOnly));
        QCOMPARE(kept.readAll(), QByteArray("earlier export"));
        QCOMPARE(QDir(dir.path()).entryList(QDir::Files), QStringList{"keep.zip"});
    }

    void exportReportsAServerThatIsNotThere() {
        QTemporaryDir dir;
        PremiereTransfer transfer;
        nt::server::SaveTarget target;
        target.server = QUrl("http://127.0.0.1:1");
        target.timelineId = "abc123";
        transfer.setTarget(target);
        transfer.exportTo(dir.filePath("none.zip"));
        QTRY_VERIFY_WITH_TIMEOUT(!transfer.running(), 20000);
        QVERIFY(!transfer.done());
        QVERIFY(!transfer.error().isEmpty());
        QVERIFY(!QFile::exists(dir.filePath("none.zip")));
    }

    void exportCancelLeavesNothing() {
        QTemporaryDir dir;
        Server server;
        server.setHandler([](const Request&) -> Reply {
            return {200, bytesOf(2'000'000), {{"content-type", "application/zip"}}, 20'000, 20};
        });
        PremiereTransfer transfer;
        transfer.setTarget(targetFor(server));
        QSignalSpy finished(&transfer, &PremiereTransfer::finished);
        transfer.exportTo(dir.filePath("cancelled.zip"));
        QTRY_VERIFY_WITH_TIMEOUT(transfer.ratio() > 0.05 && transfer.ratio() < 1, 20000);
        QVERIFY(transfer.transferredBytes() > 0);
        transfer.cancel();
        QTRY_VERIFY_WITH_TIMEOUT(!transfer.running(), 20000);
        QCOMPARE(finished.count(), 1);
        QVERIFY(!finished.first().first().toBool());
        // A cancel is not a failure: no error, no result, no file.
        QVERIFY(transfer.error().isEmpty());
        QVERIFY(transfer.mode().isEmpty());
        QVERIFY(!transfer.done());
        QVERIFY(QDir(dir.path()).entryList(QDir::Files).isEmpty());
    }

    void aTimelineFromAFileIsRefusedWithAReason() {
        Server server;
        PremiereTransfer transfer;
        transfer.setTarget(std::nullopt);
        QVERIFY(!transfer.available());
        QVERIFY(transfer.unavailableReason().contains("opened from a file"));
        QVERIFY(transfer.unavailableReason().contains("Open it from a server"));
        QSignalSpy finished(&transfer, &PremiereTransfer::finished);
        QTemporaryDir dir;
        transfer.exportTo(dir.filePath("x.zip"));
        QCOMPARE(transfer.error(), transfer.unavailableReason());
        QVERIFY(!transfer.running());
        transfer.importFrom(dir.filePath("x.xml"));
        QCOMPARE(transfer.error(), transfer.unavailableReason());
        QCOMPARE(finished.count(), 2);
        QVERIFY(server.requests().isEmpty());
    }

    void importPacksAnXmlAndUploadsIt() {
        QTemporaryDir dir;
        QVERIFY(write(dir.filePath("seq/media/shot.mp4"), bytesOf(5000)));
        QVERIFY(write(dir.filePath("seq/Cut.xml"), sequenceXml({"media/shot.mp4", "file://localhost/Users/other/absent.mp4"}).toUtf8()));
        Server server;
        server.setHandler([](const Request& request) -> Reply {
            if (request.method == "POST" && request.target == "/api/timelines/import-zip") {
                const QJsonObject body{{"timeline", QJsonObject{{"id", "new-id"}, {"name", "Imported cut"}, {"clips", QJsonArray{1, 2, 3}}}},
                    {"imported", 1}, {"missing_clips", 1}, {"warnings", QJsonArray{"1 clip(s) were left out because their media was not supplied: absent.mp4."}}};
                return {200, QJsonDocument(body).toJson(QJsonDocument::Compact), {{"content-type", "application/json"}}, 0, 0};
            }
            return {404, "{}", {}, 0, 0};
        });
        auto model = serverModel("project-9");
        PremiereTransfer transfer;
        transfer.setTimeline(model.get());
        transfer.setTarget(targetFor(server));
        QSignalSpy finished(&transfer, &PremiereTransfer::finished);
        transfer.importFrom(QUrl::fromLocalFile(dir.filePath("seq/Cut.xml")).toString());
        QTRY_VERIFY_WITH_TIMEOUT(!transfer.running(), 30000);
        QVERIFY2(transfer.error().isEmpty(), qPrintable(transfer.error()));
        QVERIFY(transfer.done());
        QCOMPARE(transfer.importedId(), QStringLiteral("new-id"));
        QCOMPARE(transfer.importedName(), QStringLiteral("Imported cut"));
        QCOMPARE(transfer.importedMedia(), 1);
        QCOMPARE(transfer.importedClips(), 3);
        QCOMPARE(transfer.missingClips(), 1);
        // The packer's note about the file it could not find comes before the server's.
        QCOMPARE(transfer.notes().size(), 2);
        QVERIFY(transfer.notes().first().contains("absent.mp4"));
        QVERIFY(transfer.notes().last().contains("left out"));
        QCOMPARE(server.requests().size(), 1);
        const auto request = server.requests().first();
        QVERIFY(request.headers.value("content-type").startsWith("multipart/form-data"));
        QVERIFY(request.body.contains("name=\"json\""));
        QVERIFY(request.body.contains("{\"project_id\":\"project-9\"}"));
        QVERIFY(request.body.contains("name=\"file\"; filename=\"premiere-import.zip\""));
        QVERIFY(request.body.toLower().contains("content-type: application/zip"));
        // The zip inside the upload carries the XML and the packed media.
        QVERIFY(request.body.contains("Cut.xml"));
        QVERIFY(request.body.contains("media/1-shot.mp4"));
    }

    void importSendsAZipAsItIs() {
        QTemporaryDir dir;
        const QByteArray zip = "PK\3\4" + bytesOf(2000, 5);
        QVERIFY(write(dir.filePath("export.zip"), zip));
        Server server;
        server.setHandler([](const Request&) -> Reply {
            return {200, R"({"timeline":{"id":"z","name":"Z","clips":[]},"imported":0,"missing_clips":0,"warnings":[]})", {}, 0, 0};
        });
        PremiereTransfer transfer;
        transfer.setTarget(targetFor(server));
        transfer.importFrom(dir.filePath("export.zip"));
        QTRY_VERIFY_WITH_TIMEOUT(!transfer.running(), 30000);
        QVERIFY2(transfer.error().isEmpty(), qPrintable(transfer.error()));
        QVERIFY(server.requests().first().body.contains(zip));
        // A timeline with no project sends no project.
        QVERIFY(server.requests().first().body.contains("{}"));
    }

    void importShowsTheServersWordsAndRefusesOtherFiles() {
        QTemporaryDir dir;
        QVERIFY(write(dir.filePath("seq.xml"), sequenceXml({}).toUtf8()));
        Server server;
        server.setHandler([](const Request&) -> Reply { return {400, R"({"detail":"Invalid Premiere XML: The XML holds no sequence."})", {}, 0, 0}; });
        PremiereTransfer transfer;
        transfer.setTarget(targetFor(server));
        transfer.importFrom(dir.filePath("seq.xml"));
        QTRY_VERIFY_WITH_TIMEOUT(!transfer.running(), 30000);
        QVERIFY(!transfer.done());
        QCOMPARE(transfer.error(), QStringLiteral("Invalid Premiere XML: The XML holds no sequence."));
        QVERIFY(write(dir.filePath("movie.mov"), "x"));
        transfer.importFrom(dir.filePath("movie.mov"));
        QVERIFY(!transfer.running());
        QVERIFY(transfer.error().contains("not a sequence XML or a zip"));
        transfer.importFrom(dir.filePath("absent.xml"));
        QVERIFY(transfer.error().contains("Choose the sequence XML"));
    }

    void importCancelStopsTheUpload() {
        QTemporaryDir dir;
        QVERIFY(write(dir.filePath("big.zip"), "PK\3\4" + bytesOf(6'000'000)));
        Server server;
        // The server never answers, as a stalled one would not.
        server.setHandler([](const Request&) -> Reply { return {200, bytesOf(100'000), {}, 10, 1000}; });
        PremiereTransfer transfer;
        transfer.setTarget(targetFor(server));
        QSignalSpy finished(&transfer, &PremiereTransfer::finished);
        transfer.importFrom(dir.filePath("big.zip"));
        QTRY_COMPARE_WITH_TIMEOUT(transfer.phase(), QStringLiteral("transferring"), 20000);
        transfer.cancel();
        QTRY_VERIFY_WITH_TIMEOUT(!transfer.running(), 20000);
        QVERIFY(!transfer.done());
        QVERIFY(transfer.error().isEmpty());
        QVERIFY(transfer.mode().isEmpty());
        QCOMPARE(finished.count(), 1);
    }

    void suggestedNameIsSafe() {
        auto model = serverModel("p");
        PremiereTransfer transfer;
        transfer.setTimeline(model.get());
        QCOMPARE(QFileInfo(transfer.suggestedExportPath()).fileName(), QStringLiteral("Cut_one_two-premiere.zip"));
    }

    void panelShowsTheReasonThenTheReport() {
        QTemporaryDir dir;
        QTemporaryDir exportDir;
        Server server;
        server.setHandler([&](const Request&) -> Reply {
            return {200, "PK\3\4" + bytesOf(5000), {{"x-nodetool-export-report", reportHeader(3, {"Hero: effects require baking.", "Logo: blend mode requires baking."}, 1)}}, 0, 0};
        });
        auto model = serverModel("p");
        QQmlEngine engine;
        QQuickWindow window;
        window.resize(900, 600);
        QQmlComponent backdrop(&engine);
        backdrop.setData("import QtQuick\nimport NodeTool.UiPrimitives as Ui\nRectangle { color: Ui.Theme.surfaceCanvas }", QUrl());
        std::unique_ptr<QObject> ground(backdrop.create());
        QVERIFY2(ground, qPrintable(backdrop.errorString()));
        qobject_cast<QQuickItem*>(ground.get())->setParentItem(window.contentItem());
        qobject_cast<QQuickItem*>(ground.get())->setSize({900, 600});
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/interchange/PremierePanel.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> object(component.createWithInitialProperties({{"timelineModel", QVariant::fromValue(model.get())}, {"width", 900}, {"height", 600}}));
        QVERIFY2(object, qPrintable(component.errorString()));
        auto* panel = qobject_cast<QQuickItem*>(object.get());
        panel->setParentItem(window.contentItem());
        auto* transfer = qobject_cast<PremiereTransfer*>(qvariant_cast<QObject*>(panel->property("controller")));
        QVERIFY(transfer);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        const auto capture = [&](const QString& name) {
            const QString directory = qEnvironmentVariable("NT_PREMIERE_CAPTURE_DIR");
            if (directory.isEmpty()) return;
            QTest::qWait(350);
            QDir().mkpath(directory);
            QVERIFY(window.grabWindow().save(QDir(directory).filePath(name + ".png")));
        };

        // A timeline from a file: the menu item opens a dialog that says why it cannot run.
        transfer->setTarget(std::nullopt);
        QQuickItem editor;
        editor.setParentItem(window.contentItem());
        const QVariantMap context{{"gestures", QVariant::fromValue<QObject*>(&editor)}};
        QVERIFY(menuEntry("exportPremiere").run(context));
        QTRY_VERIFY(byName(panel, "premiereReasonDialog") && byName(panel, "premiereReasonDialog")->property("opened").toBool());
        QCOMPARE(byName(panel, "premiereReason")->property("text").toString(), transfer->unavailableReason());
        capture("reason");
        QVERIFY(QMetaObject::invokeMethod(byName(panel, "premiereReasonDialog"), "close"));
        QTRY_VERIFY(!byName(panel, "premiereReasonDialog")->property("visible").toBool());

        // A server timeline: a finished export opens the report, listing what was left out.
        transfer->setTarget(targetFor(server));
        QSignalSpy finished(transfer, &PremiereTransfer::finished);
        transfer->exportTo(exportDir.filePath("cut.zip"));
        QTRY_VERIFY_WITH_TIMEOUT(finished.count() == 1, 20000);
        auto* result = byName(panel, "premiereResultDialog");
        QTRY_VERIFY(result->property("opened").toBool());
        QCOMPARE(result->property("title").toString(), QStringLiteral("Export to Premiere Pro"));
        QCOMPARE(byName(panel, "premiereResultStatus")->property("message").toString(), QStringLiteral("3 clips exported."));
        QCOMPARE(byName(panel, "premiereNotesTitle")->property("text").toString(), QStringLiteral("Left out or needs baking"));
        QVERIFY(byName(panel, "premiereSavedPath")->property("text").toString().endsWith("cut.zip"));
        QVERIFY(byName(panel, "premiereOmitted")->property("visible").toBool());
        QCOMPARE(byName(panel, "premiereOmitted")->property("text").toString(), QStringLiteral("1 more is listed in export-report.txt inside the zip."));
        QTRY_VERIFY(byName(result, "premiereNote") != nullptr);
        capture("report");
        QVERIFY(QMetaObject::invokeMethod(result, "close"));
        QTRY_VERIFY(!transfer->done());

        // An import ends in the same dialog, with a way to open the new timeline.
        QVERIFY(write(exportDir.filePath("seq/media/shot.mp4"), bytesOf(4000)));
        QVERIFY(write(exportDir.filePath("seq/Cut.xml"), sequenceXml({"media/shot.mp4", "file://localhost/Users/other/absent.mp4"}).toUtf8()));
        server.setHandler([](const Request&) -> Reply {
            return {200, R"({"timeline":{"id":"new-id","name":"Cut","clips":[1,2]},"imported":1,"missing_clips":1,"warnings":["1 clip(s) were left out because their media was not supplied: absent.mp4."]})", {}, 0, 0};
        });
        finished.clear();
        transfer->importFrom(exportDir.filePath("seq/Cut.xml"));
        QTRY_VERIFY_WITH_TIMEOUT(finished.count() == 1, 30000);
        QTRY_VERIFY(result->property("opened").toBool());
        QCOMPARE(result->property("title").toString(), QStringLiteral("Import Premiere XML"));
        QCOMPARE(byName(panel, "premiereResultStatus")->property("message").toString(), QStringLiteral("Added \"Cut\" as a new timeline with 2 clips from 1 media file."));
        QVERIFY(byName(panel, "premiereOpenImported")->property("visible").toBool());
        QVERIFY(!byName(panel, "premiereReveal")->property("visible").toBool());
        QCOMPARE(transfer->missingClips(), 1);
        QCOMPARE(byName(panel, "premiereNotesTitle")->property("text").toString(), QStringLiteral("Left out or changed"));
        capture("imported");
        QVERIFY(QMetaObject::invokeMethod(result, "close"));
        QTRY_VERIFY(!transfer->done());

        // While it runs a progress row shows with a Cancel button.
        server.setHandler([](const Request&) -> Reply { return {200, bytesOf(2'000'000), {}, 20'000, 20}; });
        transfer->exportTo(exportDir.filePath("slow.zip"));
        QTRY_VERIFY_WITH_TIMEOUT(byName(panel, "premiereProgress")->property("visible").toBool() && transfer->ratio() > 0.1, 20000);
        QVERIFY(byName(panel, "premiereCancel")->property("visible").toBool());
        QVERIFY(byName(panel, "premiereProgressText")->property("text").toString().contains("Exporting"));
        capture("progress");
        transfer->cancel();
        QTRY_VERIFY_WITH_TIMEOUT(!transfer->running(), 20000);
        QTRY_VERIFY(!byName(panel, "premiereProgress")->property("visible").toBool());
    }

    void realServer() {
        const QString base = qEnvironmentVariable("NT_PREMIERE_SERVER");
        if (base.isEmpty()) QSKIP("Set NT_PREMIERE_SERVER to a scratch server");
        const QString output = qEnvironmentVariable("NT_PREMIERE_OUTPUT");
        nt::server::SaveTarget target;
        target.server = QUrl(base);
        target.timelineId = qEnvironmentVariable("NT_PREMIERE_TIMELINE");
        target.expectedInstance = qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE");
        PremiereTransfer exporter;
        exporter.setTarget(target);
        QSignalSpy finished(&exporter, &PremiereTransfer::finished);
        exporter.exportTo(output);
        QTRY_VERIFY_WITH_TIMEOUT(finished.count() == 1, 120000);
        QVERIFY2(exporter.done(), qPrintable(exporter.error()));
        QVERIFY(QFileInfo(output).size() > 0);
        QFile report(qEnvironmentVariable("NT_PREMIERE_REPORT"));
        QVERIFY(report.open(QIODevice::WriteOnly));
        report.write(QJsonDocument(QJsonObject{{"clipsExported", exporter.clipsExported()}, {"notes", QJsonArray::fromStringList(exporter.notes())}, {"omitted", exporter.omittedNotes()}}).toJson());
        report.close();

        // Bring the zip back through the import route, as a person would after Premiere.
        PremiereTransfer importer;
        importer.setTarget(target);
        QSignalSpy imported(&importer, &PremiereTransfer::finished);
        importer.importFrom(output);
        QTRY_VERIFY_WITH_TIMEOUT(imported.count() == 1, 120000);
        QVERIFY2(importer.done(), qPrintable(importer.error()));
        QFile result(qEnvironmentVariable("NT_PREMIERE_IMPORTED"));
        QVERIFY(result.open(QIODevice::WriteOnly));
        result.write(importer.importedId().toUtf8());
    }
};

int main(int argc, char** argv) {
    QTemporaryDir settings;
    QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings.path());
    QGuiApplication app(argc, argv);
    PremiereTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_premiere.moc"
