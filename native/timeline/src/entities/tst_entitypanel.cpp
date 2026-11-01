#include "entities/EntityAssist.h"
#include "entities/EntityLibrary.h"
#include "../../tests/TestHttpServer.h"
#include "server/ServerSource.h"
#include <QBuffer>
#include <QDir>
#include <QGuiApplication>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLinearGradient>
#include <QPainter>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSettings>
#include <QTemporaryDir>
#include <QWebSocket>
#include <QWebSocketServer>
#include <QUrlQuery>
#include <QtTest>
#include <functional>
#include <utility>
#include <memory>

namespace {
QByteArray answer(const QJsonValue& value) {
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", value}}}}).toJson();
}
QByteArray failure(const QString& code) {
    return QJsonDocument(QJsonObject{{"error", QJsonObject{{"message", "test failure"},
        {"data", QJsonObject{{"code", code}}}}}}).toJson();
}
QString id(int number) { return QStringLiteral("%1").arg(number, 32, 16, QLatin1Char('0')); }

// A distinct gradient per image so thumbnails are recognizable in screenshots.
QByteArray picture(int seed) {
    QImage image(320, 320, QImage::Format_RGB32);
    QPainter painter(&image);
    QLinearGradient gradient(0, 0, 320, 320);
    gradient.setColorAt(0, QColor::fromHsv((seed * 47) % 360, 160, 230));
    gradient.setColorAt(1, QColor::fromHsv((seed * 47 + 70) % 360, 200, 90));
    painter.fillRect(image.rect(), gradient);
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(255, 255, 255, 70));
    painter.drawEllipse(QPoint(100 + seed * 17 % 120, 120), 70, 70);
    painter.setBrush(QColor(0, 0, 0, 70));
    painter.drawRect(0, 220, 320, 100);
    painter.end();
    QByteArray bytes;
    QBuffer buffer(&bytes);
    buffer.open(QIODevice::WriteOnly);
    image.save(&buffer, "PNG");
    return bytes;
}

// A local WebSocket the assist service talks to, as in tst_entityassist.
struct Socket : QObject {
    QWebSocketServer server{"entities", QWebSocketServer::NonSecureMode};
    QWebSocket* peer = nullptr;
    QList<QJsonObject> frames;
    Socket() {
        server.listen(QHostAddress::LocalHost, 0);
        connect(&server, &QWebSocketServer::newConnection, this, [this] {
            peer = server.nextPendingConnection(); peer->setParent(&server);
            connect(peer, &QWebSocket::textMessageReceived, this, [this](const QString& text) {
                const auto frame = QJsonDocument::fromJson(text.toUtf8()).object();
                if (frame.value("command") == "set_mode") peer->sendTextMessage(R"({"message":"Mode set to text"})");
                else frames.append(frame);
            });
        });
    }
    QUrl base() const { auto url = server.serverUrl(); url.setScheme("http"); return url; }
    void reply(int index, const QJsonObject& result, const QJsonObject& error = {}) {
        QJsonObject frame{{"type", "rpc_response"}, {"request_id", frames[index].value("request_id")}, {"result", result}};
        if (!error.isEmpty()) frame.insert("error", error);
        peer->sendTextMessage(QString::fromUtf8(QJsonDocument(frame).toJson()));
    }
};

struct Fake {
    TestHttpServer server;
    bool uploadFails = false;
    int uploads = 0;
    QStringList order;
    QMap<QString, QJsonObject> assets;
    QList<QJsonObject> writes;
    bool failUpdates = false, failSearch = false;
    // Runs on the test thread while an update waits for its answer, so a test can act mid-save.
    std::function<void()> whileSaving;
    Fake() {
        server.setJson([this](const QByteArray& path, const QUrl& url) {
            const auto input = QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
            if (path.endsWith("assets.get")) return answer(assets.value(input.value("id").toString()));
            if (path.endsWith("timeline.get")) return answer(QJsonObject{{"projectId", "default"}});
            if (path.endsWith("models.providers")) return answer(QJsonArray{QJsonObject{{"provider", "openai"},
                {"capabilities", QJsonArray{"text_to_image", "image_to_image", "generate_message"}}}});
            if (path.endsWith("settings.providerCatalog") || path.endsWith("models.rankedKeys")) return answer(QJsonArray{});
            if (path.endsWith("models.imageByProvider")) return answer(QJsonArray{
                QJsonObject{{"id", "image-model"}, {"name", "Image model"}, {"supported_tasks", QJsonArray{"text_to_image"}}},
                QJsonObject{{"id", "edit-model"}, {"name", "Edit model"}, {"supported_tasks", QJsonArray{"text_to_image", "image_to_image"}}}});
            if (path.endsWith("models.llmByProvider")) return answer(QJsonArray{QJsonObject{{"id", "text-model"}, {"name", "Text model"}}});
            if (failSearch) return failure("INTERNAL_SERVER_ERROR");
            QJsonArray rows;
            for (const auto& key : order) rows.append(assets.value(key));
            return answer(QJsonObject{{"assets", rows}});
        });
        server.setPost([this](const QByteArray& path, const QByteArray& body) {
            if (path == "/api/assets") {
                ++uploads;
                if (uploadFails) return QByteArray("{}");
                const auto key = QStringLiteral("u%1").arg(uploads);
                order.append(key);
                assets.insert(key, QJsonObject{{"id", key}, {"name", "Upload " + QString::number(uploads)}, {"content_type", "image/png"},
                    {"project_id", QJsonValue::Null}, {"thumb_url", "/img/" + key + ".png"}});
                server.setFile("/img/" + key.toUtf8() + ".png", ServedFile{picture(100 + uploads)});
                return QJsonDocument(assets.value(key)).toJson();
            }
            const auto input = QJsonDocument::fromJson(body).object();
            if (whileSaving) std::exchange(whileSaving, nullptr)();
            if (failUpdates) return failure("INTERNAL_SERVER_ERROR");
            writes.append(input);
            auto& asset = assets[input.value("id").toString()];
            asset.insert("metadata", input.value("metadata"));
            return answer(asset);
        });
    }
    void image(int number, const QString& name, bool reachable = true) {
        const auto key = id(number);
        order.append(key);
        assets.insert(key, QJsonObject{{"id", key}, {"name", name}, {"content_type", "image/png"},
            {"project_id", QJsonValue::Null}, {"thumb_url", "/img/" + key + ".png"}});
        if (reachable) server.setFile("/img/" + key.toUtf8() + ".png", ServedFile{picture(number)});
    }
    void entity(int number, const QString& name, const QString& kind, const QString& descriptor,
                const QString& voice = {}, const QStringList& tags = {}, bool reachable = true) {
        image(number, name + " reference", reachable);
        QJsonObject marker{{"kind", kind}, {"name", name}, {"descriptor", descriptor},
            {"tags", QJsonArray::fromStringList(tags)}};
        if (!voice.isEmpty()) marker.insert("voice_id", voice);
        tag(number, marker);
    }
    void tag(int number, const QJsonObject& marker) {
        auto& asset = assets[id(number)];
        asset.insert("metadata", QJsonObject{{"nodetool_entity", marker}});
    }
    // Four entities of each kind, one with a very long name and descriptor, and one without a reachable image.
    void populate() {
        entity(1, "Mara Vale", "character",
            "Late thirties, weathered navy peacoat, silver-streaked black hair tied back, a thin scar across her left eyebrow and a calm, appraising stare.",
            "voice-mara", {"lead", "harbor"});
        entity(2, "Harbor Street", "location",
            "A narrow cobbled street at dusk, wet from rain, strung with warm yellow lanterns and lined with shuttered fishmongers.");
        entity(3, "Noir Grade", "style",
            "High-contrast black and white with deep shadows, grainy 35mm texture and a single hard key light.");
        entity(4, "Brass Lantern", "prop",
            "A dented brass storm lantern with a cracked glass chimney and a worn leather carrying strap.");
        entity(5, "Captain Isolde Wraithmoor-Fitzgerald of the Eastern Marches", "character",
            "An imposing woman in her sixties with a rigid posture, a heavy greatcoat embroidered with faded gold thread, a patch over her right eye, a brass-tipped cane that she never leans on, "
            "and a habit of pausing mid-sentence to study whoever is listening as though weighing whether they can be trusted with the rest.",
            "voice-isolde", {"antagonist"});
        entity(6, "Ghost Prop", "prop", "A prop whose reference image can no longer be reached.", {}, {}, false);
        image(11, "Rooftop at night");
        image(12, "Red door");
        image(13, "Fog bank");
        image(14, "Market stall");
        image(15, "Last light");
    }
    QJsonObject marker(int number) const {
        return assets.value(id(number)).value("metadata").toObject().value("nodetool_entity").toObject();
    }
};

QObject* byName(QObject* root, const QString& name) {
    if (!root) return nullptr;
    if (root->objectName() == name) return root;
    if (auto* item = qobject_cast<QQuickItem*>(root)) {
        QList<QQuickItem*> pending = item->childItems();
        while (!pending.isEmpty()) {
            auto* child = pending.takeFirst();
            if (child->objectName() == name) return child;
            pending.append(child->childItems());
        }
    }
    return root->findChild<QObject*>(name);
}
bool shown(QObject* object) {
    auto* item = qobject_cast<QQuickItem*>(object);
    return item && item->isVisible();
}
QString textOf(QObject* object) { return object ? object->property("text").toString() : QString(); }
}

class TestEntityPanel : public QObject {
    Q_OBJECT
    std::unique_ptr<Fake> fake;
    std::unique_ptr<Socket> socket;
    EntityAssist* assist = nullptr;
    std::unique_ptr<QQmlEngine> engine;
    std::unique_ptr<QQuickWindow> window;
    std::unique_ptr<QObject> backdrop, object;
    QQuickItem* panel = nullptr;
    QQuickItem* host = nullptr;
    EntityLibrary* library = nullptr;
    QObject* theme = nullptr;

