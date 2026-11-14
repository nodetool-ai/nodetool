#include "interchange/PremiereArchive.h"

#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QHash>
#include <QIODevice>
#include <QRegularExpression>
#include <QUrl>

#include <array>

namespace nt::interchange {
namespace {
constexpr auto CrcTable = [] {
    std::array<quint32, 256> table{};
    for (quint32 i = 0; i < table.size(); ++i) {
        quint32 crc = i;
        for (int bit = 0; bit < 8; ++bit) {
            crc = (crc >> 1) ^ ((crc & 1) ? 0xEDB88320U : 0);
        }
        table[i] = crc;
    }
    return table;
}();
quint32 crcUpdate(quint32 crc, const QByteArray& bytes) {
    for (const char byte : bytes) {
        crc = CrcTable[(crc ^ static_cast<unsigned char>(byte)) & 0xFF] ^ (crc >> 8);
    }
    return crc;
}
void put16(QByteArray& bytes, quint16 value) {
    bytes.append(static_cast<char>(value & 0xFF));
    bytes.append(static_cast<char>((value >> 8) & 0xFF));
}
void put32(QByteArray& bytes, quint32 value) {
    put16(bytes, static_cast<quint16>(value & 0xFFFF));
    put16(bytes, static_cast<quint16>(value >> 16));
}
constexpr qint64 Chunk = 1 << 20;

QString unescapeXml(QString text) {
    static const QRegularExpression entity(QStringLiteral("&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);"));
    QString out;
    qsizetype last = 0;
    for (auto it = entity.globalMatch(text); it.hasNext();) {
        const auto match = it.next();
        out += text.mid(last, match.capturedStart() - last);
        const QString name = match.captured(1);
        if (name == u"amp") out += u'&';
        else if (name == u"lt") out += u'<';
        else if (name == u"gt") out += u'>';
        else if (name == u"quot") out += u'"';
        else if (name == u"apos") out += u'\'';
        else {
            bool ok = false;
            const uint code = name.startsWith(u"#x") ? name.mid(2).toUInt(&ok, 16) : name.mid(1).toUInt(&ok, 10);
            out += ok && code > 0 && code <= 0x10FFFF ? QString::fromUcs4(reinterpret_cast<const char32_t*>(&code), 1) : match.captured(0);
        }
        last = match.capturedEnd();
    }
    return out + text.mid(last);
}
QString escapeXml(const QString& text) {
    QString out = text;
    out.replace(u'&', QStringLiteral("&amp;")).replace(u'<', QStringLiteral("&lt;")).replace(u'>', QStringLiteral("&gt;"));
    return out;
}
// A file name safe to put in a zip entry.
QString entryName(const QString& name) {
    QString out = name;
    out.replace(QRegularExpression(QStringLiteral("[^A-Za-z0-9._-]+")), QStringLiteral("_"));
    return out.isEmpty() ? QStringLiteral("media") : out;
}
}  // namespace

StreamZip::StreamZip(QIODevice& output) : m_output(output) {}

bool StreamZip::fail(const QString& message) {
    if (m_error.isEmpty()) m_error = message;
    return false;
}

bool StreamZip::write(const QByteArray& bytes) {
    if (m_output.write(bytes) != bytes.size()) return fail(m_output.errorString().isEmpty() ? QStringLiteral("Cannot write the archive.") : m_output.errorString());
    m_written += static_cast<quint64>(bytes.size());
    return true;
}

bool StreamZip::writeHeader(const QByteArray& name, quint32 crc, quint32 size) {
    QByteArray header;
    put32(header, 0x04034B50);
    put16(header, 20);      // ZIP 2.0, stored
    put16(header, 0x0800);  // UTF-8 names
    put16(header, 0);
    put16(header, 0);
    put16(header, 0x0021);  // 1980-01-01
    put32(header, crc);
    put32(header, size);
    put32(header, size);
    put16(header, static_cast<quint16>(name.size()));
    put16(header, 0);
    return write(header) && write(name);
}

bool StreamZip::add(const QString& name, const QByteArray& bytes) {
    if (m_finished) return fail(QStringLiteral("The archive is already finished."));
    const QByteArray raw = name.toUtf8();
    // Leave room for this entry's central record and the end record.
    if (m_entries.size() >= static_cast<size_t>(MaxEntries) || raw.size() > 65535 ||
        static_cast<quint64>(bytes.size()) > MaxBytes ||
        m_written + 30 + static_cast<quint64>(raw.size()) + static_cast<quint64>(bytes.size()) + (m_entries.size() + 1) * (46 + 300ULL) + 22 > MaxBytes) {
        return fail(QStringLiteral("The archive would pass the 4 GiB limit of a zip."));
    }
    Entry entry{raw, crcUpdate(0xFFFFFFFFU, bytes) ^ 0xFFFFFFFFU, static_cast<quint32>(bytes.size()), static_cast<quint32>(m_written)};
    if (!writeHeader(raw, entry.crc, entry.size) || !write(bytes)) return false;
    m_entries.push_back(std::move(entry));
    return true;
}

bool StreamZip::addFile(const QString& name, const QString& path, const std::function<bool()>& cancelled) {
    if (m_finished) return fail(QStringLiteral("The archive is already finished."));
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) return fail(QStringLiteral("Cannot read %1: %2").arg(path, file.errorString()));
    const QByteArray raw = name.toUtf8();
    const quint64 size = static_cast<quint64>(file.size());
    if (m_entries.size() >= static_cast<size_t>(MaxEntries) || raw.size() > 65535 || size > MaxBytes ||
        m_written + 30 + static_cast<quint64>(raw.size()) + size + (m_entries.size() + 1) * (46 + 300ULL) + 22 > MaxBytes) {
        return fail(QStringLiteral("%1 does not fit in a zip, which holds 4 GiB.").arg(QFileInfo(path).fileName()));
    }
    quint32 crc = 0xFFFFFFFFU;
    while (!file.atEnd()) {
        if (cancelled && cancelled()) return fail(QStringLiteral("Cancelled."));
        const QByteArray chunk = file.read(Chunk);
        if (chunk.isEmpty() && !file.atEnd()) return fail(QStringLiteral("Cannot read %1: %2").arg(path, file.errorString()));
        crc = crcUpdate(crc, chunk);
    }
    crc ^= 0xFFFFFFFFU;
    if (static_cast<quint64>(file.size()) != size) return fail(QStringLiteral("%1 changed while it was being packed.").arg(QFileInfo(path).fileName()));
    Entry entry{raw, crc, static_cast<quint32>(size), static_cast<quint32>(m_written)};
    if (!writeHeader(raw, crc, entry.size) || !file.seek(0)) return fail(m_error.isEmpty() ? file.errorString() : m_error);
    quint64 copied = 0;
    while (copied < size) {
        if (cancelled && cancelled()) return fail(QStringLiteral("Cancelled."));
        const QByteArray chunk = file.read(Chunk);
        if (chunk.isEmpty()) return fail(QStringLiteral("%1 changed while it was being packed.").arg(QFileInfo(path).fileName()));
        copied += static_cast<quint64>(chunk.size());
        if (copied > size) return fail(QStringLiteral("%1 changed while it was being packed.").arg(QFileInfo(path).fileName()));
        if (!write(chunk)) return false;
    }
    m_entries.push_back(std::move(entry));
    return true;
}

