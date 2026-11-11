#include "export/PngZip.h"
#include <QBuffer>
#include <QFile>
#include <QImage>
#include <QProcess>
#include <QTemporaryDir>
#include <QtTest>
#include <stdexcept>

namespace {
class PositionedOutput : public QIODevice {
public:
    PositionedOutput() { open(QIODevice::WriteOnly); }
    qint64 pos() const override { return position; }
    qint64 position = 0;
    bool fail = false;
private:
    qint64 readData(char*, qint64) override { return -1; }
    qint64 writeData(const char*, qint64 size) override {
        if (fail) return -1;
        position += size;
        return size;
    }
};
}
class PngZipTest : public QObject {
    Q_OBJECT
private slots:
    void storedArchive() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto filename = dir.filePath("sequence.zip");
        QFile output(filename);
        QVERIFY(output.open(QIODevice::WriteOnly));
        nt::exporting::PngZip zip(output);
        QImage image(2, 3, QImage::Format_RGBA8888);
        image.fill(Qt::red);
        QByteArray png;
        QBuffer buffer(&png);
        QVERIFY(buffer.open(QIODevice::WriteOnly));
        QVERIFY(image.save(&buffer, "PNG"));
        zip.add("frame_000001.png", png);
        QByteArray bytes;
        for (int i = 0; i < 256; ++i) bytes.append(static_cast<char>(i));
        zip.add("bytes", bytes);
        zip.add("empty", {});
        zip.add("manifest.json", "{\"format\":\"png_sequence\",\"count\":1}");
        zip.finish();
        QVERIFY(output.flush());
        output.close();
        QProcess reader;
        reader.start("python3", {"-I", "-c", R"(
import json, struct, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    assert z.testzip() is None
    assert z.namelist() == ['frame_000001.png', 'bytes', 'empty', 'manifest.json']
    assert all(i.compress_type == zipfile.ZIP_STORED for i in z.infolist())
    assert z.read('bytes') == bytes(range(256))
    assert z.read('empty') == b''
    assert json.loads(z.read('manifest.json')) == dict(format='png_sequence', count=1)
    png = z.read('frame_000001.png')
    assert png[:8] == b'\x89PNG\r\n\x1a\n' and png[12:16] == b'IHDR'
    assert struct.unpack('>II', png[16:24]) == (2, 3)
)", filename});
        QVERIFY(reader.waitForFinished());
        QCOMPARE(reader.exitStatus(), QProcess::NormalExit);
        QVERIFY2(reader.exitCode() == 0, reader.readAllStandardError().constData());
        QVERIFY_EXCEPTION_THROWN(zip.add("late", {}), std::runtime_error);
        QVERIFY_EXCEPTION_THROWN(zip.finish(), std::runtime_error);
    }
    void entryLimit() {
        QByteArray bytes;
        QBuffer output(&bytes);
        QVERIFY(output.open(QIODevice::WriteOnly));
        nt::exporting::PngZip zip(output);
        for (quint64 i = 0; i < 65535; ++i) zip.add(QByteArray::number(i), {});
        const auto position = output.pos();
        QVERIFY_EXCEPTION_THROWN(zip.add("one-too-many", {}), std::runtime_error);
        QCOMPARE(output.pos(), position);
        zip.finish();
        QCOMPARE(bytes.right(22).mid(8, 4), QByteArray::fromHex("ffffffff"));
    }
    void sizeLimits() {
        constexpr qint64 max = 0xFFFFFFFFLL;
        PositionedOutput output;
        nt::exporting::PngZip zip(output);
        // Virtual positions exercise 4 GiB boundaries without allocating 4 GiB.
        output.position = max - 100;
        QVERIFY_EXCEPTION_THROWN(zip.add("x", QByteArray(40, 'x')), std::runtime_error);
        QCOMPARE(output.pos(), max - 100);
        output.position = max + 1;
        QVERIFY_EXCEPTION_THROWN(zip.add("x", {}), std::runtime_error);
        QVERIFY_EXCEPTION_THROWN(zip.finish(), std::runtime_error);
        output.position = max - 10;
        QVERIFY_EXCEPTION_THROWN(zip.finish(), std::runtime_error);
        output.position = max - (30 + 1 + 46 + 1 + 22);
        zip.add("x", {});
        zip.finish();
        QCOMPARE(output.pos(), max);
    }
    void writeFailure() {
        PositionedOutput output;
        nt::exporting::PngZip zip(output);
        output.fail = true;
        QVERIFY_EXCEPTION_THROWN(zip.add("x", "payload"), std::runtime_error);
    }
};
QTEST_GUILESS_MAIN(PngZipTest)
#include "tst_pngzip.moc"