    // The Library beside the panel, wired as TimelineEditor wires them: the explorer hands an image to the
    // panel, and the panel asks for a Library reload after an entity changes.
    static QByteArray libraryHost() {
        return "import QtQuick\nimport NodeTool.Timeline\n"
               "Item {\n"
               "    property var timeline: null\n"
               "    property var clock: ({})\n"
               "    property int reloads: 0\n"
               "    readonly property alias entities: panel\n"
               "    readonly property alias library: explorer\n"
               "    function openEntityEditor(id, existing) { if (existing) panel.editEntity(id); else panel.useAsEntity(id) }\n"
               "    function refreshLibrary() { reloads++; explorer.browser.refresh() }\n"
               "    AssetExplorer { id: explorer; x: 0; width: 320; height: parent.height }\n"
               "    EntityPanel { id: panel; x: 320; width: 320; height: parent.height }\n"
               "}\n";
    }
    void mount(QSize windowSize, QSize panelSize, bool configure = true, int appearance = 2, bool visible = true, bool withLibrary = false) {
        engine = std::make_unique<QQmlEngine>();
        theme = engine->singletonInstance<QObject*>("NodeTool.UiPrimitives", "Theme");
        QVERIFY(theme);
        theme->setProperty("preference", appearance);
        window = std::make_unique<QQuickWindow>();
        window->resize(windowSize);
        QQmlComponent back(engine.get());
        back.setData("import QtQuick\nimport NodeTool.UiPrimitives as Ui\nRectangle { color: Ui.Theme.surfaceCanvas }", QUrl());
        backdrop.reset(back.create());
        QVERIFY2(backdrop, qPrintable(back.errorString()));
        auto* ground = qobject_cast<QQuickItem*>(backdrop.get());
        ground->setParentItem(window->contentItem());
        ground->setSize(windowSize);
        QQmlComponent component(engine.get(), QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/entities/EntityPanel.qml"));
        QQmlComponent hostComponent(engine.get());
        if (withLibrary) {
            hostComponent.setData(libraryHost(), QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/LibraryHost.qml"));
            QVERIFY2(hostComponent.isReady(), qPrintable(hostComponent.errorString()));
            object.reset(hostComponent.createWithInitialProperties({{"width", panelSize.width()}, {"height", panelSize.height()}, {"visible", visible}}));
            QVERIFY2(object, qPrintable(hostComponent.errorString()));
            host = qobject_cast<QQuickItem*>(object.get());
            panel = qobject_cast<QQuickItem*>(qvariant_cast<QObject*>(object->property("entities")));
            QVERIFY(host && panel);
            host->setParentItem(window->contentItem());
        } else {
            QVERIFY2(component.isReady(), qPrintable(component.errorString()));
            object.reset(component.createWithInitialProperties({{"width", panelSize.width()}, {"height", panelSize.height()}, {"visible", visible}}));
            QVERIFY2(object, qPrintable(component.errorString()));
            panel = qobject_cast<QQuickItem*>(object.get());
            QVERIFY(panel);
            panel->setParentItem(window->contentItem());
        }
        window->show();
        QVERIFY(QTest::qWaitForWindowExposed(window.get()));
        window->requestActivate();
        library = qobject_cast<EntityLibrary*>(qvariant_cast<QObject*>(panel->property("library")));
        QVERIFY(library);
        assist = qobject_cast<EntityAssist*>(qvariant_cast<QObject*>(panel->property("assist")));
        QVERIFY(assist);
        assist->configure(socket->base());
        if (configure) library->configure(fake->server.base());
    }
    QObject* find(const QString& name) {
        if (auto* found = byName(window->contentItem(), name)) return found;
        return byName(panel, name);
    }
    QQuickItem* card(int number) { return qobject_cast<QQuickItem*>(find("entityCard_" + id(number))); }
    QObject* in(QObject* root, const QString& name) { return byName(root, name); }
    void click(QObject* target, Qt::MouseButton button = Qt::LeftButton) {
        auto* item = qobject_cast<QQuickItem*>(target);
        QVERIFY(item);
        QVERIFY(item->isVisible());
        // A freshly opened dialog lays out over a few frames, so wait for the target to hold still.
        QPoint position(-1, -1);
        for (int attempt = 0; attempt < 30; ++attempt) {
            const auto next = item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint();
            if (next == position) break;
            position = next;
            QTest::qWait(16);
        }
        QTest::mouseClick(window.get(), button, {}, position);
    }
    void focus(QObject* target) {
        auto* item = qobject_cast<QQuickItem*>(target);
        QVERIFY(item);
        item->forceActiveFocus();
        QTRY_VERIFY(item->hasActiveFocus());
    }
    bool settled() {
        QList<QQuickItem*> pending{window->contentItem()};
        while (!pending.isEmpty()) {
            auto* item = pending.takeLast();
            if (item->inherits("QQuickImage") && item->property("status").toInt() == 2) return false;
            pending.append(item->childItems());
        }
        return true;
    }
    void waitForCards(int count) {
        QTRY_VERIFY_WITH_TIMEOUT(library->entities().size() == count && !library->loading(), 10000);
        QTRY_VERIFY(card(1) || count != 6);
        QTRY_VERIFY_WITH_TIMEOUT(settled(), 10000);
    }
    QObject* bannerAction(const QString& banner) { return in(find(banner), "bannerActionButton"); }
    void openNewEditor(int image) {
        click(find("entityNewButton"));
        QTRY_VERIFY(find("entityImagePicker")->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(image)));
        click(find("entityImageTile_" + id(image)));
        QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
        QTRY_VERIFY(find("entityNameField")->property("activeFocus").toBool());
    }
    void type(const QString& text) {
        for (const QChar letter : text) QTest::keyClick(window.get(), letter.toLatin1());
    }
    bool reasonShown() { return shown(find("entitySaveReason")) || shown(find("entitySaveReasonStacked")); }
    void pointerTo(QObject* target) {
        auto* item = qobject_cast<QQuickItem*>(target);
        const auto position = item ? item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint() : QPoint(1, 1);
        QTest::mouseMove(window.get(), position);
    }
    // Moves the pointer to `hover`, or to a corner that holds no control, then writes the window to a PNG.
    void capture(const QString& name, QObject* hover = nullptr) {
        const auto directory = qEnvironmentVariable("NT_ENTITY_CAPTURE_DIR");
        if (directory.isEmpty()) return;
        QTRY_VERIFY_WITH_TIMEOUT(settled(), 10000);
        pointerTo(hover);
        QTest::qWait(350);
        QDir().mkpath(directory);
        QVERIFY(window->grabWindow().save(QDir(directory).filePath(name + ".png")));
    }
    void closeAll() {
        object.reset();
        backdrop.reset();
        window.reset();
        engine.reset();
        fake.reset();
        panel = nullptr;
        host = nullptr;
        library = nullptr;
        assist = nullptr;
    }
    // Points a catalog at the fake server and selects a model once its list has loaded.
    void pickModel(const QString& catalogName, const QString& modelId) {
        auto* catalog = find(catalogName);
        QVERIFY(catalog);
        QMetaObject::invokeMethod(catalog, "configure", Q_ARG(QUrl, fake->server.base()), Q_ARG(QString, QString()));
        QTRY_VERIFY(!catalog->property("loading").toBool() && !catalog->property("models").toList().isEmpty());
        QMetaObject::invokeMethod(catalog, "selectModel", Q_ARG(QString, modelId), Q_ARG(QString, QStringLiteral("openai")));
        QTRY_COMPARE(catalog->property("selectedModelId").toString(), modelId);
    }
    void openEditor(int number) {
        click(in(card(number), "entityEditButton"));
        QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
    }
    void openReference() {
        click(find("entityNewPicture"));
        QTRY_VERIFY(find("entityReferenceDialog")->property("opened").toBool());
    }
    QString referenceId() { return find("entityEditorDialog")->property("referenceAssetId").toString(); }
    QJsonObject frameData(int index) { return socket->frames[index].value("data").toObject(); }
    QVariantList imageFiles(int count) {
        static QTemporaryDir directory;
        QVariantList urls;
        for (int index = 0; index < count; ++index) {
            const auto path = directory.filePath(QStringLiteral("upload-%1.png").arg(index));
            QImage image(32, 32, QImage::Format_RGB32);
            image.fill(QColor::fromHsv(index * 70, 200, 220));
            image.save(path);
            urls.append(QUrl::fromLocalFile(path));
        }
        return urls;
    }

private slots:
    void init() { fake = std::make_unique<Fake>(); socket = std::make_unique<Socket>(); }
    void cleanup() { closeAll(); socket.reset(); }

    void cardsRender() {
        fake->populate();
        mount({320, 800}, {320, 800});
        waitForCards(6);
        QCOMPARE(textOf(in(card(1), "entityName")), QString("Mara Vale"));
        QCOMPARE(textOf(in(card(1), "entityKind")), QString("Character"));
        QVERIFY(textOf(in(card(1), "entityDescriptor")).startsWith("Late thirties"));
        QCOMPARE(textOf(in(card(2), "entityKind")), QString("Location"));
        QCOMPARE(textOf(in(card(3), "entityKind")), QString("Style"));
        QCOMPARE(textOf(in(card(4), "entityKind")), QString("Prop"));
        QCOMPARE(in(card(1), "entityEditButton")->property("accessibleName").toString(), QString("Edit entity Mara Vale"));
        QCOMPARE(in(card(1), "entityRemoveButton")->property("accessibleName").toString(), QString("Remove entity Mara Vale"));
        QVERIFY(!shown(in(card(1), "entityNoImage")));
        QCOMPARE(in(card(1), "entityImage")->property("status").toInt(), 1);
        QVERIFY(shown(in(card(6), "entityNoImage")));
        // Every card is the same height, whatever its name and descriptor.
        QCOMPARE(card(5)->height(), card(1)->height());
        QCOMPARE(card(6)->height(), card(1)->height());
        QCOMPARE(card(4)->height(), card(1)->height());
        QVERIFY(in(card(5), "entityName")->property("truncated").toBool());
        QVERIFY(in(card(5), "entityDescriptor")->property("truncated").toBool());
        QCOMPARE(card(1)->property("selected").toBool(), false);
        QVERIFY(!shown(find("entityEmpty")));
        QVERIFY(!shown(find("entityNotConfigured")));
        QVERIFY(!shown(find("entityLoading")));
        // Two columns at 320 wide, one at 240 wide.
        QCOMPARE(card(1)->y(), card(2)->y());
        QVERIFY(card(3)->y() > card(1)->y());
        QVERIFY(card(1)->width() >= 140);
        panel->setWidth(240);
        QTRY_COMPARE(card(2)->x(), card(1)->x());
        panel->setWidth(560);
        QTRY_VERIFY(card(3)->y() == card(1)->y());
    }

    void newEntityPickerHidesEntities() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(find("entityNewButton"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(11)));
        for (int number = 11; number <= 15; ++number) QVERIFY(find("entityImageTile_" + id(number)));
        for (int number = 1; number <= 6; ++number) QVERIFY(!find("entityImageTile_" + id(number)));
        QCOMPARE(find("entityImageTile_" + id(12))->property("accessibleName").toString(), QString("Pick Red door"));
        QVERIFY(!shown(find("entityImagesLoading")));
        // Escape closes the picker without choosing anything.
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTRY_VERIFY(!picker->property("visible").toBool());
        QVERIFY(!find("entityEditorDialog")->property("visible").toBool());
        QVERIFY(fake->writes.isEmpty());
        // Space picks the focused tile and opens the editor on that image.
        click(find("entityNewButton"));
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(13)));
        focus(find("entityImageTile_" + id(13)));
        QTest::keyClick(window.get(), Qt::Key_Space);
        QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
        QCOMPARE(find("entityEditorDialog")->property("referenceAssetId").toString(), id(13));
        QVERIFY(!picker->property("visible").toBool());
        QVERIFY(fake->writes.isEmpty());
    }

    void createFlow() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(12);
        auto* editor = find("entityEditorDialog");
        QCOMPARE(editor->property("title").toString(), QString("New entity"));
        auto* name = find("entityNameField");
        auto* descriptor = find("entityDescriptorField");
        auto* save = find("entitySave");
        QCOMPARE(textOf(save), QString("Create"));
        // Focus starts in the name field, so typing needs no click.
        QTRY_VERIFY(name->property("activeFocus").toBool());
        QVERIFY(!save->property("enabled").toBool());
        QVERIFY(reasonShown());
        QCOMPARE(textOf(find("entitySaveReason")), QString("Add a name and a descriptor to save."));
        QVERIFY(!shown(find("entityRemovedBanner")));
        type("Red Door");
        QCOMPARE(textOf(name), QString("Red Door"));
        QVERIFY(!save->property("enabled").toBool());
        focus(descriptor);
        type("A scuffed red door with a brass knocker.");
        QVERIFY(save->property("enabled").toBool());
        QVERIFY(!reasonShown());
        // Tab leaves the descriptor for the voice field, as the character kind shows one.
        QTest::keyClick(window.get(), Qt::Key_Tab);
        QTRY_VERIFY(find("entityVoiceField")->property("activeFocus").toBool());
        QVERIFY(shown(find("entityVoiceField")));
        click(find("entityKind_prop"));
        QTRY_VERIFY(!shown(find("entityVoiceField")));
        QVERIFY(find("entityKind_prop")->property("checked").toBool());
        QVERIFY(!find("entityKind_character")->property("checked").toBool());
        focus(find("entityTagsField"));
        type("door, red, door");
        click(save);
        QTRY_VERIFY(fake->writes.size() == 1);
        const auto marker = fake->writes.first().value("metadata").toObject().value("nodetool_entity").toObject();
        QCOMPARE(fake->writes.first().value("id").toString(), id(12));
        QCOMPARE(marker.value("kind").toString(), QString("prop"));
        QCOMPARE(marker.value("name").toString(), QString("Red Door"));
        QCOMPARE(marker.value("descriptor").toString(), QString("A scuffed red door with a brass knocker."));
        QCOMPARE(marker.value("tags").toArray(), QJsonArray({"door", "red"}));
        QVERIFY(marker.value("voice_id").isNull());
        QTRY_VERIFY(!editor->property("visible").toBool());
        QTRY_VERIFY(card(12));
        QTRY_VERIFY(card(12)->property("selected").toBool());
        QCOMPARE(textOf(in(card(12), "entityName")), QString("Red Door"));
        QCOMPARE(fake->server.countRequests("POST", "/trpc/assets.delete"), 0);
    }

    void createFailureKeepsDraft() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(13);
        auto* editor = find("entityEditorDialog");
        auto* save = find("entitySave");
        focus(find("entityNameField"));
        type("Fog Bank");
        focus(find("entityDescriptorField"));
        type("Thick sea fog that swallows the pier.");
        fake->failUpdates = true;
        click(save);
        auto* banner = find("entitySaveError");
        QTRY_VERIFY(shown(banner));
        QVERIFY(banner->property("message").toString().contains("test failure"));
        QVERIFY(editor->property("visible").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Fog Bank"));
        QCOMPARE(textOf(find("entityDescriptorField")), QString("Thick sea fog that swallows the pier."));
        QVERIFY(save->property("enabled").toBool());
        QVERIFY(!card(13));
        // Editing the draft clears the error, and the retry succeeds.
        fake->failUpdates = false;
        focus(find("entityDescriptorField"));
        type(" ");
        QTRY_VERIFY(!shown(banner));
        click(save);
        QTRY_VERIFY(!editor->property("visible").toBool());
        QTRY_VERIFY(card(13));
        QCOMPARE(fake->writes.size(), 1);
    }

    void editPrefillsAndChangesImage() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(in(card(1), "entityEditButton"));
        auto* editor = find("entityEditorDialog");
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(editor->property("title").toString(), QString("Edit entity"));
        QCOMPARE(textOf(find("entityNameField")), QString("Mara Vale"));
        QVERIFY(textOf(find("entityDescriptorField")).startsWith("Late thirties"));
        QCOMPARE(textOf(find("entityVoiceField")), QString("voice-mara"));
        QCOMPARE(textOf(find("entityTagsField")), QString("lead, harbor"));
        QVERIFY(find("entityKind_character")->property("checked").toBool());
        QCOMPARE(textOf(find("entitySave")), QString("Save"));
        QVERIFY(find("entitySave")->property("enabled").toBool());
        QVERIFY(!reasonShown());
        QTRY_VERIFY(find("entityNameField")->property("activeFocus").toBool());
        QCOMPARE(find("entityNameField")->property("selectedText").toString(), QString("Mara Vale"));
        QCOMPARE(editor->property("referenceAssetId").toString(), id(1));
        // The picker offers entity images too when changing a picture.
        click(find("entityChangeImage"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(14)));
        QVERIFY(find("entityImageTile_" + id(2)));
        QVERIFY(find("entityImageTile_" + id(1)));
        // Return picks the focused tile.
        focus(find("entityImageTile_" + id(14)));
        QTest::keyClick(window.get(), Qt::Key_Return);
        QTRY_VERIFY(!picker->property("visible").toBool());
        QTRY_COMPARE(editor->property("referenceAssetId").toString(), id(14));
        QVERIFY(editor->property("visible").toBool());
        QTRY_VERIFY(find("entityChangeImage")->property("activeFocus").toBool());
        focus(find("entityNameField"));
        QTest::keyClick(window.get(), Qt::Key_A, Qt::ControlModifier);
        type("Mara Vale-Okafor");
        click(find("entitySave"));
        QTRY_VERIFY(fake->writes.size() == 1);
        const auto write = fake->writes.first();
        QCOMPARE(write.value("id").toString(), id(1));
        const auto marker = write.value("metadata").toObject().value("nodetool_entity").toObject();
        QCOMPARE(marker.value("reference_asset_id").toString(), id(14));
        QCOMPARE(marker.value("name").toString(), QString("Mara Vale-Okafor"));
        QCOMPARE(marker.value("voice_id").toString(), QString("voice-mara"));
        QCOMPARE(marker.value("tags").toArray(), QJsonArray({"lead", "harbor"}));
        QTRY_VERIFY(!editor->property("visible").toBool());
        QTRY_COMPARE(textOf(in(card(1), "entityName")), QString("Mara Vale-Okafor"));
        QTRY_VERIFY(card(1)->property("selected").toBool());
    }

    void voiceFieldOnlyForCharacters() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(in(card(2), "entityEditButton"));
        auto* editor = find("entityEditorDialog");
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
        QVERIFY(find("entityKind_location")->property("checked").toBool());
        QVERIFY(!shown(find("entityVoiceField")));
        click(find("entityKind_character"));
        QTRY_VERIFY(shown(find("entityVoiceField")));
        QCOMPARE(textOf(find("entityVoiceField")), QString());
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        QVERIFY(fake->writes.isEmpty());
        // A later edit starts from its own entity, not from the previous draft.
        click(in(card(1), "entityEditButton"));
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Mara Vale"));
        QVERIFY(shown(find("entityVoiceField")));
        QCOMPARE(textOf(find("entityVoiceField")), QString("voice-mara"));
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        // A new entity starts blank.
        openNewEditor(15);
        QCOMPARE(textOf(find("entityNameField")), QString());
        QCOMPARE(textOf(find("entityDescriptorField")), QString());
        QCOMPARE(textOf(find("entityTagsField")), QString());
        QVERIFY(find("entityKind_character")->property("checked").toBool());
        QVERIFY(!find("entitySave")->property("enabled").toBool());
    }

    void keyboardAndContextMenu() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        auto* editor = find("entityEditorDialog");
        focus(card(2));
        QTest::keyClick(window.get(), Qt::Key_Return);
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTRY_VERIFY(!editor->property("visible").toBool());
        // The dialog gives focus back to the card that opened it.
        QTRY_VERIFY(card(2)->hasActiveFocus());
        QTest::keyClick(window.get(), Qt::Key_Menu);
        auto* menu = in(card(2), "entityMenu");
        QTRY_VERIFY(menu->property("visible").toBool());
        click(in(card(2), "entityMenuEdit"));
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        click(card(3), Qt::RightButton);
        menu = in(card(3), "entityMenu");
        QTRY_VERIFY(menu->property("visible").toBool());
        click(in(card(3), "entityMenuRemove"));
        QTRY_VERIFY(fake->writes.size() == 1);
        QCOMPARE(fake->writes.first().value("id").toString(), id(3));
    }

    void removeAndUndo() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        QVERIFY(!shown(find("entityRemovedBanner")));
        click(in(card(4), "entityRemoveButton"));
        // No confirmation: the marker is removed at once and the card goes away.
        QTRY_VERIFY(fake->writes.size() == 1);
        QCOMPARE(fake->writes.first().value("id").toString(), id(4));
        QVERIFY(!fake->writes.first().value("metadata").toObject().contains("nodetool_entity"));
        QCOMPARE(fake->server.countRequests("POST", "/trpc/assets.delete"), 0);
        auto* banner = find("entityRemovedBanner");
        QTRY_VERIFY(shown(banner));
        QCOMPARE(banner->property("message").toString(), QString("Removed “Brass Lantern”."));
        QTRY_VERIFY(!card(4));
        QVERIFY(!find("entityEditorDialog")->property("visible").toBool());
        click(bannerAction("entityRemovedBanner"));
        QTRY_VERIFY(fake->writes.size() == 2);
        QVERIFY(fake->writes.last().value("metadata").toObject().contains("nodetool_entity"));
        QCOMPARE(fake->marker(4).value("name").toString(), QString("Brass Lantern"));
        QTRY_VERIFY(!shown(banner));
        QTRY_VERIFY(card(4));
        // Dismissing the banner drops the undo.
        focus(card(3));
        QTest::keyClick(window.get(), Qt::Key_Delete);
        QTRY_VERIFY(fake->writes.size() == 3);
        QTRY_VERIFY(shown(banner));
        QCOMPARE(banner->property("message").toString(), QString("Removed “Noir Grade”."));
        click(find("entityRemovedDismiss"));
        QTRY_VERIFY(!shown(banner));
        QVERIFY(library->removedName().isEmpty());
        QVERIFY(!card(3));
        QCOMPARE(fake->writes.size(), 3);
    }

    void savedCardScrollsIntoViewAndListKeepsPosition() {
        fake->populate();
        mount({1280, 720}, {320, 420});
        waitForCards(6);
        auto* grid = qobject_cast<QQuickItem*>(find("entityGrid"));
        QVERIFY(grid);
        QCOMPARE(grid->property("contentY").toDouble(), 0.0);
        openNewEditor(15);
        focus(find("entityNameField"));
        type("Last Light");
        focus(find("entityDescriptorField"));
        type("The final minute of sun before the harbor goes dark.");
        click(find("entitySave"));
        QTRY_VERIFY(card(15));
        auto inView = [&] {
            const auto top = card(15)->mapToItem(grid, QPointF(0, 0)).y();
            return top >= -1 && top + card(15)->height() <= grid->height() + 1;
        };
        QTRY_VERIFY(inView());
        QVERIFY(grid->property("contentY").toDouble() > 0);
        QVERIFY(card(15)->property("selected").toBool());
        // A reload that follows a removal keeps the scroll position.
        const double before = grid->property("contentY").toDouble();
        click(in(card(15), "entityRemoveButton"));
        QTRY_VERIFY(!card(15));
        QTRY_VERIFY(grid->property("contentY").toDouble() > 0);
        QVERIFY(grid->property("contentY").toDouble() <= before);
    }

    void emptyStateOffersNewEntity() {
        fake->image(11, "Rooftop at night");
        fake->image(12, "Red door");
        mount({1280, 720}, {320, 720});
        QTRY_VERIFY_WITH_TIMEOUT(shown(find("entityEmpty")), 10000);
        auto* empty = find("entityEmpty");
        QCOMPARE(empty->property("title").toString(), QString("No entities yet"));
        QCOMPARE(empty->property("message").toString(), QString("Tag an image as a character, location, style, or prop with the + button above, or right-click an image in the Library and choose Use as entity."));
        QCOMPARE(empty->property("actionText").toString(), QString("New entity"));
        QVERIFY(!shown(find("entityGrid")));
        QVERIFY(!shown(find("entityError")));
        QObject* action = nullptr;
        QList<QQuickItem*> pending = qobject_cast<QQuickItem*>(empty)->childItems();
        while (!pending.isEmpty() && !action) {
            auto* item = pending.takeFirst();
            if (item->inherits("QQuickAbstractButton") && item->property("text").toString() == "New entity") action = item;
            pending.append(item->childItems());
        }
        QVERIFY(action);
        click(action);
        QTRY_VERIFY(find("entityImagePicker")->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(11)));
        QTRY_VERIFY(find("entityImageTile_" + id(12)));
    }

    void pickerEmptyAndError() {
        mount({1280, 720}, {320, 720});
        QTRY_VERIFY_WITH_TIMEOUT(shown(find("entityEmpty")), 10000);
        click(find("entityNewButton"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        auto* empty = find("entityImagesEmpty");
        QTRY_VERIFY(shown(empty));
        QCOMPARE(empty->property("title").toString(), QString("No images"));
        QCOMPARE(empty->property("message").toString(), QString("Upload an image to use as the reference."));
        QCOMPARE(empty->property("actionText").toString(), QString("Upload image"));
        QVERIFY(find("entityImageUpload")->property("enabled").toBool());
        click(find("entityImagePickerCancel"));
        QTRY_VERIFY(!picker->property("visible").toBool());
        fake->failSearch = true;
        click(find("entityNewButton"));
        QTRY_VERIFY(picker->property("opened").toBool());
        auto* error = find("entityImagesError");
        QTRY_VERIFY(shown(error));
        QVERIFY(error->property("message").toString().contains("test failure"));
        QVERIFY(!shown(empty));
        fake->failSearch = false;
        fake->image(11, "Rooftop at night");
        click(bannerAction("entityImagesError"));
        QTRY_VERIFY(find("entityImageTile_" + id(11)));
        QVERIFY(!shown(error));
    }

    void notConfiguredAndLoadError() {
        fake->populate();
        mount({1280, 720}, {320, 720}, false);
        QTRY_VERIFY(shown(find("entityNotConfigured")));
        QCOMPARE(textOf(find("entityNotConfigured")), QString("Open a server timeline to use entities."));
        QVERIFY(!shown(find("entityEmpty")));
        QVERIFY(!shown(find("entityError")));
        QVERIFY(!shown(find("entityLoading")));
        QVERIFY(!find("entityNewButton")->property("enabled").toBool());
        QVERIFY(!find("entityRefreshButton")->property("enabled").toBool());
        // A server that fails shows the error with a way to retry.
        fake->failSearch = true;
        library->configure(fake->server.base());
        auto* error = find("entityError");
        QTRY_VERIFY_WITH_TIMEOUT(shown(error), 10000);
        QVERIFY(error->property("message").toString().contains("test failure"));
        QCOMPARE(error->property("actionText").toString(), QString("Retry"));
        QVERIFY(!shown(find("entityNotConfigured")));
        QVERIFY(!shown(find("entityEmpty")));
        fake->failSearch = false;
        click(bannerAction("entityError"));
        QTRY_VERIFY_WITH_TIMEOUT(card(1) != nullptr, 10000);
        QTRY_VERIFY(!shown(error));
    }

    void actionsFadeInOnHoverAndFocus() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        pointerTo(nullptr);
        auto* actions = qobject_cast<QQuickItem*>(in(card(2), "entityActions"));
        QVERIFY(actions);
        QTRY_COMPARE(actions->opacity(), 0.0);
        QVERIFY(actions->isVisible());
        pointerTo(card(2));
        QTRY_COMPARE(actions->opacity(), 1.0);
        QCOMPARE(qobject_cast<QQuickItem*>(in(card(1), "entityActions"))->opacity(), 0.0);
        pointerTo(nullptr);
        QTRY_COMPARE(actions->opacity(), 0.0);
        // Focus inside the pill also shows it, and a transparent pill still takes clicks.
        focus(in(card(2), "entityEditButton"));
        QTRY_COMPARE(actions->opacity(), 1.0);
        focus(find("entityRefreshButton"));
        QTRY_COMPARE(actions->opacity(), 0.0);
        click(in(card(2), "entityEditButton"));
        QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
    }

    void removeFailureShowsActionErrorWithoutRetry() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        fake->failUpdates = true;
        click(in(card(4), "entityRemoveButton"));
        auto* error = find("entityActionError");
        QTRY_VERIFY(shown(error));
        QVERIFY(error->property("message").toString().contains("test failure"));
        QCOMPARE(error->property("actionText").toString(), QString("Dismiss"));
        QVERIFY(!shown(find("entityError")));
        QVERIFY(!shown(find("entityRemovedBanner")));
        QVERIFY(card(4));
        QVERIFY(fake->writes.isEmpty());
        click(bannerAction("entityActionError"));
        QTRY_VERIFY(!shown(error));
        QVERIFY(library->actionError().isEmpty());
    }

    void saveInFlightCannotBeAbandoned() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(12);
        auto* editor = find("entityEditorDialog");
        focus(find("entityNameField"));
        type("Red Door");
        focus(find("entityDescriptorField"));
        type("A scuffed red door.");
        bool duringSave = false;
        fake->whileSaving = [&] {
            duringSave = true;
            QVERIFY(library->saving());
            QVERIFY(!find("entityCancel")->property("enabled").toBool());
            QCOMPARE(editor->property("closePolicy").toInt(), 0);  // NoAutoClose
            QTest::keyClick(window.get(), Qt::Key_Escape);
            QTest::qWait(50);
            QVERIFY(editor->property("visible").toBool());
            click(find("entityCancel"));
            QTest::qWait(50);
            QVERIFY(editor->property("visible").toBool());
            QCOMPARE(textOf(find("entityNameField")), QString("Red Door"));
        };
        click(find("entitySave"));
        QTRY_VERIFY(duringSave);
        QTRY_VERIFY(!editor->property("visible").toBool());
        QCOMPARE(fake->writes.size(), 1);
        QCOMPARE(editor->property("closePolicy").toInt(), 16);  // CloseOnEscape
        QTRY_VERIFY(card(12));
    }

    void changingImageInNewKeepsDraftAndHidesEntities() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(11);
        auto* editor = find("entityEditorDialog");
        focus(find("entityNameField"));
        type("Rooftop");
        click(find("entityChangeImage"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(12)));
        QVERIFY(picker->property("hideEntities").toBool());
        for (int number = 1; number <= 6; ++number) QVERIFY(!find("entityImageTile_" + id(number)));
        click(find("entityImageTile_" + id(13)));
        QTRY_VERIFY(!picker->property("visible").toBool());
        QTRY_COMPARE(editor->property("referenceAssetId").toString(), id(13));
        QCOMPARE(editor->property("title").toString(), QString("New entity"));
        QVERIFY(editor->property("visible").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Rooftop"));
        focus(find("entityDescriptorField"));
        type("Wet slate roofs under a streetlight.");
        click(find("entitySave"));
        QTRY_VERIFY(fake->writes.size() == 1);
        QCOMPARE(fake->writes.first().value("id").toString(), id(13));
        QTRY_VERIFY(!editor->property("visible").toBool());
        // The next New flow starts from the new-entity rules again.
        click(find("entityNewButton"));
        QTRY_VERIFY(picker->property("opened").toBool());
        QVERIFY(picker->property("hideEntities").toBool());
    }

    void focusFollowsScrollAndSurvivesReload() {
        fake->populate();
        mount({1280, 720}, {320, 420});
        waitForCards(6);
        auto* grid = qobject_cast<QQuickItem*>(find("entityGrid"));
        QVERIFY(grid);
        auto inView = [&](QQuickItem* item) {
            const auto top = item->mapToItem(grid, QPointF(0, 0)).y();
            return top >= -1 && top + item->height() <= grid->height() + 1;
        };
        // Tab walks past the viewport and the grid follows it.
        focus(card(1));
        for (int step = 0; step < 40 && !(card(5) && card(5)->hasActiveFocus()); ++step) {
            QTest::keyClick(window.get(), Qt::Key_Tab);
            QTest::qWait(20);
        }
        QVERIFY(card(5) && card(5)->hasActiveFocus());
        QTRY_VERIFY(inView(card(5)));
        QVERIFY(grid->property("contentY").toDouble() > 0);
        // A reload that changes the list rebuilds the cards, and the focused one gets focus back.
        auto marker = fake->marker(3);
        marker.insert("name", "Noir Grade Redux");
        fake->tag(3, marker);
        library->reload();
        QTRY_COMPARE(textOf(in(card(3), "entityName")), QString("Noir Grade Redux"));
        QTRY_VERIFY(card(5) && card(5)->hasActiveFocus());
        QTRY_VERIFY(inView(card(5)));
        // Focus on something else is not pulled back by a later reload.
        focus(find("entityRefreshButton"));
        marker.insert("name", "Noir Grade Again");
        fake->tag(3, marker);
        library->reload();
        QTRY_COMPARE(textOf(in(card(3), "entityName")), QString("Noir Grade Again"));
        QTest::qWait(100);
        QVERIFY(find("entityRefreshButton")->property("activeFocus").toBool());
    }

    void removalMovesFocusToThePanel() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(in(card(2), "entityRemoveButton"));
        QTRY_VERIFY(!card(2));
        QTRY_VERIFY(panel->hasActiveFocus());
        for (int number : {1, 3, 4, 5, 6}) QVERIFY(!card(number)->hasActiveFocus());
        QVERIFY(!card(1)->property("selected").toBool());
        QVERIFY(!card(3)->property("selected").toBool());
    }

    void undoRestoresInReverseOrder() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(in(card(3), "entityRemoveButton"));
        QTRY_VERIFY(!card(3));
        click(in(card(4), "entityRemoveButton"));
        QTRY_VERIFY(!card(4));
        auto* banner = find("entityRemovedBanner");
        QCOMPARE(banner->property("message").toString(), QString("Removed “Brass Lantern”."));
        QVERIFY(library->canUndo());
        click(bannerAction("entityRemovedBanner"));
        QTRY_VERIFY(card(4));
        QVERIFY(!card(3));
        QCOMPARE(fake->marker(4).value("name").toString(), QString("Brass Lantern"));
        QVERIFY(fake->marker(3).isEmpty());
        QCOMPARE(banner->property("message").toString(), QString("Removed “Noir Grade”."));
        QTRY_VERIFY(shown(banner));
        click(bannerAction("entityRemovedBanner"));
        QTRY_VERIFY(card(3));
        QCOMPARE(fake->marker(3).value("name").toString(), QString("Noir Grade"));
        QTRY_VERIFY(!shown(banner));
        QVERIFY(!library->canUndo());
        QCOMPARE(fake->writes.size(), 4);
    }

    void referenceOneTakeEditsTheCurrentLook() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openEditor(1);
        openReference();
        auto* dialog = find("entityReferenceDialog");
        QCOMPARE(dialog->property("title").toString(), QString("New picture of Mara Vale"));
        for (const auto* view : {"full-body", "portrait", "character-sheet"}) QVERIFY(find(QString("entityView_") + view));
        QVERIFY(find("entityView_full-body")->property("checked").toBool());
        QVERIFY(textOf(find("entityReferencePrompt")).startsWith("A reference image of Mara Vale. Late thirties"));
        QVERIFY(textOf(find("entityReferencePrompt")).contains("full-body"));
        click(find("entityView_portrait"));
        QTRY_VERIFY(textOf(find("entityReferencePrompt")).contains("head-and-shoulders"));
        QVERIFY(find("entityKeepLook")->property("checked").toBool());
        auto* catalog = find("entityReferenceCatalog");
        QCOMPARE(catalog->property("mode").toString(), QString("image_model"));
        // Generate waits for a model, and says so.
        auto* generate = find("entityReferenceGenerate");
        QVERIFY(!generate->property("enabled").toBool());
        QCOMPARE(dialog->property("blocker").toString(), QString("Pick an image model to generate the reference."));
        QVERIFY(shown(find("entityReferenceBlocker")) || shown(find("entityReferenceBlockerStacked")));
        pickModel("entityReferenceCatalog", "edit-model");
        QTRY_VERIFY(generate->property("enabled").toBool());
        QCOMPARE(textOf(find("entityReferenceModelHelp")), QString("Used to create the reference image."));
        click(generate);
        QTRY_COMPARE(socket->frames.size(), 1);
        QCOMPARE(socket->frames[0].value("command").toString(), QString("generate_media"));
        const auto data = frameData(0);
        QCOMPARE(data.value("mode").toString(), QString("image_edit"));
        QCOMPARE(data.value("source_asset_id").toString(), id(1));
        QCOMPARE(data.value("model").toString(), QString("edit-model"));
        QCOMPARE(data.value("provider").toString(), QString("openai"));
        QCOMPARE(data.value("aspect_ratio").toString(), QString("2:3"));
        QCOMPARE(data.value("variations").toInt(), 1);
        QVERIFY(data.value("prompt").toString().contains("head-and-shoulders"));
        QVERIFY(shown(find("entityReferenceProgress")));
        QVERIFY(!find("entityReferenceForm")->property("enabled").toBool());
        socket->reply(0, {{"asset_ids", QJsonArray{id(14)}}});
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QCOMPARE(referenceId(), id(14));
        QVERIFY(find("entityEditorDialog")->property("visible").toBool());
        // The new picture replaces the reference of the entity that was edited.
        click(find("entitySave"));
        QTRY_VERIFY(fake->writes.size() == 1);
        QCOMPARE(fake->writes.first().value("id").toString(), id(1));
        QCOMPARE(fake->writes.first().value("metadata").toObject().value("nodetool_entity").toObject().value("reference_asset_id").toString(), id(14));
    }

    void referenceWithoutKeepingTheLook() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openEditor(2);
        openReference();
        auto* dialog = find("entityReferenceDialog");
        auto* catalog = find("entityReferenceCatalog");
        click(find("entityKeepLook"));
        QTRY_COMPARE(catalog->property("mode").toString(), QString("image"));
        pickModel("entityReferenceCatalog", "image-model");
        click(find("entityReferenceGenerate"));
        QTRY_COMPARE(socket->frames.size(), 1);
        QCOMPARE(frameData(0).value("mode").toString(), QString("image"));
        QVERIFY(!frameData(0).contains("source_asset_id"));
        QCOMPARE(frameData(0).value("model").toString(), QString("image-model"));
        QCOMPARE(frameData(0).value("aspect_ratio").toString(), QString("3:2"));
        // A failure keeps the dialog, the prompt and the choice of model.
        const auto prompt = textOf(find("entityReferencePrompt"));
        socket->reply(0, {}, {{"code", "BAD_REQUEST"}, {"message", "The image was refused."}});
        auto* error = find("entityReferenceError");
        QTRY_VERIFY(shown(error));
        QCOMPARE(error->property("message").toString(), QString("The image was refused."));
        QVERIFY(dialog->property("visible").toBool());
        QCOMPARE(textOf(find("entityReferencePrompt")), prompt);
        QVERIFY(find("entityReferenceGenerate")->property("enabled").toBool());
        QVERIFY(find("entityReferenceForm")->property("enabled").toBool());
        QCOMPARE(referenceId(), id(2));
        // Keeping the look needs a model that edits pictures.
        click(find("entityKeepLook"));
        QTRY_COMPARE(catalog->property("mode").toString(), QString("image_model"));
        pickModel("entityReferenceCatalog", "image-model");
        QVERIFY(!find("entityReferenceGenerate")->property("enabled").toBool());
        QVERIFY(dialog->property("blocker").toString().contains("cannot edit a picture"));
        QVERIFY(shown(find("entityReferenceBlocker")) || shown(find("entityReferenceBlockerStacked")));
        pickModel("entityReferenceCatalog", "edit-model");
        QTRY_VERIFY(find("entityReferenceGenerate")->property("enabled").toBool());
        // An empty prompt blocks it too.
        focus(find("entityReferencePrompt"));
        QTest::keyClick(window.get(), Qt::Key_A, Qt::ControlModifier);
        QTest::keyClick(window.get(), Qt::Key_Delete);
        QTRY_VERIFY(!find("entityReferenceGenerate")->property("enabled").toBool());
        QCOMPARE(dialog->property("blocker").toString(), QString("Write a prompt to generate."));
    }

    void referenceSeveralTakesThenChoose() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openEditor(1);
        openReference();
        auto* dialog = find("entityReferenceDialog");
        pickModel("entityReferenceCatalog", "edit-model");
        click(find("entityTakes_4"));
        QVERIFY(find("entityTakes_4")->property("checked").toBool());
        QVERIFY(!find("entityTakes_1")->property("checked").toBool());
        click(find("entityReferenceGenerate"));
        QTRY_COMPARE(socket->frames.size(), 1);
        QCOMPARE(frameData(0).value("variations").toInt(), 4);
        socket->reply(0, {{"asset_ids", QJsonArray{id(14), id(13), id(12)}}});
        QTRY_VERIFY(shown(find("entityReferenceTakes")));
        QVERIFY(!shown(find("entityReferenceForm")));
        for (int number : {14, 13, 12}) QTRY_VERIFY(find("entityTake_" + id(number)));
        QCOMPARE(find("entityReferenceGenerate")->property("text").toString(), QString("Use this take"));
        QVERIFY(find("entityTake_" + id(14))->property("chosen").toBool());
        // One click chooses. The button confirms.
        click(find("entityTake_" + id(13)));
        QTRY_VERIFY(find("entityTake_" + id(13))->property("chosen").toBool());
        QVERIFY(!find("entityTake_" + id(14))->property("chosen").toBool());
        click(find("entityReferenceGenerate"));
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QCOMPARE(referenceId(), id(13));
        QVERIFY(assist->takes().isEmpty());
        // A double click uses a take at once.
        openReference();
        click(find("entityReferenceGenerate"));
        QTRY_COMPARE(socket->frames.size(), 2);
        socket->reply(1, {{"asset_ids", QJsonArray{id(11), id(12)}}});
        QTRY_VERIFY(find("entityTake_" + id(12)));
        auto* tile = qobject_cast<QQuickItem*>(find("entityTake_" + id(12)));
        QTest::mouseDClick(window.get(), Qt::LeftButton, {}, tile->mapToScene(QPointF(tile->width() / 2, tile->height() / 2)).toPoint());
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QCOMPARE(referenceId(), id(12));
        // The takes can be abandoned for the prompt.
        openReference();
        click(find("entityReferenceGenerate"));
        QTRY_COMPARE(socket->frames.size(), 3);
        socket->reply(2, {{"asset_ids", QJsonArray{id(11), id(12)}}});
        QTRY_VERIFY(shown(find("entityReferenceTakes")));
        click(find("entityReferenceBack"));
        QTRY_VERIFY(shown(find("entityReferenceForm")));
        QVERIFY(assist->takes().isEmpty());
    }

    void closingTheReferenceDialogCancelsTheRequest() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openEditor(1);
        openReference();
        auto* dialog = find("entityReferenceDialog");
        pickModel("entityReferenceCatalog", "edit-model");
        click(find("entityReferenceGenerate"));
        QTRY_COMPARE(socket->frames.size(), 1);
        QVERIFY(assist->generating());
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTRY_VERIFY(!dialog->property("visible").toBool());
        QVERIFY(!assist->generating());
        QVERIFY(find("entityEditorDialog")->property("visible").toBool());
        // A late answer changes nothing.
        socket->reply(0, {{"asset_ids", QJsonArray{id(14)}}});
        QTest::qWait(80);
        QCOMPARE(referenceId(), id(1));
        QVERIFY(assist->takes().isEmpty());
        QVERIFY(assist->generateError().isEmpty());
    }

    void newEntityPictureBecomesTheReference() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(11);
        focus(find("entityNameField"));
        type("Rooftop");
        focus(find("entityDescriptorField"));
        type("Wet slate roofs.");
        openReference();
        QCOMPARE(find("entityReferenceDialog")->property("title").toString(), QString("New picture of Rooftop"));
        pickModel("entityReferenceCatalog", "edit-model");
        click(find("entityReferenceGenerate"));
        QTRY_COMPARE(socket->frames.size(), 1);
        QCOMPARE(frameData(0).value("source_asset_id").toString(), id(11));
        socket->reply(0, {{"asset_ids", QJsonArray{id(12)}}});
        QTRY_COMPARE(referenceId(), id(12));
        click(find("entitySave"));
        QTRY_VERIFY(fake->writes.size() == 1);
        // The generated image is the picked image, so it carries the marker.
        QCOMPARE(fake->writes.first().value("id").toString(), id(12));
    }

    void assistQuickActionThenApply() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openEditor(1);
        auto* trigger = find("entityAssistButton");
        QCOMPARE(trigger->property("accessibleName").toString(), QString("Writing assistant"));
        click(trigger);
        auto* popover = find("entityAssistPopover");
        QTRY_VERIFY(popover->property("opened").toBool());
        const QString original = textOf(find("entityDescriptorField"));
        pickModel("entityAssistCatalog", "text-model");
        click(find("entityAssistAction_improve"));
        QTRY_COMPARE(socket->frames.size(), 1);
        QCOMPARE(socket->frames[0].value("command").toString(), QString("generate_text"));
        const auto prompt = frameData(0).value("prompt").toString();
        QCOMPARE(frameData(0).value("model").toString(), QString("text-model"));
        QVERIFY(prompt.startsWith("# Field\nLabel: Descriptor\nHint: Describe its appearance in a sentence."));
        QVERIFY(prompt.contains("# Context\nThe entity is a character named \"Mara Vale\"."));
        QVERIFY(prompt.contains("# Current text\n" + original));
        QVERIFY(prompt.contains("# Instruction\nMake the text clearer and more specific."));
        QVERIFY(shown(find("entityAssistRunning")));
        socket->reply(0, {{"text", "A tall woman in a navy peacoat."}});
        QTRY_VERIFY(shown(find("entityAssistProposal")));
        QCOMPARE(textOf(find("entityAssistProposalText")), QString("A tall woman in a navy peacoat."));
        // The field is untouched until Apply.
        QCOMPARE(textOf(find("entityDescriptorField")), original);
        QCOMPARE(textOf(find("entityAssistApply")), QString("Replace text"));
        // A further instruction refines the proposal, not the field.
        focus(find("entityAssistInstruction"));
        type("shorter");
        QTest::keyClick(window.get(), Qt::Key_Return);
        QTRY_COMPARE(socket->frames.size(), 2);
        const auto refine = frameData(1).value("prompt").toString();
        QVERIFY(refine.contains("# Current text\nA tall woman in a navy peacoat."));
        QVERIFY(refine.endsWith("# Instruction\nshorter"));
        QCOMPARE(textOf(find("entityAssistInstruction")), QString());
        socket->reply(1, {{"text", "A tall woman."}});
        QTRY_COMPARE(textOf(find("entityAssistProposalText")), QString("A tall woman."));
        click(find("entityAssistApply"));
        QTRY_VERIFY(!popover->property("visible").toBool());
        QCOMPARE(textOf(find("entityDescriptorField")), QString("A tall woman."));
        QVERIFY(assist->proposal().isEmpty());
        QVERIFY(find("entityAssistButton")->property("activeFocus").toBool());
        // The edited text is what gets saved.
        click(find("entitySave"));
        QTRY_VERIFY(fake->writes.size() == 1);
        QCOMPARE(fake->writes.first().value("metadata").toObject().value("nodetool_entity").toObject().value("descriptor").toString(), QString("A tall woman."));
    }

    void assistDiscardAndClose() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openEditor(1);
        const QString original = textOf(find("entityDescriptorField"));
        click(find("entityAssistButton"));
        auto* popover = find("entityAssistPopover");
        QTRY_VERIFY(popover->property("opened").toBool());
        pickModel("entityAssistCatalog", "text-model");
        click(find("entityAssistAction_shorten"));
        QTRY_COMPARE(socket->frames.size(), 1);
        socket->reply(0, {{"text", "Short."}});
        QTRY_VERIFY(shown(find("entityAssistProposal")));
        click(find("entityAssistDiscard"));
        QTRY_VERIFY(!shown(find("entityAssistProposal")));
        QCOMPARE(textOf(find("entityDescriptorField")), original);
        QVERIFY(popover->property("visible").toBool());
        // Stop ends a request. Closing the popover abandons it, and a late reply is ignored.
        click(find("entityAssistAction_fix"));
        QTRY_COMPARE(socket->frames.size(), 2);
        click(find("entityAssistStop"));
        QTRY_VERIFY(!assist->assisting());
        click(find("entityAssistAction_fix"));
        QTRY_COMPARE(socket->frames.size(), 3);
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTRY_VERIFY(!popover->property("visible").toBool());
        QVERIFY(!assist->assisting());
        socket->reply(2, {{"text", "Late."}});
        QTest::qWait(80);
        QVERIFY(assist->proposal().isEmpty());
        QCOMPARE(textOf(find("entityDescriptorField")), original);
        QVERIFY(find("entityEditorDialog")->property("visible").toBool());
    }

    void assistNeedsTextAModelAndReportsErrors() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openNewEditor(12);
        click(find("entityAssistButton"));
        auto* popover = find("entityAssistPopover");
        QTRY_VERIFY(popover->property("opened").toBool());
        // With no text only "Write it" applies, and the others say why they are off.
        QVERIFY(find("entityAssistAction_draft")->property("enabled").toBool());
        for (const auto* action : {"improve", "expand", "shorten", "fix"}) QVERIFY(!find(QString("entityAssistAction_") + action)->property("enabled").toBool());
        QVERIFY(shown(find("entityAssistReason")));
        click(find("entityAssistAction_draft"));
        auto* error = find("entityAssistError");
        QTRY_VERIFY(shown(error));
        QCOMPARE(error->property("message").toString(), QString("Pick a model below before you ask the assistant."));
        QCOMPARE(socket->frames.size(), 0);
        pickModel("entityAssistCatalog", "text-model");
        click(find("entityAssistAction_draft"));
        QTRY_COMPARE(socket->frames.size(), 1);
        QVERIFY(frameData(0).value("prompt").toString().contains("# Current text\n(empty)"));
        socket->reply(0, {}, {{"code", "BAD_REQUEST"}, {"message", "The model is offline."}});
        QTRY_VERIFY(shown(error));
        QCOMPARE(error->property("message").toString(), QString("The model is offline."));
        QVERIFY(textOf(find("entityDescriptorField")).isEmpty());
        QCOMPARE(textOf(find("entityAssistApply")), QString("Insert"));
    }

    void assistFollowsTheFieldAndItsEditor() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openEditor(1);
        auto* editor = find("entityEditorDialog");
        auto* field = find("entityDescriptorField");
        click(find("entityAssistButton"));
        auto* popover = find("entityAssistPopover");
        QTRY_VERIFY(popover->property("opened").toBool());
        pickModel("entityAssistCatalog", "text-model");
        // Text typed behind the popover is what a rewrite works on, not the text the popover opened with.
        focus(field);
        QMetaObject::invokeMethod(field, "selectAll");
        type("Blue coat.");
        QCOMPARE(popover->property("fieldText").toString(), QString("Blue coat."));
        click(find("entityAssistAction_improve"));
        QTRY_COMPARE(socket->frames.size(), 1);
        QVERIFY(frameData(0).value("prompt").toString().contains("# Current text\nBlue coat."));
        socket->reply(0, {{"text", "A tall woman in a blue coat."}});
        QTRY_VERIFY(shown(find("entityAssistProposal")));
        QCOMPARE(textOf(find("entityAssistApply")), QString("Replace text"));
        // Emptying the field turns Replace into Insert.
        focus(field);
        QMetaObject::invokeMethod(field, "selectAll");
        QTest::keyClick(window.get(), Qt::Key_Delete);
        QTRY_COMPARE(textOf(find("entityAssistApply")), QString("Insert"));
        // Cancelling the editor takes the assistant and its proposal with it.
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        QTRY_VERIFY(!popover->property("visible").toBool());
        QVERIFY(assist->proposal().isEmpty());
        // Another entity opens with no assistant and none of the first entity's proposal.
        openEditor(2);
        const QString harbor = textOf(field);
        QVERIFY(!popover->property("visible").toBool());
        QVERIFY(!shown(find("entityAssistProposal")));
        QCOMPARE(textOf(field), harbor);
        click(find("entityAssistButton"));
        QTRY_VERIFY(popover->property("opened").toBool());
        QVERIFY(!shown(find("entityAssistProposal")));
        QCOMPARE(textOf(find("entityAssistInstruction")), QString());
        click(find("entityAssistAction_shorten"));
        QTRY_COMPARE(socket->frames.size(), 2);
        socket->reply(1, {{"text", "Short harbor."}});
        QTRY_VERIFY(shown(find("entityAssistProposal")));
        // Opening the editor for yet another entity while it is open also closes the assistant.
        QMetaObject::invokeMethod(panel, "editEntity", Q_ARG(QVariant, QVariant(id(3))));
        QTRY_COMPARE(textOf(find("entityNameField")), QString("Noir Grade"));
        QTRY_VERIFY(!popover->property("visible").toBool());
        QVERIFY(assist->proposal().isEmpty());
        QVERIFY(textOf(field).startsWith("High-contrast"));
    }

    void assistPopoverSitsBesideTheEditor_data() {
        QTest::addColumn<QSize>("size");
        QTest::addColumn<bool>("beside");
        QTest::newRow("1280x720") << QSize(1280, 720) << true;
        QTest::newRow("960x600") << QSize(960, 600) << false;
    }
    void assistPopoverSitsBesideTheEditor() {
        QFETCH(QSize, size);
        QFETCH(bool, beside);
        fake->populate();
        mount(size, {320, size.height()});
        waitForCards(6);
        openEditor(1);
        auto* editor = find("entityEditorDialog");
        click(find("entityAssistButton"));
        auto* popover = find("entityAssistPopover");
        QTRY_VERIFY(popover->property("opened").toBool());
        pickModel("entityAssistCatalog", "text-model");
        click(find("entityAssistAction_improve"));
        QTRY_COMPARE(socket->frames.size(), 1);
        socket->reply(0, {{"text", QString("A long proposal. ").repeated(40)}});
        QTRY_VERIFY(shown(find("entityAssistProposal")));
        QTest::qWait(150);
        auto rect = [](QObject* popup) {
            return QRectF(popup->property("x").toDouble(), popup->property("y").toDouble(),
                popup->property("width").toDouble(), popup->property("height").toDouble());
        };
        auto sceneRect = [](QObject* object) {
            auto* item = qobject_cast<QQuickItem*>(object);
            return QRectF(item->mapToScene(QPointF(0, 0)), item->size());
        };
        const auto popup = rect(popover);
        QVERIFY2(QRectF(0, 0, size.width(), size.height()).contains(popup), qPrintable(QString("popover %1,%2 %3x%4").arg(popup.x()).arg(popup.y()).arg(popup.width()).arg(popup.height())));
        QVERIFY(popup.width() >= 264);
        const auto descriptor = sceneRect(find("entityDescriptorField"));
        const auto save = sceneRect(find("entitySave"));
        if (beside) {
            QVERIFY(popup.left() >= rect(editor).right());
            QVERIFY(!popup.intersects(descriptor));
            QVERIFY(!popup.intersects(save));
        } else {
            // There is no room to the right, so the popover opens under its button and may cover the form.
            QVERIFY(popup.intersects(rect(editor)));
        }
    }

    void assistPopoverAndReferenceStayInTheWindow_data() {
        QTest::addColumn<QSize>("size");
        QTest::newRow("1280x720") << QSize(1280, 720);
        QTest::newRow("960x600") << QSize(960, 600);
    }
    void assistPopoverAndReferenceStayInTheWindow() {
        QFETCH(QSize, size);
        fake->populate();
        mount(size, {320, size.height()});
        waitForCards(6);
        openEditor(1);
        // The editor keeps fitting without a scrollbar.
        auto* editor = find("entityEditorDialog");
        QVERIFY(editor->property("height").toDouble() <= size.height());
        if (size.height() >= 720) {
            auto* form = find("entityEditorScroll");
            // The two-column header settles a moment after the dialog opens.
            QTRY_VERIFY(form->property("contentHeight").toDouble() <= form->property("height").toDouble() + 2);
        }
        click(find("entityAssistButton"));
        auto* popover = find("entityAssistPopover");
        QTRY_VERIFY(popover->property("opened").toBool());
        pickModel("entityAssistCatalog", "text-model");
        click(find("entityAssistAction_improve"));
        QTRY_COMPARE(socket->frames.size(), 1);
        socket->reply(0, {{"text", QString("A long proposal. ").repeated(40)}});
        QTRY_VERIFY(shown(find("entityAssistProposal")));
        QTest::qWait(100);
        auto inside = [&](QObject* popup) {
            const QRectF rect(popup->property("x").toDouble(), popup->property("y").toDouble(),
                popup->property("width").toDouble(), popup->property("height").toDouble());
            return rect.left() >= 0 && rect.top() >= 0 && rect.right() <= size.width() && rect.bottom() <= size.height();
        };
        QVERIFY(inside(popover));
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTRY_VERIFY(!popover->property("visible").toBool());
        openReference();
        auto* reference = find("entityReferenceDialog");
        QTest::qWait(100);
        QVERIFY(inside(reference));
    }

    void uploadOneImagePicksIt() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(find("entityNewButton"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(11)));
        QVERIFY(find("entityImageUpload")->property("enabled").toBool());
        QMetaObject::invokeMethod(picker, "uploadFiles", Q_ARG(QVariant, QVariant(imageFiles(1))));
        QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
        QCOMPARE(fake->uploads, 1);
        QCOMPARE(referenceId(), QString("u1"));
        QVERIFY(!picker->property("visible").toBool());
        QCOMPARE(find("entityEditorDialog")->property("title").toString(), QString("New entity"));
        QTRY_VERIFY(!find("entityEditorDialog")->property("imageUrl").toString().isEmpty());
    }

    void uploadSeveralImagesStaysInThePicker() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(find("entityNewButton"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QMetaObject::invokeMethod(picker, "uploadFiles", Q_ARG(QVariant, QVariant(imageFiles(2))));
        QTRY_VERIFY(find("entityImageTile_u1") && find("entityImageTile_u2"));
        QVERIFY(picker->property("visible").toBool());
        QVERIFY(!find("entityEditorDialog")->property("visible").toBool());
        QVERIFY(!shown(find("entityImagesUploading")));
        // Choosing one of them continues as usual.
        click(find("entityImageTile_u2"));
        QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
        QCOMPARE(referenceId(), QString("u2"));
    }

    void uploadFailureIsShownAndDismissed() {
        fake->populate();
        fake->uploadFails = true;
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(find("entityNewButton"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QVERIFY(!shown(find("entityUploadError")));
        QMetaObject::invokeMethod(picker, "uploadFiles", Q_ARG(QVariant, QVariant(imageFiles(1))));
        auto* error = find("entityUploadError");
        QTRY_VERIFY(shown(error));
        QVERIFY(error->property("message").toString().startsWith("Could not upload “upload-0.png”."));
        QVERIFY(picker->property("visible").toBool());
        QVERIFY(!find("entityEditorDialog")->property("visible").toBool());
        click(bannerAction("entityUploadError"));
        QTRY_VERIFY(!shown(error));
        // A new open of the picker does not repeat an old error.
        QMetaObject::invokeMethod(picker, "uploadFiles", Q_ARG(QVariant, QVariant(imageFiles(1))));
        QTRY_VERIFY(shown(error));
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTRY_VERIFY(!picker->property("visible").toBool());
        click(find("entityNewButton"));
        QTRY_VERIFY(picker->property("opened").toBool());
        QVERIFY(!shown(error));
    }

    void cancelledPickerIgnoresAFinishedUploadWhenChangingTheImage() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        openEditor(1);
        const QString before = referenceId();
        click(find("entityChangeImage"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QMetaObject::invokeMethod(picker, "uploadFiles", Q_ARG(QVariant, QVariant(imageFiles(1))));
        // Cancel before the upload can finish, since no event is processed in between.
        QVERIFY(QMetaObject::invokeMethod(find("entityImagePickerCancel"), "clicked"));
        QTRY_VERIFY(!picker->property("visible").toBool());
        // The upload still finishes and the images refresh, but nothing is picked.
        QTRY_VERIFY_WITH_TIMEOUT(fake->uploads == 1 && !library->uploading(), 10000);
        auto hasUpload = [&] {
            for (const auto& row : library->images()) if (row.toMap().value("id").toString() == "u1") return true;
            return false;
        };
        QTRY_VERIFY_WITH_TIMEOUT(hasUpload(), 10000);
        QTest::qWait(200);
        QCOMPARE(referenceId(), before);
        QCOMPARE(find("entityEditorDialog")->property("title").toString(), QString("Edit entity"));
        QVERIFY(find("entityEditorDialog")->property("visible").toBool());
    }

    void cancelledPickerCannotOverwriteAnotherEditor() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        click(find("entityNewButton"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        QMetaObject::invokeMethod(picker, "uploadFiles", Q_ARG(QVariant, QVariant(imageFiles(1))));
        QVERIFY(QMetaObject::invokeMethod(find("entityImagePickerCancel"), "clicked"));
        QTRY_VERIFY(!picker->property("visible").toBool());
        // Editing another entity while the cancelled upload finishes must keep that edit.
        openEditor(2);
        QTRY_VERIFY_WITH_TIMEOUT(fake->uploads == 1 && !library->uploading(), 10000);
        QTest::qWait(300);
        auto* editor = find("entityEditorDialog");
        QCOMPARE(editor->property("title").toString(), QString("Edit entity"));
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
        QCOMPARE(referenceId(), id(2));
    }

    void emptyPickerOffersUploadInBothFlows() {
        fake->entity(1, "Mara Vale", "character", "A captain.");
        mount({1280, 720}, {320, 720});
        QTRY_VERIFY_WITH_TIMEOUT(card(1) != nullptr, 10000);
        // Every image is an entity, so a New entity has nothing to pick.
        click(find("entityNewButton"));
        auto* picker = find("entityImagePicker");
        QTRY_VERIFY(picker->property("opened").toBool());
        auto* empty = find("entityImagesEmpty");
        QTRY_VERIFY(shown(empty));
        QCOMPARE(empty->property("message").toString(), QString("Every image here is already an entity."));
        QCOMPARE(empty->property("actionText").toString(), QString("Upload image"));
        // The empty state offers the upload, so the footer does not show a second button for it.
        QVERIFY(find("entityImageUpload"));
        QVERIFY(!shown(find("entityImageUpload")));
        // Changing a picture may reuse any image.
        click(find("entityImagePickerCancel"));
        QTRY_VERIFY(!picker->property("visible").toBool());
        openEditor(1);
        click(find("entityChangeImage"));
        QTRY_VERIFY(picker->property("opened").toBool());
        QTRY_VERIFY(find("entityImageTile_" + id(1)));
        QVERIFY(!shown(empty));
        QVERIFY(shown(find("entityImageUpload")));
    }

    void useAsEntityAndEditEntityFromTheLibrary() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        // The list is still loading when the Library asks, so the editor waits for it.
        QMetaObject::invokeMethod(panel, "editEntity", Q_ARG(QVariant, QVariant(id(3))));
        auto* editor = find("entityEditorDialog");
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(editor->property("title").toString(), QString("Edit entity"));
        QCOMPARE(textOf(find("entityNameField")), QString("Noir Grade"));
        QVERIFY(find("entityKind_style")->property("checked").toBool());
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        QMetaObject::invokeMethod(panel, "useAsEntity", Q_ARG(QVariant, QVariant(id(13))));
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(editor->property("title").toString(), QString("New entity"));
        QCOMPARE(referenceId(), id(13));
        QTRY_VERIFY(!editor->property("imageUrl").toString().isEmpty());
        QVERIFY(textOf(find("entityNameField")).isEmpty());
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        // A loaded entity opens at once.
        QMetaObject::invokeMethod(panel, "editEntity", Q_ARG(QVariant, QVariant(id(2))));
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(textOf(find("entityNameField")), QString("Harbor Street"));
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        // The Library may still offer "Use as entity" for an image that was saved since, so that edits it.
        QMetaObject::invokeMethod(panel, "useAsEntity", Q_ARG(QVariant, QVariant(id(3))));
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(editor->property("title").toString(), QString("Edit entity"));
        QCOMPARE(textOf(find("entityNameField")), QString("Noir Grade"));
    }

    void anEntityOutsideTheListNeverOpensABlankForm() {
        fake->populate();
        mount({1280, 720}, {320, 720});
        waitForCards(6);
        auto* editor = find("entityEditorDialog");
        // Image 11 is not an entity, so the list does not contain it. The editor must not open as a new entity.
        QMetaObject::invokeMethod(panel, "editEntity", Q_ARG(QVariant, QVariant(id(11))));
        auto* banner = find("entityMissingBanner");
        QTRY_VERIFY(shown(banner));
        QVERIFY(!editor->property("visible").toBool());
        click(bannerAction("entityMissingBanner"));
        QTRY_VERIFY(!shown(banner));
        // A failed load shows its own error instead.
        fake->failSearch = true;
        QMetaObject::invokeMethod(panel, "editEntity", Q_ARG(QVariant, QVariant(id(11))));
        QTRY_VERIFY(shown(find("entityError")));
        QVERIFY(!shown(banner));
        QVERIFY(!editor->property("visible").toBool());
    }

    void captureGallery() {
        if (qEnvironmentVariable("NT_ENTITY_CAPTURE_DIR").isEmpty()) QSKIP("Set NT_ENTITY_CAPTURE_DIR to write screenshots");
        for (const auto& [mode, appearance] : {std::pair{QString("dark"), 2}, std::pair{QString("light"), 3}}) {
            auto shot = [&](const QString& name, QObject* hover = nullptr) { capture(mode + "-" + name, hover); };
            fake = std::make_unique<Fake>();
            fake->populate();
            for (const auto& size : {QSize(320, 800), QSize(240, 600), QSize(560, 800)}) {
                mount(size, size, true, appearance);
                waitForCards(6);
                // One card is hovered, so its actions show next to cards without them.
                shot(QString("panel-populated-%1x%2").arg(size.width()).arg(size.height()), card(size.width() == 240 ? 1 : 2));
                if (size.width() == 320) {
                    focus(card(3));
                    shot("panel-focused-card-320x800");
                }
                closeAll();
                fake = std::make_unique<Fake>();
                fake->populate();
            }
            mount({320, 800}, {320, 800}, true, appearance);
            waitForCards(6);
            click(in(card(4), "entityRemoveButton"));
            QTRY_VERIFY(shown(find("entityRemovedBanner")));
            QTRY_VERIFY(!card(4));
            shot("panel-undo-banner-320x800");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({240, 600}, {240, 600}, true, appearance);
            waitForCards(6);
            click(in(card(1), "entityRemoveButton"));
            QTRY_VERIFY(shown(find("entityRemovedBanner")));
            QTRY_VERIFY(!card(1));
            shot("panel-undo-banner-240x600");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({640, 1000}, {640, 1000}, true, appearance);
            theme->setProperty("uiScale", 2);
            waitForCards(6);
            shot("panel-populated-uiscale2-640x1000", card(2));
            closeAll();

            fake = std::make_unique<Fake>();
            fake->image(11, "Rooftop at night");
            mount({320, 800}, {320, 800}, true, appearance);
            QTRY_VERIFY_WITH_TIMEOUT(shown(find("entityEmpty")), 10000);
            shot("panel-empty-320x800");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->failSearch = true;
            mount({320, 800}, {320, 800}, true, appearance);
            QTRY_VERIFY_WITH_TIMEOUT(shown(find("entityError")), 10000);
            shot("panel-error-320x800");
            closeAll();

            fake = std::make_unique<Fake>();
            mount({320, 800}, {320, 800}, false, appearance);
            QTRY_VERIFY(shown(find("entityNotConfigured")));
            shot("panel-not-configured-320x800");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({1280, 720}, {320, 720}, true, appearance);
            waitForCards(6);
            click(find("entityNewButton"));
            QTRY_VERIFY(find("entityImagePicker")->property("opened").toBool());
            QTRY_VERIFY(find("entityImageTile_" + id(11)));
            shot("picker-1280x720");
            focus(find("entityImageTile_" + id(11)));
            shot("picker-hover-focus-1280x720", find("entityImageTile_" + id(13)));
            click(find("entityImageTile_" + id(12)));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-new-1280x720");
            focus(find("entityNameField"));
            type("Red Door");
            focus(find("entityDescriptorField"));
            type("A scuffed red door with a brass knocker.");
            shot("editor-new-filled-1280x720");
            click(find("entityCancel"));
            QTRY_VERIFY(!find("entityEditorDialog")->property("visible").toBool());
            click(in(card(1), "entityEditButton"));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-edit-character-1280x720");
            fake->failUpdates = true;
            click(find("entitySave"));
            QTRY_VERIFY(shown(find("entitySaveError")));
            shot("editor-save-error-1280x720");
            fake->failUpdates = false;
            click(find("entityCancel"));
            QTRY_VERIFY(!find("entityEditorDialog")->property("visible").toBool());
            click(in(card(2), "entityEditButton"));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-edit-location-1280x720");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({960, 600}, {320, 600}, true, appearance);
            waitForCards(6);
            click(in(card(1), "entityEditButton"));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-edit-character-960x600");
            closeAll();

            fake = std::make_unique<Fake>();
            fake->populate();
            mount({480, 360}, {320, 360}, true, appearance);
            waitForCards(6);
            click(in(card(1), "entityEditButton"));
            QTRY_VERIFY(find("entityEditorDialog")->property("opened").toBool());
            shot("editor-edit-character-480x360");
            closeAll();

            for (const auto& size : {QSize(1280, 720), QSize(960, 600)}) {
                    const auto suffix = QString("%1x%2").arg(size.width()).arg(size.height());
                    fake = std::make_unique<Fake>();
                    fake->populate();
                    mount(size, {320, size.height()}, true, appearance);
                    waitForCards(6);
                    openEditor(1);
                    openReference();
                    pickModel("entityReferenceCatalog", "edit-model");
                    shot("reference-" + suffix);
                    if (size.width() == 1280) {
                        click(find("entityTakes_4"));
                        click(find("entityReferenceGenerate"));
                        QTRY_COMPARE(socket->frames.size(), 1);
                        shot("reference-generating-" + suffix);
                        socket->reply(0, {{"asset_ids", QJsonArray{id(14), id(13), id(12), id(11)}}});
                        QTRY_VERIFY(find("entityTake_" + id(11)));
                        QTRY_VERIFY(settled());
                        click(find("entityTake_" + id(13)));
                        shot("reference-takes-" + suffix);
                        click(find("entityReferenceBack"));
                        QTRY_VERIFY(shown(find("entityReferenceForm")));
                        click(find("entityReferenceGenerate"));
                        QTRY_COMPARE(socket->frames.size(), 2);
                        socket->reply(1, {}, {{"code", "BAD_REQUEST"}, {"message", "The image model refused this prompt. Try different wording."}});
                        QTRY_VERIFY(shown(find("entityReferenceError")));
                        shot("reference-error-" + suffix);
                        // Keeping the look with a model that cannot edit blocks Generate and says why.
                        click(find("entityKeepLook"));
                        click(find("entityKeepLook"));
                        pickModel("entityReferenceCatalog", "image-model");
                        QTRY_VERIFY(!find("entityReferenceGenerate")->property("enabled").toBool());
                        shot("reference-blocked-" + suffix);
                    }
                closeAll();
                socket = std::make_unique<Socket>();
            }

            for (const auto& size : {QSize(1280, 720), QSize(960, 600)}) {
            const auto suffix = QString("%1x%2").arg(size.width()).arg(size.height());
            fake = std::make_unique<Fake>();
            fake->populate();
            mount(size, {320, size.height()}, true, appearance);
            waitForCards(6);
            openEditor(1);
            click(find("entityAssistButton"));
            QTRY_VERIFY(find("entityAssistPopover")->property("opened").toBool());
            pickModel("entityAssistCatalog", "text-model");
            shot("assist-empty-" + suffix);
            click(find("entityAssistAction_improve"));
            QTRY_COMPARE(socket->frames.size(), 1);
            socket->reply(0, {{"text", "Late thirties and weathered by years at sea. A navy peacoat worn thin at the cuffs, silver-streaked black hair tied back, a thin scar through her left eyebrow, and the calm, appraising stare of someone who has seen the harbor change many times."}});
            QTRY_VERIFY(shown(find("entityAssistProposal")));
            shot("assist-proposal-" + suffix);
                closeAll();
                socket = std::make_unique<Socket>();
            }

            fake = std::make_unique<Fake>();
            fake->entity(1, "Mara Vale", "character", "A captain.");
            mount({1280, 720}, {320, 720}, true, appearance);
            QTRY_VERIFY_WITH_TIMEOUT(card(1) != nullptr, 10000);
            click(find("entityNewButton"));
            QTRY_VERIFY(shown(find("entityImagesEmpty")));
            shot("picker-empty-1280x720");
            closeAll();
            socket = std::make_unique<Socket>();
        }
    }
    void libraryMenuOpensTheEditorWithFocusAndRefreshesAfterSaving() {
        fake->populate();
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        qputenv("NODETOOL_TIMELINE_CACHE_DIR", cache.path().toUtf8());
        nt::server::loadTimelineSource(fake->server.base().toString() + "#timeline=t1");
        mount({1280, 720}, {640, 720}, false, 2, true, true);
        QTRY_VERIFY_WITH_TIMEOUT(card(1) != nullptr, 10000);
        auto* tile = find("libraryAsset_" + id(12));
        QTRY_VERIFY_WITH_TIMEOUT(tile != nullptr && shown(tile), 10000);
        QObject* action = nullptr;
        auto openMenu = [&] {
            click(find("libraryAsset_" + id(12)), Qt::RightButton);
            action = find("libraryEntityAction");
            QTRY_VERIFY(shown(action));
        };
        // The real menu runs the action, and the editor ends up focused on the name once the menu has closed.
        openMenu();
        QCOMPARE(textOf(action), QString("Use as entity…"));
        click(action);
        auto* editor = find("entityEditorDialog");
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(editor->property("title").toString(), QString("New entity"));
        QCOMPARE(referenceId(), id(12));
        QTest::qWait(500);
        QVERIFY2(find("entityNameField")->property("activeFocus").toBool(), "the menu closing must not take focus from the name field");
        // Saving it reloads the Library, so the row now offers an edit instead of a second New form.
        QCOMPARE(host->property("reloads").toInt(), 0);
        focus(find("entityNameField"));
        type("Red Door");
        focus(find("entityDescriptorField"));
        type("A scuffed red door.");
        click(find("entitySave"));
        QTRY_VERIFY_WITH_TIMEOUT(!editor->property("visible").toBool() && fake->writes.size() == 1, 10000);
        QTRY_COMPARE(host->property("reloads").toInt(), 1);
        QTRY_VERIFY_WITH_TIMEOUT(find("libraryAsset_" + id(12)) != nullptr, 10000);
        openMenu();
        QCOMPARE(textOf(action), QString("Edit entity…"));
        // Cancelling the editor from the menu returns focus to the Library tile.
        click(find("libraryEntityAction"));
        QTRY_VERIFY(editor->property("opened").toBool());
        QCOMPARE(editor->property("title").toString(), QString("Edit entity"));
        QTest::qWait(500);
        click(find("entityCancel"));
        QTRY_VERIFY(!editor->property("visible").toBool());
        QTRY_VERIFY(find("libraryAsset_" + id(12))->property("activeFocus").toBool());
        // Removing an entity reloads the Library too.
        // The saved card scrolled the short list, so activate the remove button without a pointer.
        QVERIFY(QMetaObject::invokeMethod(in(card(4), "entityRemoveButton"), "clicked"));
        QTRY_VERIFY_WITH_TIMEOUT(fake->writes.size() == 2, 10000);
        QTRY_COMPARE(host->property("reloads").toInt(), 2);
    }
    // Keep this last: it installs a process-wide save target, which the not-configured test must not see.
    void panelLoadsWhenShownAndRefreshesWhenRevealed() {
        fake->populate();
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        qputenv("NODETOOL_TIMELINE_CACHE_DIR", cache.path().toUtf8());
        nt::server::loadTimelineSource(fake->server.base().toString() + "#timeline=t1");
        auto searches = [&] { return fake->server.countRequests("GET", "/trpc/assets.search"); };
        mount({1280, 720}, {320, 720}, false, 2, false);
        QVERIFY(library->configured());
        QVERIFY(!panel->isVisible());
        QTest::qWait(400);
        QCOMPARE(searches(), 0);
        QVERIFY(library->entities().isEmpty());
        panel->setVisible(true);
        QTRY_COMPARE(searches(), 1);
        QTRY_VERIFY(card(1));
        panel->setVisible(false);
        QTest::qWait(300);
        QCOMPARE(searches(), 1);
        panel->setVisible(true);
        QTRY_COMPARE(searches(), 2);
        closeAll();
        // A panel that is visible when it is created loads once without being asked.
        fake = std::make_unique<Fake>();
        fake->populate();
        nt::server::loadTimelineSource(fake->server.base().toString() + "#timeline=t1");
        mount({1280, 720}, {320, 720}, false);
        QTRY_VERIFY_WITH_TIMEOUT(card(1) != nullptr, 10000);
        QCOMPARE(fake->server.countRequests("GET", "/trpc/assets.search"), 1);
    }
};

int main(int argc, char** argv) {
    // The model picker remembers its choice in QSettings, so keep the tests out of the user's.
    QTemporaryDir settings;
    QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings.path());
    QGuiApplication app(argc, argv);
    TestEntityPanel test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_entitypanel.moc"
