#include "render/GameViewport.h"
#include <QBuffer>
#include <QFile>
#include <QGuiApplication>
#include <QKeyEvent>
#include <QMouseEvent>
#include <QTemporaryDir>
#include <QtTest>
using namespace nodetool::game;
class RenderTest final : public QObject {
  Q_OBJECT
private slots:
  void firstPersonPointerDeltasStayRaw() {
    GameViewport viewport;
    viewport.setDocument(
        {{"dimension", "3d"}, {"camera", {{"kind", "firstPerson"}}}});
    std::vector<Json> input;
    viewport.setInputHandler(
        [&](const Json &value) { input.push_back(value); });
    const auto pointer = [&](QEvent::Type type, QPointF position,
                             Qt::MouseButton button, Qt::MouseButtons buttons) {
      QMouseEvent event(type, position, position, button, buttons,
                        Qt::NoModifier);
      QCoreApplication::sendEvent(&viewport, &event);
    };
    pointer(QEvent::MouseButtonPress, {10, 20}, Qt::RightButton,
            Qt::RightButton);
    pointer(QEvent::MouseMove, {17, 15}, Qt::NoButton, Qt::RightButton);
    pointer(QEvent::MouseButtonRelease, {17, 15}, Qt::RightButton,
            Qt::NoButton);
    pointer(QEvent::MouseMove, {30, 30}, Qt::NoButton, Qt::NoButton);
    QCOMPARE(input.size(), std::size_t(1));
    QCOMPARE(input[0].at("look").at("x").get<double>(), 7.0);
    QCOMPARE(input[0].at("look").at("y").get<double>(), -5.0);
    viewport.setDocument(
        {{"dimension", "3d"},
         {"camera", {{"position", {0, 0, 5}}, {"target", {0, 0, 0}}}}});
    pointer(QEvent::MouseButtonPress, {10, 20}, Qt::RightButton,
            Qt::RightButton);
    pointer(QEvent::MouseMove, {17, 15}, Qt::NoButton, Qt::RightButton);
    QCOMPARE(input.size(), std::size_t(1));
  }
  void autoRepeatKeepsPhysicalKeyHeld_data() {
    QTest::addColumn<int>("key");
    QTest::newRow("move-w") << int(Qt::Key_W);
    QTest::newRow("sprint-shift") << int(Qt::Key_Shift);
    QTest::newRow("jump-space") << int(Qt::Key_Space);
  }
  void autoRepeatKeepsPhysicalKeyHeld() {
    QFETCH(int, key);
    GameViewport viewport;
    bool held = false;
    std::vector<Json> input;
    viewport.setInputHandler([&](const Json &value) {
      input.push_back(value);
      held = value.at("pressed").get<bool>();
    });
    const auto send = [&](QEvent::Type type, bool repeat) {
      const auto modifiers = key == Qt::Key_Shift ? Qt::ShiftModifier
                                                 : Qt::NoModifier;
      QKeyEvent event(type, key, modifiers, QString(), repeat, 1);
      event.setAccepted(false);
      QCoreApplication::sendEvent(&viewport, &event);
      return event.isAccepted();
    };
    QVERIFY(send(QEvent::KeyPress, false));
    QVERIFY(held);
    QCOMPARE(input.size(), std::size_t(1));
    QCOMPARE(input.front().at("key"), Json(key));
    for (int repeat = 0; repeat < 3; ++repeat) {
      QVERIFY(send(QEvent::KeyRelease, true));
      QVERIFY(held);
      QCOMPARE(input.size(), std::size_t(1));
      QVERIFY(send(QEvent::KeyPress, true));
      QVERIFY(held);
      QCOMPARE(input.size(), std::size_t(1));
    }
    QVERIFY(send(QEvent::KeyRelease, false));
    QVERIFY(!held);
    QCOMPARE(input.size(), std::size_t(2));
    QCOMPARE(input.back().at("pressed"), Json(false));
    // Late repeat events cannot restore a key that was physically released.
    QVERIFY(send(QEvent::KeyRelease, true));
    QVERIFY(send(QEvent::KeyPress, true));
    QVERIFY(!held);
    QCOMPARE(input.size(), std::size_t(2));
  }
  void physicalTapProducesOnePressAndRelease() {
    GameViewport viewport;
    std::vector<Json> input;
    viewport.setInputHandler(
        [&](const Json &value) { input.push_back(value); });
    for (const auto type : {QEvent::KeyPress, QEvent::KeyRelease}) {
      QKeyEvent event(type, Qt::Key_Space, Qt::NoModifier);
      QCoreApplication::sendEvent(&viewport, &event);
    }
    QCOMPARE(input.size(), std::size_t(2));
    QCOMPARE(input[0], (Json{{"key", int(Qt::Key_Space)}, {"pressed", true}}));
    QCOMPARE(input[1], (Json{{"key", int(Qt::Key_Space)}, {"pressed", false}}));
  }
  void boundedRasterPreparation() {
    QTemporaryDir directory;
    QVERIFY(directory.isValid());
    const auto prepare = [&](const QByteArray &encoded,
                             Json extra = Json::object()) {
      QFile file(directory.filePath("image"));
      if (!file.open(QIODevice::WriteOnly) ||
          file.write(encoded) != encoded.size()) {
        throw std::runtime_error("Fixture write failed");
      }
      file.close();
      const std::vector<std::uint8_t> bytes(encoded.begin(), encoded.end());
      Json entry = {{"id", "image"},
                    {"kind", "image"},
                    {"path", "image"},
                    {"size", encoded.size()},
                    {"digest", assetDigest(bytes)}};
      entry.update(extra);
      Json manifest = Json::array({entry});
      PreparedAssets assets(directory.path().toStdString(), manifest);
      return prepareImages(assets, manifest);
    };
    QImage image(2, 2, QImage::Format_RGBA8888);
    image.fill(Qt::red);
    for (const auto *format : {"PNG", "JPEG"}) {
      QByteArray encoded;
      QBuffer buffer(&encoded);
      buffer.open(QIODevice::WriteOnly);
      QVERIFY(image.save(&buffer, format));
      const auto result = prepare(encoded);
      QCOMPARE(result.at("image").size(), QSize(2, 2));
      bool rejected = false;
      try {
        prepare(
            encoded,
            {{"trim",
              {{"sourceWidth", 1}, {"sourceHeight", 1}, {"x", 0}, {"y", 0}}}});
      } catch (const Error &) {
        rejected = true;
      }
      QVERIFY(rejected);
    }
    bool rejected = false;
    try {
      prepare(QByteArray(
          "<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>"));
    } catch (const Error &) {
      rejected = true;
    }
    QVERIFY(rejected);
    // PNG dimensions are inspected before the decoder allocates a pixel buffer.
    QByteArray encoded;
    QBuffer buffer(&encoded);
    buffer.open(QIODevice::WriteOnly);
    QVERIFY(image.save(&buffer, "PNG"));
    encoded[16] = 0;
    encoded[17] = 0;
    encoded[18] = char(0x20);
    encoded[19] = 1;
    std::uint32_t crc = 0xffffffffU;
    for (int i = 12; i < 29; ++i) {
      crc ^= static_cast<unsigned char>(encoded[i]);
      for (int bit = 0; bit < 8; ++bit) {
        crc = (crc >> 1) ^ ((crc & 1) ? 0xedb88320U : 0);
      }
    }
    crc ^= 0xffffffffU;
    for (int i = 0; i < 4; ++i) {
      encoded[29 + i] = char((crc >> (24 - i * 8)) & 255);
    }
    rejected = false;
    try {
      prepare(encoded);
    } catch (const Error &error) {
      rejected = error.code == "resource_limit";
    }
    QVERIFY(rejected);
  }
  void mailboxReplacesOnlyPresentation() {
    FrameMailbox box;
    box.publish({{"tick", 1}});
    auto old = box.latest();
    box.publish({{"tick", 2}});
    QCOMPARE(old->at("tick").get<int>(), 1);
    QCOMPARE(box.latest()->at("tick").get<int>(), 2);
  }
  void hudLayoutAndHitTesting() {
    Json doc = {{"hud", Json::array({{{"id", "go"},
                                      {"kind", "button"},
                                      {"bounds", {.1, .2, .4, .2}},
                                      {"text", "Score {score}"},
                                      {"action", "jump"}}})}};
    GameViewport item;
    item.setSize({640, 480});
    item.setDocument(doc);
    QVERIFY(item.actionAt({100, 120}).has_value());
    QCOMPARE(QString::fromStdString(*item.actionAt({100, 120})),
             QString("jump"));
    QVERIFY(!item.actionAt({0, 0}));
    auto image = paintHud(doc, {{"score", 4}}, QSize(640, 480));
    QVERIFY(image.pixelColor(100, 120).alpha() > 0);
    QVERIFY(image.pixelColor(0, 0).alpha() == 0);
  }
};
int main(int argc, char **argv) {
  QGuiApplication app(argc, argv);
  RenderTest test;
  return QTest::qExec(&test, argc, argv);
}
#include "RenderTest.moc"