bool StreamZip::finish() {
    if (m_finished) return true;
    const quint32 centralOffset = static_cast<quint32>(m_written);
    quint64 centralSize = 0;
    for (const Entry& entry : m_entries) {
        QByteArray record;
        put32(record, 0x02014B50);
        put16(record, 20);
        put16(record, 20);
        put16(record, 0x0800);
        put16(record, 0);
        put16(record, 0);
        put16(record, 0x0021);
        put32(record, entry.crc);
        put32(record, entry.size);
        put32(record, entry.size);
        put16(record, static_cast<quint16>(entry.name.size()));
        put16(record, 0);
        put16(record, 0);
        put16(record, 0);
        put16(record, 0);
        put32(record, 0);
        put32(record, entry.offset);
        if (!write(record) || !write(entry.name)) return false;
        centralSize += static_cast<quint64>(record.size() + entry.name.size());
    }
    QByteArray end;
    put32(end, 0x06054B50);
    put16(end, 0);
    put16(end, 0);
    put16(end, static_cast<quint16>(m_entries.size()));
    put16(end, static_cast<quint16>(m_entries.size()));
    put32(end, static_cast<quint32>(centralSize));
    put32(end, centralOffset);
    put16(end, 0);
    if (!write(end)) return false;
    m_finished = true;
    return true;
}

MediaNameIndex::MediaNameIndex(QString baseDir, std::function<bool()> stop)
    : m_baseDir(std::move(baseDir)), m_stop(std::move(stop)) {}

QString MediaNameIndex::unique(const QString& fileName) {
    if (!m_built) {
        m_built = true;
        int visited = 0;
        for (QDirIterator it(m_baseDir, QDir::Files, QDirIterator::Subdirectories); it.hasNext();) {
            if (++visited > MaxFiles || (visited % 256 == 0 && m_stop && m_stop())) {
                m_stopped = visited <= MaxFiles;
                break;
            }
            it.next();
            m_paths[it.fileName().toLower()].append(it.filePath());
        }
    }
    if (m_stopped) return {};
    const auto found = m_paths.constFind(fileName.toLower());
    return found != m_paths.constEnd() && found->size() == 1 ? found->first() : QString{};
}

