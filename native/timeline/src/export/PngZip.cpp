#include "export/PngZip.h"
#include <array>
#include <stdexcept>

namespace nt::exporting {
namespace {
constexpr quint64 MaxClassicSize = 0xFFFFFFFFULL;
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
quint32 crc32(QByteArrayView bytes) {
    quint32 crc = 0xFFFFFFFFU;
    for (const char byte : bytes) {
        crc = CrcTable[(crc ^ static_cast<unsigned char>(byte)) & 0xFF] ^ (crc >> 8);
    }
    return crc ^ 0xFFFFFFFFU;
}
void put16(QByteArray& bytes, quint16 value) {
    bytes.append(static_cast<char>(value & 0xFF));
    bytes.append(static_cast<char>((value >> 8) & 0xFF));
}
void put32(QByteArray& bytes, quint32 value) {
    put16(bytes, static_cast<quint16>(value & 0xFFFF));
    put16(bytes, static_cast<quint16>(value >> 16));
}
void classicLimit(bool exceeded) {
    if (exceeded) {
        throw std::runtime_error("PNG sequence exceeds classic ZIP limits (4 GiB or 65535 entries)");
    }
}
}
PngZip::PngZip(QIODevice& output) : m_output(output) {
    if (!output.isWritable() || output.isSequential() || output.pos() != 0) {
        throw std::runtime_error("PNG ZIP output must be writable and positioned at the start");
    }
}
void PngZip::write(QByteArrayView bytes) {
    if (m_output.write(bytes.data(), bytes.size()) != bytes.size()) {
        throw std::runtime_error("Cannot write PNG ZIP output");
    }
}
void PngZip::add(QByteArrayView name, QByteArrayView bytes) {
    if (m_finished) throw std::runtime_error("PNG ZIP is already finalized");
    const qint64 position = m_output.pos();
    if (position < 0) throw std::runtime_error("Cannot determine PNG ZIP output position");
    classicLimit(m_entries.size() >= MaxEntries || name.size() > 65535
        || static_cast<quint64>(bytes.size()) > MaxClassicSize
        || static_cast<quint64>(position) > MaxClassicSize);
    const quint64 centralSize = m_centralSize + 46 + name.size();
    const quint64 end = static_cast<quint64>(position) + 30 + name.size() + bytes.size();
    // Reserve the central directory and end record before writing the entry.
    classicLimit(end + centralSize + 22 > MaxClassicSize);
    Entry entry{name.toByteArray(), crc32(bytes), static_cast<quint32>(bytes.size()),
        static_cast<quint32>(position)};
    QByteArray header;
    put32(header, 0x04034B50);
    put16(header, 20); // ZIP 2.0, stored, UTF-8 names, 1980-01-01.
    put16(header, 0x0800);
    put16(header, 0);
    put16(header, 0);
    put16(header, 0x0021);
    put32(header, entry.crc);
    put32(header, entry.size);
    put32(header, entry.size);
    put16(header, static_cast<quint16>(name.size()));
    put16(header, 0);
    write(header);
    write(name);
    write(bytes);
    m_entries.push_back(std::move(entry));
    m_centralSize = centralSize;
}
void PngZip::finish() {
    if (m_finished) throw std::runtime_error("PNG ZIP is already finalized");
    const qint64 position = m_output.pos();
    if (position < 0) throw std::runtime_error("Cannot determine PNG ZIP output position");
    const auto offset = static_cast<quint64>(position);
    classicLimit(offset > MaxClassicSize || offset + m_centralSize + 22 > MaxClassicSize);
    for (const auto& entry : m_entries) {
        QByteArray header;
        put32(header, 0x02014B50);
        put16(header, 20);
        put16(header, 20);
        put16(header, 0x0800);
        put16(header, 0);
        put16(header, 0);
        put16(header, 0x0021);
        put32(header, entry.crc);
        put32(header, entry.size);
        put32(header, entry.size);
        put16(header, static_cast<quint16>(entry.name.size()));
        put16(header, 0);
        put16(header, 0);
        put16(header, 0);
        put16(header, 0);
        put32(header, 0);
        put32(header, entry.offset);
        write(header);
        write(entry.name);
    }
    QByteArray end;
    put32(end, 0x06054B50);
    put16(end, 0);
    put16(end, 0);
    put16(end, static_cast<quint16>(m_entries.size()));
    put16(end, static_cast<quint16>(m_entries.size()));
    put32(end, static_cast<quint32>(m_centralSize));
    put32(end, static_cast<quint32>(offset));
    put16(end, 0);
    write(end);
    m_finished = true;
}
}
