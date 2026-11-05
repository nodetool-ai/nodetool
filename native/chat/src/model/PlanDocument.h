#pragma once
#include <QJsonObject>
#include <QJsonValue>
namespace nt::chat {
QJsonObject parsePlanDocument(const QJsonValue &value);
QString planDocumentText(const QJsonObject &plan);
}
