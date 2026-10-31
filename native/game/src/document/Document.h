#pragma once
#include "Schema.h"
#include <cstdint>
#include <deque>
namespace nodetool::game {
Json validateDocument(Json document);
Json resolvePrefabs(const Json& document, const std::string& sceneId);
class Document {
public:
    explicit Document(Json document);
    const Json& inspect() const noexcept { return document_; }
    Json transact(const Json& transaction);
    Json undo(std::uint64_t expectedRevision);
    Json redo(std::uint64_t expectedRevision);
private:
    Json document_;
    std::deque<Json> past_;
    std::deque<Json> future_;
    Json commit(Json candidate, const Json& operations, bool history);
    void checkRevision(std::uint64_t expected) const;
};
}
