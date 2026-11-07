#pragma once
#include <QByteArray>
#include <QByteArrayView>
#include <QIODevice>
#include <vector>

namespace nt::exporting {
class PngZip {
public:
    static constexpr quint64 MaxEntries = 65535;
    explicit PngZip(QIODevice& output);
    void add(QByteArrayView name, QByteArrayView bytes);
    void finish();
private:
    struct Entry {
        QByteArray name;
        quint32 crc;
        quint32 size;
        quint32 offset;
    };
    void write(QByteArrayView bytes);
    QIODevice& m_output;
    std::vector<Entry> m_entries;
    quint64 m_centralSize = 0;
    bool m_finished = false;
};
}
