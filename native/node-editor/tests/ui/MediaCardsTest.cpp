#include "graph/CanvasDropController.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "media/AudioWaveform.h"
#include "media/VideoFrameView.h"
#include "ui/EditorWindow.h"
#include <QBuffer>
#include <QClipboard>
#include <QDataStream>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QGraphicsView>
#include <QImage>
#include <QJsonDocument>
#include <QMediaPlayer>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QPainter>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWidget>
#include <QStandardPaths>
#include <QTcpServer>
#include <QTcpSocket>
#include <QUrlQuery>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
#include <cmath>
#include <functional>

using namespace nodetool;
using QtNodes::NodeId;

namespace {
const QString AssetId = QStringLiteral("db0ef493d3094c988aaf754c5bca5472");

QByteArray png(const QColor &color, const QSize &size) {
    QImage image(size, QImage::Format_ARGB32);
    image.fill(color);
    QByteArray bytes;
    QBuffer buffer(&bytes);
    buffer.open(QIODevice::WriteOnly);
    image.save(&buffer, "PNG");
    return bytes;
}

// A three second square wave at 8 kHz, long enough for a waveform and a play.
QByteArray wav() {
    QByteArray bytes;
    QDataStream stream(&bytes, QIODevice::WriteOnly);
    stream.setByteOrder(QDataStream::LittleEndian);
    constexpr quint32 samples = 24000;
    stream.writeRawData("RIFF", 4);
    stream << quint32(36 + samples * 2);
    stream.writeRawData("WAVEfmt ", 8);
    stream << quint32(16) << quint16(1) << quint16(1) << quint32(8000) << quint32(16000) << quint16(2) << quint16(16);
    stream.writeRawData("data", 4);
    stream << quint32(samples * 2);
    for (quint32 i = 0; i < samples; ++i) {
        stream << qint16(i % 16 < 8 ? 12000 : -12000);
    }
    return bytes;
}

// Serves media files, the asset lookup MediaResolver makes for an asset id,
// and a missing file. Requests under /hold/ stay open until release().
class MediaServer final : public QTcpServer {
public:
    QHash<QString, QPair<QByteArray, QByteArray>> files;
    QHash<QString, QPointer<QTcpSocket>> held;
    QStringList requests;

    MediaServer() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            while (hasPendingConnections()) {
                auto *socket = nextPendingConnection();
                socket->setParent(this);
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] { respond(socket); });
            }
        });
        QFile video(QStringLiteral(MEDIA_VIDEO_FIXTURE));
        if (video.open(QIODevice::ReadOnly)) {
            files.insert("/media/clip.mp4", {"video/mp4", video.readAll()});
        }
        files.insert("/media/wide.png", {"image/png", png(QColor(220, 30, 30), QSize(800, 400))});
        files.insert("/media/square.png", {"image/png", png(QColor(30, 60, 220), QSize(512, 512))});
        files.insert("/api/storage/1/" + AssetId + ".png", {"image/png", png(QColor(30, 60, 220), QSize(512, 512))});
        files.insert("/media/tone.wav", {"audio/wav", wav()});
    }

    QUrl url() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(serverPort())); }
    QString media(const QString &name) const { return url().toString() + "/media/" + name; }

    void release(const QString &path, const QString &file) {
        if (auto socket = held.take(path)) {
            send(socket, files.value(file).first, files.value(file).second);
        }
    }

private:
    void respond(QTcpSocket *socket) {
        const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
        socket->setProperty("bytes", bytes);
        if (!bytes.contains("\r\n\r\n") || socket->property("done").toBool()) {
            return;
        }
        socket->setProperty("done", true);
        const auto target = QString::fromLatin1(bytes.split(' ').value(1));
        requests.append(target);
        const auto path = target.section('?', 0, 0);
        if (path.startsWith("/hold/")) {
            held.insert(path, socket);
            return;
        }
        if (path == "/trpc/assets.get") {
            const auto input = QJsonDocument::fromJson(QUrlQuery(QUrl("http://fixture" + target)).queryItemValue("input").toUtf8()).object();
            const QJsonObject asset{{"id", input["id"]}, {"content_type", "image/png"}, {"get_url", "/api/storage/1/" + input["id"].toString() + ".png"}};
            send(socket, "application/json", QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson(QJsonDocument::Compact));
            return;
        }
        if (!files.contains(path)) {
            send(socket, "text/plain", "missing", 404);
            return;
        }
        send(socket, files.value(path).first, files.value(path).second);
    }

    static void send(QTcpSocket *socket, const QByteArray &mime, const QByteArray &body, int status = 200) {
        socket->write("HTTP/1.1 " + QByteArray::number(status) + " Fixture\r\nContent-Type: " + mime + "\r\nConnection: close\r\nContent-Length: "
                      + QByteArray::number(body.size()) + "\r\n\r\n" + body);
        socket->disconnectFromHost();
    }
};

