#include "MsgPack.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QStringDecoder>
#include <bit>
#include <cmath>
namespace nodetool::node_editor {
namespace {
void number(QByteArray &b, quint64 n, int size) {
  for (int i = size - 1; i >= 0; --i) {
    b.append(char(n >> (8 * i)));
  }
}
void pack(QByteArray &b, const QJsonValue &v) {
  if (v.isNull() || v.isUndefined()) {
    b.append(char(0xc0));
  } else if (v.isBool()) {
    b.append(char(v.toBool() ? 0xc3 : 0xc2));
  } else if (v.isDouble()) {
    b.append(char(0xcb));
    number(b, std::bit_cast<quint64>(v.toDouble()), 8);
  } else if (v.isString()) {
    auto s = v.toString().toUtf8();
    b.append(char(0xdb));
    number(b, s.size(), 4);
    b.append(s);
  } else if (v.isArray()) {
    auto a = v.toArray();
    b.append(char(0xdd));
    number(b, a.size(), 4);
    for (const auto &x : a) {
      pack(b, x);
    }
  } else {
    auto o = v.toObject();
    b.append(char(0xdf));
    number(b, o.size(), 4);
    for (auto i = o.begin(); i != o.end(); ++i) {
      pack(b, i.key());
      pack(b, i.value());
    }
  }
}
class Reader {
public:
  const QByteArray &b;
  qsizetype p = 0;
  bool ok = true;
  quint64 take(int n) {
    if (n > b.size() - p) {
      ok = false;
      return 0;
    }
    quint64 v = 0;
    while (n-- > 0) {
      v = (v << 8) | quint8(b.at(p++));
    }
    return v;
  }
  QJsonValue read(int depth = 0) {
    if (depth > 64 || p >= b.size()) {
      ok = false;
      return {};
    }
    auto c = take(1);
    quint64 count = 0;
    enum { Scalar, String, Array, Map } kind = Scalar;
    if (c < 128) {
      return double(c);
    }
    if (c >= 224) {
      return double(qint8(c));
    }
    if ((c & 0xe0) == 0xa0) {
      kind = String;
      count = c & 31;
    } else if ((c & 0xf0) == 0x90) {
      kind = Array;
      count = c & 15;
    } else if ((c & 0xf0) == 0x80) {
      kind = Map;
      count = c & 15;
    } else {
      switch (c) {
      case 0xc0:
        return QJsonValue(QJsonValue::Null);
      case 0xc2:
        return false;
      case 0xc3:
        return true;
      case 0xcc:
        return double(take(1));
      case 0xcd:
        return double(take(2));
      case 0xce:
        return double(take(4));
      case 0xcf:
        return double(take(8));
      case 0xd0:
        return double(qint8(take(1)));
      case 0xd1:
        return double(qint16(take(2)));
      case 0xd2:
        return double(qint32(take(4)));
      case 0xd3:
        return double(qint64(take(8)));
      case 0xca: {
        const auto value = double(std::bit_cast<float>(quint32(take(4))));
        if (!std::isfinite(value)) {
          ok = false;
        }
        return value;
      }
      case 0xcb: {
        const auto value = std::bit_cast<double>(take(8));
        if (!std::isfinite(value)) {
          ok = false;
        }
        return value;
      }
      case 0xd9:
        kind = String;
        count = take(1);
        break;
      case 0xda:
        kind = String;
        count = take(2);
        break;
      case 0xdb:
        kind = String;
        count = take(4);
        break;
      case 0xdc:
        kind = Array;
        count = take(2);
        break;
      case 0xdd:
        kind = Array;
        count = take(4);
        break;
      case 0xde:
        kind = Map;
        count = take(2);
        break;
      case 0xdf:
        kind = Map;
        count = take(4);
        break;
      default:
        ok = false;
        return {};
      }
    }
    if (!ok || count > quint64(b.size() - p)) {
      ok = false;
      return {};
    }
    if (kind == String) {
      QStringDecoder decoder(QStringDecoder::Utf8);
      QString s = decoder(QByteArrayView(b.constData() + p, qsizetype(count)));
      if (decoder.hasError()) {
        ok = false;
        return {};
      }
      p += qsizetype(count);
      return s;
    }
    if (kind == Array) {
      QJsonArray a;
      for (quint64 i = 0; i < count && ok; ++i) {
        a.append(read(depth + 1));
      }
      return a;
    }
    QJsonObject o;
    for (quint64 i = 0; i < count && ok; ++i) {
      auto k = read(depth + 1);
      if (!k.isString()) {
        ok = false;
        break;
      }
      if (o.contains(k.toString())) {
        ok = false;
        break;
      }
      o.insert(k.toString(), read(depth + 1));
    }
    return o;
  }
};
} // namespace
QByteArray encodeMsgPack(const QJsonValue &v) {
  QByteArray b;
  pack(b, v);
  return b;
}
std::optional<QJsonValue> decodeMsgPack(const QByteArray &b) {
  if (b.size() > 32 * 1024 * 1024) {
    return {};
  }
  Reader r{b};
  auto v = r.read();
  if (!r.ok || r.p != b.size()) {
    return {};
  }
  return v;
}
} // namespace nodetool::node_editor
