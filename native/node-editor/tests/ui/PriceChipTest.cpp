#include "graph/EditorScene.h"
#include "graph/ProviderPricing.h"
#include "interfaces/PriceChip.h"
#include "ui/EditorWindow.h"
#include <QDir>
#include <QGraphicsView>
#include <QJsonDocument>
#include <QQuickItem>
#include <QQuickWidget>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtTest>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
using namespace nodetool;
using namespace nodetool::node_editor;

// Answers the credits and estimate requests the price popover makes, and
// counts them. The websocket upgrade is left unanswered.
class PricingServer : public QTcpServer {
public:
    QStringList paths;
    PricingServer() {
        listen(QHostAddress::LocalHost);
        connect(this, &QTcpServer::newConnection, this, [this] {
            while (hasPendingConnections()) {
                auto *socket = nextPendingConnection();
                socket->setParent(this);
                connect(socket, &QTcpSocket::readyRead, this, [this, socket] {
                    const auto bytes = socket->property("bytes").toByteArray() + socket->readAll();
                    socket->setProperty("bytes", bytes);
                    if (!bytes.contains("\r\n\r\n") || socket->property("done").toBool()) { return; }
                    socket->setProperty("done", true);
                    const auto path = QString::fromLatin1(bytes.split(' ').value(1));
                    if (bytes.toLower().contains("upgrade: websocket")) { return; }
                    paths.append(path);
                    if (path == "/api/fal/credits") {
                        respond(socket, {{"credit_balance", QJsonObject{{"amount", 12.5}, {"currency", "USD"}}}});
                    } else if (path == "/api/kie/credits") {
                        respond(socket, {{"credit_balance", QJsonValue::Null}, {"unavailable", true},
                                         {"detail", "KIE_API_KEY is not set"}});
                    } else if (path == "/api/fal/pricing/estimate") {
                        respond(socket, {{"endpoint_id", "fal-ai/meshy/v5/retexture"}, {"total_cost", 0.31}, {"currency", "USD"}});
                    } else {
                        respond(socket, {{"nodes", QJsonArray{}}});
                    }
                });
            }
        });
    }
    static void respond(QTcpSocket *socket, const QJsonObject &value) {
        const auto bytes = QJsonDocument(value).toJson(QJsonDocument::Compact);
        socket->write("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: " +
                      QByteArray::number(bytes.size()) + "\r\n\r\n" + bytes);
        socket->disconnectFromHost();
    }
};