QJsonArray readArray(const QString &path, const QString &key = {}) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    const auto document = QJsonDocument::fromJson(file.readAll());
    return key.isEmpty() ? document.array() : document.object()[key].toArray();
}

QJsonArray catalog() {
    auto entries = readArray(QStringLiteral(WINDOW_PARITY_FIXTURE), QStringLiteral("metadata"));
    for (const auto &entry : readArray(QStringLiteral(MEDIA_NODES_FIXTURE))) {
        entries.append(entry);
    }
    return entries;
}

QJsonObject node(const QString &id, const QString &type, int column, int row, const QJsonObject &data) {
    return {{"id", id}, {"type", "nodetool." + type}, {"data", data},
            {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", column * 320}, {"y", row * 420}}}, {"selectable", true}}}};
}

QJsonObject ref(const QString &kind, const QString &uri, const QString &asset = {}) {
    QJsonObject value{{"type", kind}, {"uri", uri}};
    if (!asset.isEmpty()) {
        value["asset_id"] = asset;
    }
    return value;
}

QJsonObject value(const QJsonValue &v) { return {{"value", v}}; }
QJsonObject named(const QString &name, const QJsonValue &v) { return {{"name", name}, {"value", v}, {"description", ""}}; }

bool near(const QColor &actual, const QColor &expected) {
    return std::abs(actual.red() - expected.red()) < 24 && std::abs(actual.green() - expected.green()) < 24
           && std::abs(actual.blue() - expected.blue()) < 24;
}

// Distinct colors in a region, a measure of a decoded video frame or waveform.
int colorCount(const QImage &image, const QRect &region) {
    QSet<QRgb> colors;
    for (int y = region.top(); y <= region.bottom(); y += 2) {
        for (int x = region.left(); x <= region.right(); x += 2) {
            colors.insert(image.pixel(x, y));
        }
    }
    return int(colors.size());
}
} // namespace

class MediaCardsTest final : public QObject {
    Q_OBJECT

    struct Host {
        MediaServer server;
        EditorWindow window;
        QGraphicsView *view = nullptr;

        explicit Host(const QJsonArray &nodes, bool dark = true) {
            window.setDarkTheme(dark);
            window.resize(1440, 900);
            window.show();
            Q_ASSERT(QTest::qWaitForWindowExposed(&window));
            window.setCatalog(catalog());
            const auto loaded = window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"},
                                                                    {"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}});
            Q_ASSERT(loaded.ok);
            emit window.session()->credentialsChanged(server.url(), QStringLiteral("media-token"), QStringLiteral("1"));
            if (window.catalogVisible()) {
                window.action(QStringLiteral("Toggle nodes"));
            }
            settle();
            view = window.findChild<QGraphicsView *>();
            Q_ASSERT(view);
            view->resetTransform();
            view->centerOn(QPointF(700, 300));
            settle();
        }

        WorkflowGraphModel &model() { return static_cast<WorkflowGraphModel &>(window.scene()->graphModel()); }

        NodeId id(const QString &resource) {
            for (const auto node : model().allNodeIds()) {
                if (model().resourceId(node) == resource) {
                    return node;
                }
            }
            return QtNodes::InvalidNodeId;
        }

        int height(const QString &resource) { return model().layout(id(resource)).size.height(); }

        const NodeRow *zone(const QString &resource) {
            for (const auto &row : model().layout(id(resource)).rows) {
                if (row.kind == NodeRowKind::DropZone) {
                    return &row;
                }
            }
            return nullptr;
        }

        QImage render(const QString &resource) {
            const auto size = model().layout(id(resource)).size;
            QImage card(size, QImage::Format_ARGB32_Premultiplied);
            card.fill(Qt::transparent);
            QPainter painter(&card);
            auto *item = window.scene()->nodeGraphicsObject(id(resource));
            const auto cache = item->cacheMode();
            item->setCacheMode(QGraphicsItem::NoCache);
            window.scene()->render(&painter, QRectF(QPointF(), QSizeF(size)), QRectF(item->scenePos(), QSizeF(size)));
            item->setCacheMode(cache);
            return card;
        }

        QQuickWidget *overlay(const QString &resource) {
            for (auto *widget : window.findChildren<QQuickWidget *>()) {
                if (widget->objectName() == "card-media-" + resource + "-value" && widget->isVisible()) {
                    return widget;
                }
            }
            return nullptr;
        }

        // Repeater delegates are visual children only, so the search walks the item tree.
        template <typename T> T *inOverlay(const QString &resource, const QString &name) {
            auto *widget = overlay(resource);
            std::function<T *(QQuickItem *)> visit = [&](QQuickItem *item) -> T * {
                if (auto *self = qobject_cast<T *>(item); self && item->objectName() == name) {
                    return self;
                }
                if (auto *child = item->findChild<T *>(name)) {
                    return child;
                }
                for (auto *next : item->childItems()) {
                    if (auto *found = visit(next)) {
                        return found;
                    }
                }
                return nullptr;
            };
            return widget && widget->rootObject() ? visit(widget->rootObject()) : nullptr;
        }

        void click(const QString &resource, const QPointF &local) {
            auto *item = window.scene()->nodeGraphicsObject(id(resource));
            const auto point = view->mapFromScene(item->mapToScene(local));
            QTest::mouseMove(view->viewport(), point);
            QTest::mouseClick(view->viewport(), Qt::LeftButton, Qt::NoModifier, point);
            settle();
        }

        void show(const QString &resource) {
            view->centerOn(window.scene()->nodeGraphicsObject(id(resource))->sceneBoundingRect().center());
            settle();
        }
    };

    static void settle() {
        QTest::qWait(120);
        QCoreApplication::processEvents();
    }

private slots:
    void initTestCase() {
        QStandardPaths::setTestModeEnabled(true);
        QVERIFY(QFile::exists(QStringLiteral(MEDIA_NODES_FIXTURE)));
        QVERIFY(QFile::exists(QStringLiteral(MEDIA_VIDEO_FIXTURE)));
    }

    // An http URL, an asset id with its storage uri and an asset:// reference
    // all resolve through MediaResolver and draw the image on the card. A
    // constant fills the card width at the image's aspect ratio, and an input
    // shows it at most 200 px tall in an outlined drop zone (PropertyDropzone.tsx,
    // special_nodes.css). Heights from the web editor at 280 px width.
    void imageValuesShowTheImage() {
        Host host({});
        auto *server = &host.server;
        QVERIFY(host.window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("wide", "constant.Image", 0, 0, value(ref("image", server->media("wide.png")))),
            node("photo", "input.ImageInput", 1, 0, named("photo", ref("image", "/api/storage/1/" + AssetId + ".png", AssetId))),
            node("reference", "constant.Image", 2, 0, value(ref("image", "asset://" + AssetId + ".png"))),
            node("landscape", "input.ImageInput", 3, 0, named("landscape", ref("image", server->media("wide.png")))),
        }}, {"edges", QJsonArray{}}}}}).ok);
        settle();
        QTRY_COMPARE(host.height("wide"), 177);
        QTRY_COMPARE(host.height("photo"), 284);
        QTRY_COMPARE(host.height("reference"), 308);
        QTRY_COMPARE(host.height("landscape"), 211);
        const auto wide = host.render("wide");
        const auto *wideZone = host.zone("wide");
        QVERIFY(wideZone);
        QCOMPARE(wideZone->rect, QRectF(9, 37, 262, 131));
        QVERIFY2(near(wide.pixelColor(wideZone->rect.center().toPoint()), QColor(220, 30, 30)), "the wide image fills the constant card");
        QVERIFY(near(wide.pixelColor(QPoint(12, 100)), QColor(220, 30, 30)));
        const auto photo = host.render("photo");
        const auto *photoZone = host.zone("photo");
        QVERIFY(photoZone);
        QCOMPARE(photoZone->rect, QRectF(9, 61, 262, 208));
        QVERIFY2(near(photo.pixelColor(photoZone->rect.center().toPoint()), QColor(30, 60, 220)), "the asset image is drawn");
        // A square image is 200 px tall and centered, so the drop zone's sides show no image.
        QVERIFY(!near(photo.pixelColor(QPoint(20, 165)), QColor(30, 60, 220)));
        QVERIFY(near(host.render("reference").pixelColor(QPoint(140, 160)), QColor(30, 60, 220)));
        QVERIFY(near(host.render("landscape").pixelColor(QPoint(140, 130)), QColor(220, 30, 30)));
        // The asset id is looked up on the server, as the web's useAsset does.
        QVERIFY(server->requests.join(' ').contains("/trpc/assets.get"));
    }

    // Empty values keep the "Click or drop" zone. A failed load reads "Image
    // could not be loaded" and a load in progress draws an empty outlined zone.
    void imageStatesFollowTheWeb() {
        Host host({});
        auto &server = host.server;
        QVERIFY(host.window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("empty", "constant.Image", 0, 0, value(ref("image", ""))),
            node("blank", "input.ImageInput", 1, 0, named("blank", ref("image", ""))),
            node("missing", "input.ImageInput", 2, 0, named("missing", ref("image", server.url().toString() + "/media/missing.png"))),
            node("slow", "input.ImageInput", 3, 0, named("slow", ref("image", server.url().toString() + "/hold/slow.png"))),
            node("silent", "constant.Video", 0, 1, value(ref("video", ""))),
            node("quiet", "constant.Audio", 1, 1, value(ref("audio", ""))),
        }}, {"edges", QJsonArray{}}}}}).ok);
        settle();
        QCOMPARE(host.height("empty"), 90);
        QCOMPARE(host.zone("empty")->value, QStringLiteral("CLICK OR DROP IMAGE"));
        QCOMPARE(host.zone("empty")->rect, QRectF(9, 37, 262, 44));
        QCOMPARE(host.height("blank"), 120);
        QCOMPARE(host.height("silent"), 90);
        QCOMPARE(host.height("quiet"), 102);
        QTRY_COMPARE(host.zone("missing")->value, QStringLiteral("IMAGE COULD NOT BE LOADED"));
        QCOMPARE(host.height("missing"), 128);
        QTRY_VERIFY(host.server.held.contains("/hold/slow.png"));
        QCOMPARE(host.height("slow"), 128);
        QVERIFY(host.zone("slow")->value.isEmpty());
        const auto slowZone = host.zone("slow")->rect;
        QVERIFY(!near(host.render("slow").pixelColor(slowZone.center().toPoint()), QColor(30, 60, 220)));
        host.server.release("/hold/slow.png", "/media/square.png");
        QTRY_COMPARE(host.height("slow"), 284);
        QVERIFY(near(host.render("slow").pixelColor(host.zone("slow")->rect.center().toPoint()), QColor(30, 60, 220)));
    }

    // The dimensions badge shows on hover, as ImageDimensions in the web drop zone.
    void hoverShowsImageDimensions() {
        Host host({});
        QVERIFY(host.window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("photo", "input.ImageInput", 1, 0, named("photo", ref("image", host.server.media("square.png")))),
        }}, {"edges", QJsonArray{}}}}}).ok);
        settle();
        host.show("photo");
        QTRY_COMPARE(host.height("photo"), 284);
        const auto badge = QRect(110, 242, 60, 18);
        const auto before = host.render("photo").copy(badge);
        auto *item = host.window.scene()->nodeGraphicsObject(host.id("photo"));
        const auto inside = host.view->mapFromScene(item->mapToScene(QPointF(140, 160)));
        QTest::mouseMove(host.view->viewport(), inside);
        settle();
        QTRY_VERIFY(item->nodeState().hovered());
        const auto after = host.render("photo").copy(badge);
        QVERIFY2(before != after, "hovering draws the 512×512 badge");
        QCOMPARE(host.zone("photo")->label, QStringLiteral("Value"));
    }

    // A loaded image opens the file picker only from its Replace action, and
    // Copy puts the full image on the clipboard (PropertyDropzone.tsx).
    void loadedImageActions() {
        Host host({});
        QVERIFY(host.window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("photo", "input.ImageInput", 1, 0, named("photo", ref("image", host.server.media("square.png")))),
        }}, {"edges", QJsonArray{}}}}}).ok);
        settle();
        host.show("photo");
        QTRY_COMPARE(host.height("photo"), 284);
        auto *drops = host.window.findChild<CanvasDropController *>();
        QVERIFY(drops);
        QStringList asked;
        drops->chooseFile = [&](const QString &kind) {
            asked.append(kind);
            return QString();
        };
        const auto undo = host.window.document()->undoStack()->count();
        host.click("photo", QPointF(140, 160));
        QVERIFY2(asked.isEmpty(), "a click on the image opens no picker");
        host.click("photo", QPointF(253, 79));
        QTRY_COMPARE(asked, QStringList{QStringLiteral("image")});
        QGuiApplication::clipboard()->clear();
        host.click("photo", QPointF(221, 79));
        QTRY_COMPARE(QGuiApplication::clipboard()->image().size(), QSize(512, 512));
        QVERIFY(near(QGuiApplication::clipboard()->image().pixelColor(256, 256), QColor(30, 60, 220)));
        QCOMPARE(asked.size(), 1);
        QCOMPARE(host.window.document()->undoStack()->count(), undo);
    }

    // Video values play on the card: a poster frame, a play control, and the
    // card height follows the video's aspect ratio.
    void videoValuesPlayOnTheCard() {
        Host host({});
        QVERIFY(host.window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("movie", "constant.Video", 1, 0, value(ref("video", host.server.media("clip.mp4")))),
            node("clip", "input.VideoInput", 2, 0, named("clip", ref("video", host.server.media("clip.mp4")))),
        }}, {"edges", QJsonArray{}}}}}).ok);
        settle();
        // 160×96 video: 262 × 0.6 on the constant, 254 × 0.6 in the input's drop zone.
        QTRY_COMPARE(host.height("movie"), 204);
        QTRY_COMPARE(host.height("clip"), 273);
        for (const auto *resource : {"movie", "clip"}) {
            const QString id = QString::fromLatin1(resource);
            QTRY_VERIFY(host.overlay(id));
            auto *frame = host.inOverlay<nodetool::node_editor::VideoFrameView>(id, "card-media-video");
            QVERIFY(frame);
            QTRY_VERIFY2(frame->hasFrame(), "the poster frame is decoded without playing");
            auto *player = host.inOverlay<QMediaPlayer>(id, "card-media-player");
            QVERIFY(player);
            QVERIFY(player->playbackState() != QMediaPlayer::PlayingState);
            auto *widget = host.overlay(id);
            const auto pixels = widget->grabFramebuffer();
            const auto inside = frame->mapRectToScene(QRectF(0, 0, frame->width(), frame->height())).toRect().adjusted(4, 4, -4, -4);
            QVERIFY2(colorCount(pixels, inside.intersected(pixels.rect())) > 20, "the overlay shows the video frame");
            auto *play = host.inOverlay<QQuickItem>(id, "card-media-play");
            QVERIFY(play);
            QTest::mouseClick(widget, Qt::LeftButton, Qt::NoModifier, play->mapToScene(QPointF(play->width() / 2, play->height() / 2)).toPoint());
            QTRY_COMPARE(player->playbackState(), QMediaPlayer::PlayingState);
            QTest::mouseClick(widget, Qt::LeftButton, Qt::NoModifier, play->mapToScene(QPointF(play->width() / 2, play->height() / 2)).toPoint());
            QTRY_VERIFY(player->playbackState() != QMediaPlayer::PlayingState);
        }
        // The overlay covers the zone's media area in the viewport.
        auto *item = host.window.scene()->nodeGraphicsObject(host.id("movie"));
        const auto expected = host.view->mapFromScene(item->mapToScene(host.zone("movie")->rect)).boundingRect();
        QVERIFY((host.overlay("movie")->geometry().topLeft() - expected.topLeft()).manhattanLength() <= 2);
    }

    // Audio values show the waveform and a play control (AudioPlayer.tsx).
    void audioValuesShowTheWaveform() {
        Host host({});
        QVERIFY(host.window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("tone", "constant.Audio", 1, 0, value(ref("audio", host.server.media("tone.wav")))),
            node("voice", "input.AudioInput", 2, 0, named("voice", ref("audio", host.server.media("tone.wav")))),
        }}, {"edges", QJsonArray{}}}}}).ok);
        settle();
        QCOMPARE(host.height("tone"), 183);
        QCOMPARE(host.height("voice"), 201);
        for (const auto *resource : {"tone", "voice"}) {
            const QString id = QString::fromLatin1(resource);
            QTRY_VERIFY(host.overlay(id));
            auto *wave = host.inOverlay<nodetool::node_editor::AudioWaveform>(id, "card-media-waveform");
            QVERIFY(wave);
            QTRY_VERIFY(!wave->peaks().isEmpty());
            auto *widget = host.overlay(id);
            QTRY_VERIFY(colorCount(widget->grabFramebuffer(), wave->mapRectToScene(QRectF(0, 0, wave->width(), wave->height())).toRect()) > 1);
            auto *player = host.inOverlay<QMediaPlayer>(id, "card-media-player");
            auto *play = host.inOverlay<QQuickItem>(id, "card-media-play");
            QVERIFY(player && play);
            QTRY_VERIFY(player->duration() > 1000);
            QTest::mouseClick(widget, Qt::LeftButton, Qt::NoModifier, play->mapToScene(QPointF(play->width() / 2, play->height() / 2)).toPoint());
            QTRY_COMPARE(player->playbackState(), QMediaPlayer::PlayingState);
            player->stop();
        }
    }

    // Lists show a thumbnail grid above their drop zone (ImageListProperty.tsx,
    // VideoListProperty.tsx, AudioListProperty.tsx).
    void mediaListsShowTheirItems() {
        Host host({});
        const QJsonArray images{ref("image", host.server.media("wide.png")), ref("image", host.server.media("square.png"))};
        QVERIFY(host.window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("images", "constant.ImageList", 0, 0, value(images)),
            node("videos", "constant.VideoList", 1, 0, value(QJsonArray{ref("video", host.server.media("clip.mp4"))})),
            node("sounds", "constant.AudioList", 2, 0, value(QJsonArray{ref("audio", host.server.media("tone.wav"))})),
            node("none", "constant.ImageList", 3, 0, value(QJsonArray{})),
        }}, {"edges", QJsonArray{}}}}}).ok);
        settle();
        QCOMPARE(host.height("images"), 266);
        QCOMPARE(host.height("videos"), 256);
        QCOMPARE(host.height("sounds"), 214);
        QCOMPARE(host.height("none"), 156);
        QCOMPARE(host.zone("none")->value, QStringLiteral("CLICK OR DROP IMAGES HERE"));
        // Three 82 px columns 8 px apart, each image covering its tile.
        QTRY_VERIFY(near(host.render("images").pixelColor(QPoint(50, 114)), QColor(220, 30, 30)));
        QTRY_VERIFY(near(host.render("images").pixelColor(QPoint(140, 114)), QColor(30, 60, 220)));
        QVERIFY(!near(host.render("images").pixelColor(QPoint(230, 114)), QColor(30, 60, 220)));
        QTRY_VERIFY(host.overlay("videos"));
        auto *frame = host.inOverlay<nodetool::node_editor::VideoFrameView>("videos", "card-media-video");
        QVERIFY(frame);
        QTRY_VERIFY(frame->hasFrame());
        QTRY_VERIFY(host.overlay("sounds"));
        QVERIFY(host.inOverlay<QQuickItem>("sounds", "card-media-play"));
    }

    // Dragging a card with a player moves its overlay with it, at a cost close
    // to a card without media.
    void dragMovesMediaOverlays() {
        Host host({});
        QVERIFY(host.window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"}, {"graph", QJsonObject{{"nodes", QJsonArray{
            node("movie", "constant.Video", 1, 0, value(ref("video", host.server.media("clip.mp4")))),
            node("tone", "constant.Audio", 2, 0, value(ref("audio", host.server.media("tone.wav")))),
            node("photo", "input.ImageInput", 3, 0, named("photo", ref("image", host.server.media("square.png")))),
        }}, {"edges", QJsonArray{}}}}}).ok);
        settle();
        QTRY_VERIFY(host.overlay("movie"));
        QTRY_COMPARE(host.height("photo"), 284);
        auto *item = host.window.scene()->nodeGraphicsObject(host.id("movie"));
        auto *viewport = host.view->viewport();
        const auto start = host.view->mapFromScene(item->mapToScene(QPointF(140, 18)));
        QTest::mousePress(viewport, Qt::LeftButton, Qt::NoModifier, start);
        constexpr int moves = 200;
        QElapsedTimer timer;
        timer.start();
        for (int i = 1; i <= moves; ++i) {
            const auto point = start + QPoint(i, i / 2);
            QMouseEvent move(QEvent::MouseMove, QPointF(point), viewport->mapToGlobal(QPointF(point)), Qt::NoButton, Qt::LeftButton, Qt::NoModifier);
            QApplication::sendEvent(viewport, &move);
            QCoreApplication::processEvents();
            viewport->repaint();
        }
        qInfo().nospace() << "media drag per_move_us=" << timer.nsecsElapsed() / 1000.0 / moves;
        QTest::mouseRelease(viewport, Qt::LeftButton, Qt::NoModifier, start + QPoint(moves, moves / 2));
        settle();
        const auto expected = host.view->mapFromScene(item->mapToScene(host.zone("movie")->rect)).boundingRect();
        QTRY_VERIFY((host.overlay("movie")->geometry().topLeft() - expected.topLeft()).manhattanLength() <= 2);
    }

    // Writes card and window captures of every media state in both themes.
    void captureMediaCards() {
        const auto directory = qEnvironmentVariable("NODETOOL_MEDIA_CARD_CAPTURE_DIR");
        if (directory.isEmpty()) {
            QSKIP("Set NODETOOL_MEDIA_CARD_CAPTURE_DIR to write media card captures.");
        }
        QDir().mkpath(directory);
        for (const auto dark : {true, false}) {
            Host host({}, dark);
            const auto &server = host.server;
            QVERIFY(host.window.document()->load(QJsonObject{{"id", "media-cards"}, {"name", "Media cards"}, {"graph", QJsonObject{{"nodes", QJsonArray{
                node("image", "constant.Image", 0, 0, value(ref("image", server.media("wide.png")))),
                node("photo", "input.ImageInput", 1, 0, named("photo", ref("image", "/api/storage/1/" + AssetId + ".png", AssetId))),
                node("video", "constant.Video", 2, 0, value(ref("video", server.media("clip.mp4")))),
                node("clip", "input.VideoInput", 3, 0, named("clip", ref("video", server.media("clip.mp4")))),
                node("audio", "constant.Audio", 4, 0, value(ref("audio", server.media("tone.wav")))),
                node("voice", "input.AudioInput", 5, 0, named("voice", ref("audio", server.media("tone.wav")))),
                node("images", "constant.ImageList", 0, 1, value(QJsonArray{ref("image", server.media("wide.png")), ref("image", server.media("square.png"))})),
                node("videos", "constant.VideoList", 1, 1, value(QJsonArray{ref("video", server.media("clip.mp4"))})),
                node("sounds", "constant.AudioList", 2, 1, value(QJsonArray{ref("audio", server.media("tone.wav"))})),
                node("empty", "constant.Image", 3, 1, value(ref("image", ""))),
                node("missing", "input.ImageInput", 4, 1, named("missing", ref("image", server.url().toString() + "/media/missing.png"))),
                node("slow", "input.ImageInput", 5, 1, named("slow", ref("image", server.url().toString() + "/hold/slow.png"))),
            }}, {"edges", QJsonArray{}}}}}).ok);
            if (host.window.chatVisible()) {
                host.window.toggleChat();
            }
            settle();
            host.view->setTransform(QTransform::fromScale(0.72, 0.72));
            settle();
            host.view->centerOn(QPointF(940, 330));
            QTRY_VERIFY(host.overlay("video") && host.overlay("voice") && host.overlay("videos"));
            QTRY_VERIFY(host.inOverlay<nodetool::node_editor::VideoFrameView>("clip", "card-media-video")
                        && host.inOverlay<nodetool::node_editor::VideoFrameView>("clip", "card-media-video")->hasFrame());
            QTest::qWait(1500);
            const auto theme = dark ? QStringLiteral("dark") : QStringLiteral("light");
            QVERIFY(host.window.grab().save(QStringLiteral("%1/media-cards-%2.png").arg(directory, theme)));
            host.view->resetTransform();
            settle();
            for (const auto *row : {"image", "images"}) {
                host.view->centerOn(host.window.scene()->nodeGraphicsObject(host.id(QString::fromLatin1(row)))->sceneBoundingRect().topLeft() + QPointF(640, 180));
                QTest::qWait(1200);
                QVERIFY(host.view->grab().save(QStringLiteral("%1/media-%2-row-%3.png").arg(directory, QString::fromLatin1(row), theme)));
            }
        }
    }

    // Captures a workflow file against a running server in both themes. Set
    // NODETOOL_MEDIA_CARD_SERVER, NODETOOL_MEDIA_CARD_WORKFLOW and
    // NODETOOL_MEDIA_CARD_CAPTURE_DIR.
    void captureServerWorkflow() {
        const auto server = QUrl(qEnvironmentVariable("NODETOOL_MEDIA_CARD_SERVER"));
        const auto path = qEnvironmentVariable("NODETOOL_MEDIA_CARD_WORKFLOW");
        const auto directory = qEnvironmentVariable("NODETOOL_MEDIA_CARD_CAPTURE_DIR");
        if (server.isEmpty() || path.isEmpty() || directory.isEmpty()) {
            QSKIP("Set NODETOOL_MEDIA_CARD_SERVER, NODETOOL_MEDIA_CARD_WORKFLOW and NODETOOL_MEDIA_CARD_CAPTURE_DIR.");
        }
        QNetworkAccessManager network;
        auto *reply = network.get(QNetworkRequest(server.resolved(QUrl("/api/nodes/metadata?fields=full"))));
        QTRY_VERIFY_WITH_TIMEOUT(reply->isFinished(), 30000);
        const auto metadata = QJsonDocument::fromJson(reply->readAll()).array();
        reply->deleteLater();
        QVERIFY(!metadata.isEmpty());
        QFile file(path);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const auto workflow = QJsonDocument::fromJson(file.readAll()).object();
        QDir().mkpath(directory);
        for (const auto dark : {true, false}) {
            EditorWindow window;
            window.setDarkTheme(dark);
            window.resize(1440, 900);
            window.show();
            QVERIFY(QTest::qWaitForWindowExposed(&window));
            window.setCatalog(metadata);
            QVERIFY(window.document()->load(workflow).ok);
            emit window.session()->credentialsChanged(server, QString(), QStringLiteral("1"));
            if (window.catalogVisible()) {
                window.action(QStringLiteral("Toggle nodes"));
            }
            if (window.chatVisible()) {
                window.toggleChat();
            }
            settle();
            auto *view = window.findChild<QGraphicsView *>();
            QVERIFY(view);
            view->resetTransform();
            view->setTransform(QTransform::fromScale(0.66, 0.66));
            view->centerOn(QPointF(800, 520));
            QTest::qWait(4000);
            const auto theme = dark ? QStringLiteral("dark") : QStringLiteral("light");
            QVERIFY(window.grab().save(QStringLiteral("%1/server-workflow-%2.png").arg(directory, theme)));
            view->resetTransform();
            view->centerOn(QPointF(780, 160));
            QTest::qWait(2500);
            QVERIFY(window.grab().save(QStringLiteral("%1/server-workflow-top-%2.png").arg(directory, theme)));
        }
    }
};

QTEST_MAIN(MediaCardsTest)
#include "MediaCardsTest.moc"