QString localMediaPath(const QString& pathurl, const QString& baseDir, MediaNameIndex* index) {
    if (pathurl.trimmed().isEmpty()) return {};
    QString path = pathurl.trimmed();
    if (path.startsWith(u"file:", Qt::CaseInsensitive)) {
        path = QUrl(path).toLocalFile();
    } else if (QFileInfo(path).isRelative()) {
        path = QDir(baseDir).filePath(path);
    }
    if (!path.isEmpty() && QFileInfo(path).isFile()) return QFileInfo(path).absoluteFilePath();
    // A path from the editor's machine: take the one file of that name below the XML.
    // A Windows path keeps its backslashes on other systems, so split on both.
    QString name = path.isEmpty() ? pathurl : path;
    name = name.mid(std::max(name.lastIndexOf(u'/'), name.lastIndexOf(u'\\')) + 1);
    if (name.isEmpty()) return {};
    if (index) return index->unique(name);
    MediaNameIndex own(baseDir);
    return own.unique(name);
}

ArchiveResult writeImportArchive(const QString& xmlPath, const QString& zipPath, const std::function<bool(int, int)>& progress) {
    ArchiveResult result;
    QFile xmlFile(xmlPath);
    if (!xmlFile.open(QIODevice::ReadOnly)) {
        result.error = QStringLiteral("Cannot read %1: %2").arg(xmlPath, xmlFile.errorString());
        return result;
    }
    if (xmlFile.size() > MaxSequenceXmlBytes) {
        result.error = QStringLiteral("The XML is over 8 MiB, which is more than the server reads.");
        return result;
    }
    QString xml = QString::fromUtf8(xmlFile.readAll());
    xmlFile.close();
    if (!xml.contains(u"<xmeml")) {
        result.error = QStringLiteral("%1 is not a Final Cut Pro XML (xmeml) sequence. In Premiere Pro, use File > Export > Final Cut Pro XML.")
                           .arg(QFileInfo(xmlPath).fileName());
        return result;
    }
    // Every distinct pathurl, in document order, and the file it names.
    static const QRegularExpression pathurl(QStringLiteral("<pathurl>([^<]*)</pathurl>"));
    struct Media { QString entry; QString local; };
    QHash<QString, Media> byUrl;
    QStringList order;
    const QString baseDir = QFileInfo(xmlPath).absolutePath();
    QHash<QString, QString> byLocal;
    MediaNameIndex names(baseDir, [&progress] { return progress && !progress(0, 0); });
    for (auto it = pathurl.globalMatch(xml); it.hasNext();) {
        const QString url = unescapeXml(it.next().captured(1));
        if (byUrl.contains(url)) continue;
        const QString local = localMediaPath(url, baseDir, &names);
        if (names.stopped()) {
            result.error = QStringLiteral("Cancelled.");
            return result;
        }
        if (local.isEmpty()) {
            byUrl.insert(url, {});
            result.missing.append(url);
            continue;
        }
        if (!byLocal.contains(local)) {
            byLocal.insert(local, QStringLiteral("media/%1-%2").arg(byLocal.size() + 1).arg(entryName(QFileInfo(local).fileName())));
            order.append(local);
        }
        byUrl.insert(url, {byLocal.value(local), local});
    }
    // The server matches each file by the path in the XML, so the XML names the entries.
    QString rewritten;
    qsizetype last = 0;
    for (auto it = pathurl.globalMatch(xml); it.hasNext();) {
        const auto match = it.next();
        const Media media = byUrl.value(unescapeXml(match.captured(1)));
        rewritten += xml.mid(last, match.capturedStart() - last);
        rewritten += media.entry.isEmpty() ? match.captured(0) : QStringLiteral("<pathurl>%1</pathurl>").arg(escapeXml(media.entry));
        last = match.capturedEnd();
    }
    rewritten += xml.mid(last);

    QFile out(zipPath);
    if (!out.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        result.error = QStringLiteral("Cannot write %1: %2").arg(zipPath, out.errorString());
        return result;
    }
    StreamZip zip(out);
    const int total = static_cast<int>(order.size());
    bool cancelled = false;
    int current = 0;
    // Polled for every chunk of a file, so a cancel does not wait for a large one.
    const auto stop = [&] {
        if (!cancelled && progress && !progress(current, total)) cancelled = true;
        return cancelled;
    };
    bool ok = zip.add(QFileInfo(xmlPath).fileName().isEmpty() ? QStringLiteral("sequence.xml") : entryName(QFileInfo(xmlPath).fileName()), rewritten.toUtf8());
    for (int index = 0; ok && index < total; ++index) {
        current = index;
        if (stop()) {
            ok = false;
            break;
        }
        ok = zip.addFile(byLocal.value(order[index]), order[index], stop);
    }
    ok = ok && zip.finish() && out.flush();
    out.close();
    if (!ok) {
        QFile::remove(zipPath);
        result.error = cancelled ? QStringLiteral("Cancelled.") : zip.error();
        if (result.error.isEmpty()) result.error = QStringLiteral("Cannot write the archive.");
        return result;
    }
    if (progress) progress(total, total);
    result.ok = true;
    result.mediaFiles = total;
    return result;
}

}  // namespace nt::interchange