class PriceChipTest : public QObject {
    Q_OBJECT
    static QQuickItem *find(QQuickItem *item, const QString &name) {
        if (!item) { return nullptr; }
        if (item->objectName() == name) { return item; }
        for (auto *child : item->childItems()) {
            if (auto *found = find(child, name)) { return found; }
        }
        return nullptr;
    }
    static QJsonObject node(const QString &id, const QString &type, double x) {
        return {{"id", id}, {"type", type}, {"data", QJsonObject{}},
                {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", 100}}}}}};
    }

private slots:
    void formatsLikeTheWeb() {
        using namespace provider_pricing;
        QCOMPARE(money(0.07, "USD"), QString("$0.07"));
        QCOMPARE(money(1.5, "usd"), QString("$1.50"));
        QCOMPARE(money(0.1234, "USD"), QString("$0.1234"));
        QCOMPARE(money(0.005, "USD"), QString("$0.0050"));
        QCOMPARE(money(1234, "USD"), QString("$1,234.00"));
        const auto fal = [](double price, const QString &unit) {
            return QJsonObject{{"endpoint_id", "fal-ai/x"}, {"unit_price", price}, {"billing_unit", unit}, {"currency", "USD"}};
        };
        QCOMPARE(falShort(fal(0.07, "seconds")), QString("$0.07 / s"));
        QCOMPARE(falShort(fal(0.04, "images")), QString("$0.04 / image"));
        QCOMPARE(falShort(fal(0.3, "1000 characters")), QString("$0.30 / 1K chars"));
        QCOMPARE(falShort(fal(0.2, "1")), QString("$0.20"));
        QCOMPARE(falShort(fal(0.2, "process")), QString("$0.20 / process"));
        QCOMPARE(falShort(fal(0.02, "units")), QString("pricing varies"));
        const auto now = QDateTime::fromString("2026-11-15T00:00:00Z", Qt::ISODate);
        auto dated = fal(0.02, "units");
        dated["checked_at"] = "2026-08-15T00:00:00Z";
        QCOMPARE(falDetails(dated, now), QString("$0.02 per units (SEE DETAILS)\n\nVaries by resolution and quality.\n"
                                                 "View on fal.ai to see detailed pricing.\n\nPrice from 3 months ago\n"
                                                 "Endpoint: fal-ai/x"));
        const auto kie = [](double price, const QString &unit, int tiers) {
            return QJsonObject{{"model_id", "kling"}, {"unit_price", price}, {"billing_unit", unit}, {"tier_count", tiers}};
        };
        QCOMPARE(kieShort(kie(12, "run", 1)), QString("12 credits"));
        QCOMPARE(kieShort(kie(12.25, "second", 1)), QString("12.3 credits / second"));
        QCOMPARE(kieShort(kie(12, "video", 3)), QString("from 12 credits / video"));
        QCOMPARE(kieDetails(kie(12, "run", 1), now), QString("12 credits\nPrice · date unknown\nModel: kling"));
        QCOMPARE(falEstimate(0.31, "USD"), QString("~$0.31 per run (historical avg)"));
        QCOMPARE(credits("fal", {{"credit_balance", QJsonObject{{"amount", 12.5}, {"currency", "USD"}}}}), QString("$12.50"));
        QCOMPARE(credits("fal", {{"credit_balance", 3}}), QString("$3.00"));
        QCOMPARE(credits("fal", {{"credit_balance", QJsonValue::Null}}), QString("N/A"));
        QCOMPARE(credits("kie", {{"credit_balance", QJsonObject{{"amount", 1234.4}}}}), QString("1,234 credits"));
        QVERIFY(detailSuggestsKeys("kie", "KIE_API_KEY is not set"));
        QVERIFY(!detailSuggestsKeys("kie", "Could not reach kie.ai"));
        QVERIFY(!detailSuggestsKeys("fal", ""));
    }

    void bundleSuppliesFalAndKiePrices() {
        PricingBundle bundle;
        const auto fal = provider_pricing::chip("fal.3d_to_3d.MeshyV5Retexture", {}, bundle);
        QVERIFY(fal);
        QCOMPARE(fal->provider, QString("fal"));
        QCOMPARE(fal->label, QString("$0.30 / generation"));
        QCOMPARE(fal->tone, QString("success"));
        QVERIFY(fal->details.contains("Endpoint: fal-ai/meshy/v5/retexture"));
        QVERIFY(fal->details.contains("Price from "));
        QCOMPARE(fal->links.value(0).url, QString("https://fal.ai/models/fal-ai/meshy/v5/retexture"));
        // Metadata with its own live price wins over the bundle.
        const QJsonObject live{{"fal_unit_pricing", QJsonObject{{"endpoint_id", "fal-ai/live"}, {"unit_price", 0.5},
                                                                {"billing_unit", "images"}, {"currency", "USD"},
                                                                {"source", "live"}}}};
        const auto own = provider_pricing::chip("fal.3d_to_3d.MeshyV5Retexture", live, bundle);
        QVERIFY(own && own->live);
        QCOMPARE(own->label, QString("$0.50 / image"));
        // A KIE node without a bundled price still shows the credits chip.
        const auto unpriced = provider_pricing::chip("kie.unknown.Model", {}, bundle);
        QVERIFY(unpriced);
        QCOMPARE(unpriced->label, QString("KIE credits"));
        QCOMPARE(unpriced->tone, QString("info"));
        QVERIFY(!unpriced->detailsArePricing);
        QCOMPARE(unpriced->links.size(), 2);
        QVERIFY(!provider_pricing::chip("nodetool.text.Concat", {}, bundle));
    }

    void selectedFalCardShowsThePriceChipAndPopover() {
        PricingServer server;
        EditorWindow window;
        window.resize(1400, 900);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        window.setCatalog({QJsonObject{{"node_type", "fal.3d_to_3d.MeshyV5Retexture"}, {"title", "Meshy Retexture"}, {"namespace", "fal.3d_to_3d"}},
                           QJsonObject{{"node_type", "kie.unknown.Model"}, {"title", "Kie Model"}, {"namespace", "kie.unknown"}},
                           QJsonObject{{"node_type", "nodetool.text.Concat"}, {"title", "Concat"}, {"namespace", "nodetool.text"}}});
        QVERIFY(window.document()->load({{"name", "Pricing"},
                                         {"graph", QJsonObject{{"nodes", QJsonArray{node("fal", "fal.3d_to_3d.MeshyV5Retexture", 0),
                                                                                    node("kie", "kie.unknown.Model", 400),
                                                                                    node("text", "nodetool.text.Concat", 800)}},
                                                               {"edges", QJsonArray{}}}}}));
        window.session()->connectToServer(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), {});
        window.action("Fit");
        auto *overlay = window.activeEditor()->findChild<QQuickWidget *>("price-chip-overlay");
        QVERIFY(overlay);
        QVERIFY(!overlay->isVisible());

        QVERIFY(window.selectNode("fal"));
        QTRY_VERIFY(overlay->isVisible());
        auto *chip = overlay->rootObject()->property("chip").value<PriceChip *>();
        QVERIFY(chip);
        QCOMPARE(chip->label(), QString("$0.30 / generation"));
        // The chip hangs under the card's bottom-right corner, also after the view settles.
        auto &model = static_cast<WorkflowGraphModel &>(window.activeEditor()->scene()->graphModel());
        QtNodes::NodeId falId{};
        for (const auto id : model.allNodeIds()) {
            if (model.resourceId(id) == "fal") { falId = id; }
        }
        auto *view = window.activeEditor()->findChild<QGraphicsView *>();
        const auto card = [&] {
            const auto *item = window.activeEditor()->scene()->nodeGraphicsObject(falId);
            return view->mapFromScene(QRectF(item->scenePos(), model.layout(falId).size)).boundingRect().translated(view->viewport()->pos());
        };
        QTRY_COMPARE(overlay->geometry().top(), card().y() + card().height() + 5);
        QTRY_COMPARE(overlay->geometry().x() + overlay->width(), card().x() + card().width() - 4);

        // A click opens the popover, which loads the credits and the estimate.
        auto *button = find(overlay->rootObject(), "price-chip-button");
        QVERIFY(button);
        QTest::mouseClick(overlay->quickWindow(), Qt::LeftButton, {}, button->mapToScene(QPointF(button->width() / 2, button->height() / 2)).toPoint());
        QTRY_VERIFY(chip->open());
        QTRY_COMPARE(chip->credits(), QString("$12.50 remaining"));
        QTRY_COMPARE(chip->estimate(), QString("~$0.31 per run (historical avg)"));
        QVERIFY(server.paths.contains("/api/fal/credits"));
        QVERIFY(server.paths.contains("/api/fal/pricing/estimate"));
        auto *popover = find(overlay->rootObject(), "price-chip-popover");
        QVERIFY(popover && popover->isVisible());
        QTRY_VERIFY(overlay->height() > popover->height());
        if (const auto directory = qEnvironmentVariable("NODETOOL_PRICE_CHIP_CAPTURE_DIR"); !directory.isEmpty()) {
            QTest::qWait(200);
            QDir().mkpath(directory);
            QVERIFY(window.grab().save(directory + "/PriceChip-fal.png"));
        }

        // A KIE card without a price shows the credits chip, and an unavailable
        // balance offers the API keys link.
        QVERIFY(window.selectNode("kie"));
        QTRY_COMPARE(chip->label(), QString("KIE credits"));
        QVERIFY(!chip->open());
        chip->toggle();
        QTRY_COMPARE(chip->creditsState(), QString("unavailable"));
        QCOMPARE(chip->credits(), QString("KIE_API_KEY is not set"));
        QCOMPARE(chip->keysUrl(), QString("https://kie.ai/api-key"));
        QCOMPARE(chip->estimateState(), QString());

        // Other nodes and an empty selection show no chip.
        QVERIFY(window.selectNode("text"));
        QTRY_VERIFY(!overlay->isVisible());
        QCOMPARE(chip->provider(), QString());
    }
};

QTEST_MAIN(PriceChipTest)
#include "PriceChipTest.moc"
