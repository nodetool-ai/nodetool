#pragma once

// The zip the server's Premiere import reads: a Final Cut Pro 7 XML (xmeml)
// sequence and the media files it names (packages/websocket/src/lib/
// timeline-premiere-import.ts). Premiere writes the XML alone, with `pathurl`
// values that point at the editor's disk, so the app packs the files itself.

#include <QByteArray>
#include <QString>
#include <QStringList>

#include <functional>
#include <vector>

class QIODevice;

namespace nt::interchange {

// A stored (uncompressed) zip with 32-bit sizes, which is what the server
// unzips. A file is read twice, once for its checksum and once for its bytes,
// so it never sits in memory.
class StreamZip {
public:
    static constexpr quint64 MaxEntries = 65535;
    static constexpr quint64 MaxBytes = 0xFFFFFFFFULL;
    explicit StreamZip(QIODevice& output);
    // Both return false and set `error()` when the zip cannot hold the entry or the write fails.
    bool add(const QString& name, const QByteArray& bytes);
    // `cancelled` is polled while reading; a true result stops with error "Cancelled."
    bool addFile(const QString& name, const QString& path, const std::function<bool()>& cancelled = {});
    bool finish();
    const QString& error() const { return m_error; }
private:
    struct Entry {
        QByteArray name;
        quint32 crc;
        quint32 size;
        quint32 offset;
    };
    bool write(const QByteArray& bytes);
    bool writeHeader(const QByteArray& name, quint32 crc, quint32 size);
    bool fail(const QString& message);
    QIODevice& m_output;
    std::vector<Entry> m_entries;
    quint64 m_written = 0;
    QString m_error;
    bool m_finished = false;
};

// The file a `pathurl` names, or an empty string when none exists. Handles
// `file://localhost/...` and `file:///...` URLs with percent escapes, absolute
// paths and paths relative to `baseDir`. A path from another machine that does
// not exist falls back to the one file of that name below `baseDir`.
QString localMediaPath(const QString& pathurl, const QString& baseDir);

struct ArchiveResult {
    bool ok = false;
    QString error;
    int mediaFiles = 0;
    // `pathurl` values that named no file on this disk. The server leaves those clips out.
    QStringList missing;
};

// Packs `xmlPath` and the media it names into `zipPath`. Each file goes in as
// `media/<n>-<name>` and the XML's `pathurl` values are rewritten to match, so
// the server finds every file even when two share a name. `progress(done,
// total)` runs per file and may return false to cancel.
ArchiveResult writeImportArchive(const QString& xmlPath, const QString& zipPath,
                                 const std::function<bool(int, int)>& progress = {});

// The most the server accepts as one Premiere XML.
inline constexpr qint64 MaxSequenceXmlBytes = 8 * 1024 * 1024;

}  // namespace nt::interchange
