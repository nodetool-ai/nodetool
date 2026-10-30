#include "Dispatcher.h"
#include "core/Session.h"
#include <deque>
#include <map>
namespace nodetool::game {
Json failure(const std::string &requestId, const std::string &code,
             const std::string &message, const std::string &path) {
  return Json{
      {"protocolVersion", 1},
      {"requestId", requestId},
      {"status", "error"},
      {"error", {{"code", code}, {"message", message}, {"path", path}}}};
}
void compileScripts(const Json &document) {
  nodetool::game::ScriptHost scripts;
  for (const auto &source : document.at("scripts")) {
    scripts.validateSource(source.at("source"), source.at("id"));
  }
}
class Dispatcher::Impl {
  std::map<std::string, Document> sessions_;
  std::map<std::string, std::unique_ptr<nodetool::game::Session>> games_;
  std::map<std::string, std::pair<Json, Json>> cache_;
  std::deque<std::string> cacheOrder_;
  std::size_t cacheBytes_ = 0;

public:
  Json dispatch(const Json &request) {
    const auto requestId = request.value("requestId", std::string{});
    if (requestId.empty() || requestId.size() > 128 ||
        request.value("protocolVersion", 0) != 1) {
      throw Error("protocol_error",
                  "Expected protocolVersion 1 and bounded requestId");
    }
    const auto cached = cache_.find(requestId);
    if (cached != cache_.end()) {
      if (cached->second.first != request) {
        throw Error("conflict", "Request id reused with different payload");
      }
      return cached->second.second;
    }
    Json result;
    const auto operation = request.at("operation").get<std::string>();
    if (operation == "hello") {
      result = {{"engine", "native-cpp-1"},
                {"build",std::string(nodetool::game::Session::buildIdentity())},
                {"schemaVersion", 4},
                {"schemaVersions", {4, 5}},
                {"dimensions", {"3d", "2d"}},
                {"protocolVersion", 1},
                {"snapshotRestoreScope", "same-session"},
                {"maxFrameBytes", MaxRequestBytes},
                {"capabilities",
                 {"validate", "open", "inspect", "transaction", "undo", "redo",
                  "close", "start", "step", "snapshot", "restore",
                  "frame", "reload"}}};
    } else if (operation == "validate") {
      auto document = nodetool::game::validateDocument(request.at("document"));
      compileScripts(document);
      result = {{"document", document}};
    } else {
      const auto sessionId = request.at("sessionId").get<std::string>();
      if (sessionId.empty() || sessionId.size() > 128) {
        throw Error("validation_error", "Invalid session id");
      }
      if (operation == "open") {
        if (sessions_.contains(sessionId)) {
          throw Error("conflict", "Session already exists");
        }
        if (sessions_.size() >= 32) {
          throw Error("resource_limit", "Session limit reached");
        }
        auto normalized =
            nodetool::game::validateDocument(request.at("document"));
        compileScripts(normalized);
        auto [session, inserted] =
            sessions_.emplace(sessionId, Document(normalized));
        (void)inserted;
        result = {{"document", session->second.inspect()},
                  {"revision", session->second.inspect().at("revision")}};
      } else {
        auto session = sessions_.find(sessionId);
        if (session == sessions_.end()) {
          throw Error("not_found", "Session does not exist");
        }
        try {
          if (operation == "start") {
            games_[sessionId] = std::make_unique<nodetool::game::Session>(
                session->second.inspect(), request.value("seed", 1U));
            result = games_.at(sessionId)->frame();
          } else if (operation == "step" || operation == "snapshot" ||
                     operation == "restore" || operation == "frame" ||
                     operation == "reload") {
            auto game = games_.find(sessionId);
            if (game == games_.end()) {
              throw Error("unavailable_capability",
                          "Start simulation before gameplay operations");
            }
            if (operation == "step") {
              result =
                  game->second->step(request.value("input", Json::object()));
            } else if (operation == "snapshot") {
              result = game->second->snapshot();
            } else if (operation == "restore") {
              game->second->restore(request.at("snapshot"));
              result = game->second->frame();
            } else if (operation == "reload") {
              Document candidate = session->second;
              if (request.contains("document")) {
                candidate.transact(
                    {{"requestId", requestId},
                     {"expectedRevision",
                      session->second.inspect().at("revision")},
                     {"operations",
                      Json::array({{{"kind", "replaceDocument"},
                                    {"document", request.at("document")}}})}});
              }
              game->second->reload(candidate.inspect());
              session->second = std::move(candidate);
              result = game->second->frame();
            } else {
              result = game->second->frame();
            }
          } else if (operation == "inspect") {
            result = {{"document", session->second.inspect()},
                      {"revision", session->second.inspect().at("revision")}};
          } else if (operation == "transaction") {
            Document candidate = session->second;
            result = candidate.transact(
                {{"requestId", requestId},
                 {"expectedRevision", request.at("expectedRevision")},
                 {"operations", request.at("operations")}});
            compileScripts(candidate.inspect());
            nodetool::game::checkCancellation();
            if (games_.contains(sessionId)) {
              games_.at(sessionId)->reload(candidate.inspect());
            }
            session->second = std::move(candidate);
            result["sessionRestarted"] = games_.contains(sessionId);
          } else if (operation == "undo") {
            Document candidate = session->second;
            result = candidate.undo(
                request.at("expectedRevision").get<std::uint64_t>());
            compileScripts(candidate.inspect());
            nodetool::game::checkCancellation();
            if (games_.contains(sessionId)) {
              games_.at(sessionId)->reload(candidate.inspect());
            }
            session->second = std::move(candidate);
          } else if (operation == "redo") {
            Document candidate = session->second;
            result = candidate.redo(
                request.at("expectedRevision").get<std::uint64_t>());
            compileScripts(candidate.inspect());
            nodetool::game::checkCancellation();
            if (games_.contains(sessionId)) {
              games_.at(sessionId)->reload(candidate.inspect());
            }
            session->second = std::move(candidate);
          } else if (operation == "close") {
            games_.erase(sessionId);
            sessions_.erase(session);
            result = {{"closed", true}};
          } else {
            throw Error("unavailable_capability",
                        "Unsupported operation: " + operation);
          }
        } catch (const Error &error) {
          const auto game = games_.find(sessionId);
          const bool evicted = game != games_.end() && game->second->irrecoverable();
          if (evicted) {
            games_.erase(game);
            sessions_.erase(session);
          }
          auto response =
              failure(requestId, error.code, error.what(), error.path);
          if (!error.details.empty()) {
            response["error"]["details"] = error.details;
          }
          if (error.code == "conflict" && !evicted) {
            response["error"]["currentRevision"] =
                session->second.inspect().at("revision");
          }
          remember(requestId, request, response);
          return response;
        }
      }
    }
    Json response{{"protocolVersion", 1},
                  {"requestId", requestId},
                  {"status", "ok"},
                  {"result", result}};
    remember(requestId, request, response);
    return response;
  }
  void remember(const std::string &id, const Json &request,
                const Json &response) {
    cacheBytes_ += request.dump().size() + response.dump().size();
    cache_[id] = {request, response};
    cacheOrder_.push_back(id);
    while (cacheOrder_.size() > 64 ||
           (cacheBytes_ > 16 * 1024 * 1024 && cacheOrder_.size() > 1)) {
      const auto &oldest = cache_.at(cacheOrder_.front());
      cacheBytes_ -= oldest.first.dump().size() + oldest.second.dump().size();
      cache_.erase(cacheOrder_.front());
      cacheOrder_.pop_front();
    }
  }
};

Dispatcher::Dispatcher() : impl_(std::make_unique<Impl>()) {}
Dispatcher::~Dispatcher() = default;
Json Dispatcher::dispatch(const Json &request) { return impl_->dispatch(request); }

}
