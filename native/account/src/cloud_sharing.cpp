#include "nodetool/account/cloud_sharing.h"

#include "trpc_call.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cctype>
#include <regex>
#include <set>
#include <utility>

namespace nodetool::account {
namespace {

using detail::Query;
using detail::query;

bool isWorkflow(const std::string& kind) { return kind == "workflow"; }

std::string procedure(const std::string& kind, const std::string& name) {
  return (isWorkflow(kind) ? "workflows.sharing." : "documentSharing.") + name;
}

nlohmann::json target(const std::string& kind, const std::string& id) {
  if (isWorkflow(kind)) {
    return {{"id", id}};
  }
  return {{"type", kind}, {"id", id}};
}

std::string text(const nlohmann::json& object, const char* name) {
  if (object.is_object() && object.contains(name) && object[name].is_string()) {
    return object[name].get<std::string>();
  }
  return {};
}

bool flag(const nlohmann::json& object, const char* name) {
  return object.is_object() && object.contains(name) && object[name].is_boolean() && object[name].get<bool>();
}

ShareOptions optionsOf(const nlohmann::json& options) {
  return {flag(options, "allow_history"), flag(options, "allow_download"), flag(options, "allow_duplicate")};
}

ShareLink linkOf(const nlohmann::json& share) {
  ShareLink link;
  link.id = text(share, "id");
  link.token = text(share, "token");
  link.role = text(share, "role");
  link.disabled = !text(share, "disabled_at").empty() || !text(share, "revoked_at").empty();
  if (share.contains("options")) {
    link.options = optionsOf(share["options"]);
  }
  return link;
}

ShareChange changeFrom(const Query& q, bool returnsLink) {
  ShareChange out;
  out.status = q.status;
  out.reason = q.reason;
  if (q.status == CloudListStatus::Ok && returnsLink) {
    out.link = linkOf(q.data);
    if (out.link.id.empty()) {
      out.status = CloudListStatus::Refused;
      out.reason = "INVALID_RESPONSE";
    }
  }
  return out;
}

ShareChange refusedKind() {
  ShareChange out;
  out.status = CloudListStatus::Refused;
  out.reason = "UNKNOWN_KIND";
  return out;
}

bool knownKind(const std::string& kind) {
  static const std::set<std::string> kinds{"workflow",    "timeline", "storyboard", "script",
                                           "application", "sketch",   "jsscript"};
  return kinds.count(kind) > 0;
}

} // namespace

SharingState readSharing(CloudClient& client, const std::string& kind, const std::string& id) {
  SharingState out;
  if (!knownKind(kind)) {
    out.status = CloudListStatus::Refused;
    out.reason = "UNKNOWN_KIND";
    return out;
  }
  const Query q = query(client, procedure(kind, "get"), target(kind, id));
  out.status = q.status;
  out.reason = q.reason;
  if (q.status != CloudListStatus::Ok) {
    return out;
  }
  if (!q.data.is_object() || !q.data.contains("shares") || !q.data["shares"].is_array()) {
    out.status = CloudListStatus::Refused;
    out.reason = "INVALID_RESPONSE";
    return out;
  }
  for (const nlohmann::json& share : q.data["shares"]) {
    ShareLink link = linkOf(share);
    if (!link.id.empty()) {
      out.links.push_back(std::move(link));
    }
  }
  std::stable_sort(out.links.begin(), out.links.end(),
                   [](const ShareLink& a, const ShareLink& b) { return !a.disabled && b.disabled; });
  if (q.data.contains("people") && q.data["people"].is_array()) {
    for (const nlohmann::json& entry : q.data["people"]) {
      SharePerson person;
      person.userId = text(entry, "user_id");
      person.name = text(entry, "display_name");
      person.email = text(entry, "email");
      if (entry.is_object() && entry.contains("access") && entry["access"].is_object()) {
        person.role = text(entry["access"], "role");
        if (entry["access"].contains("options")) {
          person.options = optionsOf(entry["access"]["options"]);
        }
      }
      if (!person.userId.empty()) {
        out.people.push_back(std::move(person));
      }
    }
  }
  return out;
}

ShareChange createLink(CloudClient& client, const std::string& kind, const std::string& id, const std::string& role) {
  if (!knownKind(kind)) {
    return refusedKind();
  }
  nlohmann::json input = target(kind, id);
  input["role"] = role;
  return changeFrom(query(client, procedure(kind, "createLink"), input, true), true);
}

ShareChange disableLink(CloudClient& client, const std::string& kind, const std::string& id,
                        const std::string& shareId) {
  if (!knownKind(kind)) {
    return refusedKind();
  }
  nlohmann::json input = target(kind, id);
  input["share_id"] = shareId;
  return changeFrom(query(client, procedure(kind, "revokeLink"), input, true), false);
}

ShareChange setLinkOptions(CloudClient& client, const std::string& kind, const std::string& id,
                           const std::string& shareId, const ShareOptions& options) {
  if (!knownKind(kind)) {
    return refusedKind();
  }
  nlohmann::json input = target(kind, id);
  input["share_id"] = shareId;
  input["options"] = {{"allow_history", options.history},
                      {"allow_download", options.download},
                      {"allow_duplicate", options.duplicate}};
  return changeFrom(query(client, procedure(kind, "setLinkOptions"), input, true), true);
}

ShareChange setPersonRole(CloudClient& client, const std::string& kind, const std::string& id,
                          const std::string& userId, const std::string& role) {
  if (!knownKind(kind)) {
    return refusedKind();
  }
  nlohmann::json input = target(kind, id);
  input["user_id"] = userId;
  input["role"] = role;
  return changeFrom(query(client, procedure(kind, "setRole"), input, true), false);
}

ShareChange removePerson(CloudClient& client, const std::string& kind, const std::string& id,
                         const std::string& userId) {
  if (!knownKind(kind)) {
    return refusedKind();
  }
  nlohmann::json input = target(kind, id);
  input["user_id"] = userId;
  return changeFrom(query(client, procedure(kind, "removeCollaborator"), input, true), false);
}

const ShareLink* enabledLink(const SharingState& state, const std::string& role) {
  for (const ShareLink& link : state.links) {
    if (!link.disabled && link.role == role) {
      return &link;
    }
  }
  return nullptr;
}

std::string shareUrl(const std::string& origin, const std::string& kind, const std::string& token,
                     const std::string& role) {
  // The web app serves these routes (useWorkflowSharing.ts, useDocumentSharing.ts).
  if (!isWorkflow(kind)) {
    return origin + "/share/document/" + token;
  }
  return origin + (role == "public" ? "/view/" : "/share/") + token;
}

std::string linkStatement(const std::string& role, const ShareOptions& options) {
  if (role == "editor") {
    return "Anyone signed in who opens this link can view and edit the document. Editors can also read its history, "
           "download its files and make their own copy. Downloaded files and copies cannot be taken back.";
  }
  if (role == "public") {
    return "Anyone with this link can view the document without signing in.";
  }
  std::string out = "Anyone signed in who opens this link can view the current version of the document.";
  std::vector<std::string> extra;
  if (options.history) {
    extra.emplace_back("read its history");
  }
  if (options.download) {
    extra.emplace_back("download its files");
  }
  if (options.duplicate) {
    extra.emplace_back("make their own copy");
  }
  if (extra.empty()) {
    return out + " They cannot read its history, download its files or make a copy.";
  }
  out += " They can also ";
  for (size_t i = 0; i < extra.size(); ++i) {
    if (i > 0) {
      out += i + 1 == extra.size() ? " and " : ", ";
    }
    out += extra[i];
  }
  out += ".";
  if (options.download || options.duplicate) {
    out += " Downloaded files and copies cannot be taken back.";
  }
  return out;
}

std::vector<LinkedDocument> linkedDocuments(const std::string& kind, const std::string& documentJson) {
  std::vector<LinkedDocument> out;
  if (kind != "timeline") {
    return out;
  }
  const nlohmann::json document = nlohmann::json::parse(documentJson, nullptr, false);
  if (!document.is_object()) {
    return out;
  }
  std::set<std::pair<std::string, std::string>> seen;
  const auto add = [&](const char* linkedKind, const std::string& id) {
    if (!id.empty() && seen.emplace(linkedKind, id).second) {
      out.push_back({linkedKind, id});
    }
  };
  if (document.contains("clips") && document["clips"].is_array()) {
    for (const nlohmann::json& clip : document["clips"]) {
      add("script", text(clip, "scriptId"));
      add("storyboard", text(clip, "storyboardBoardId"));
    }
  }
  if (document.contains("storyboardMaterializations") && document["storyboardMaterializations"].is_array()) {
    for (const nlohmann::json& entry : document["storyboardMaterializations"]) {
      add("storyboard", text(entry, "boardId"));
    }
  }
  return out;
}

namespace {

struct SecretShape {
  std::regex pattern;
  const char* looksLike;
};

const std::vector<SecretShape>& secretShapes() {
  static const std::vector<SecretShape> shapes = [] {
    const auto icase = std::regex::ECMAScript | std::regex::icase;
    std::vector<SecretShape> list;
    list.push_back({std::regex(R"(sk-ant-[A-Za-z0-9_-]{20,})"), "an Anthropic key"});
    list.push_back({std::regex(R"(sk-(proj-)?[A-Za-z0-9_-]{20,})"), "an OpenAI key"});
    list.push_back({std::regex(R"(AKIA[0-9A-Z]{16})"), "an AWS access key"});
    list.push_back({std::regex(R"(gh[pousr]_[A-Za-z0-9]{36,})"), "a GitHub token"});
    list.push_back({std::regex(R"(xox[abprs]-[A-Za-z0-9-]{10,})"), "a Slack token"});
    list.push_back({std::regex(R"(AIza[0-9A-Za-z_-]{35})"), "a Google API key"});
    list.push_back({std::regex(R"(hf_[A-Za-z0-9]{30,})"), "a Hugging Face token"});
    list.push_back({std::regex(R"(r8_[A-Za-z0-9]{30,})"), "a Replicate token"});
    list.push_back({std::regex(R"(-----BEGIN [A-Z ]*PRIVATE KEY-----)"), "a private key"});
    list.push_back({std::regex(R"(Bearer [A-Za-z0-9._~+/=-]{20,})", icase), "a bearer token"});
    return list;
  }();
  return shapes;
}

bool secretName(const std::string& name) {
  std::string lower;
  for (const char c : name) {
    lower.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
  }
  for (const char* word : {"api_key", "apikey", "api-key", "secret", "password", "passwd", "token", "access_key",
                           "private_key"}) {
    if (lower.find(word) != std::string::npos) {
      return true;
    }
  }
  return false;
}

// A long value without spaces, as keys are.
bool keyLike(const std::string& value) {
  return value.size() >= 16 && value.find(' ') == std::string::npos && value.find('\n') == std::string::npos;
}

std::string pathPart(const std::string& path, const std::string& key) { return path.empty() ? key : path + "." + key; }

void scan(const nlohmann::json& value, const std::string& name, const std::string& place,
          std::vector<SecretFinding>& found, std::set<std::string>& places) {
  if (value.is_string()) {
    const std::string& s = value.get_ref<const std::string&>();
    for (const SecretShape& shape : secretShapes()) {
      if (std::regex_search(s, shape.pattern)) {
        if (places.insert(place).second) {
          found.push_back({place, shape.looksLike});
        }
        return;
      }
    }
    if (secretName(name) && keyLike(s) && places.insert(place).second) {
      found.push_back({place, "a key or password"});
    }
    return;
  }
  if (value.is_object()) {
    for (auto it = value.begin(); it != value.end(); ++it) {
      scan(it.value(), it.key(), pathPart(place, it.key()), found, places);
    }
  } else if (value.is_array()) {
    for (size_t i = 0; i < value.size(); ++i) {
      scan(value[i], name, place + "[" + std::to_string(i) + "]", found, places);
    }
  }
}

} // namespace

std::vector<SecretFinding> findSecretLike(const std::string& kind, const std::string& documentJson) {
  std::vector<SecretFinding> found;
  std::set<std::string> places;
  nlohmann::json document = nlohmann::json::parse(documentJson, nullptr, false);
  if (document.is_discarded()) {
    return found;
  }
  if (isWorkflow(kind)) {
    const nlohmann::json& graph = document.is_object() && document.contains("graph") ? document["graph"] : document;
    if (graph.is_object() && graph.contains("nodes") && graph["nodes"].is_array()) {
      for (const nlohmann::json& node : graph["nodes"]) {
        if (!node.is_object() || !node.contains("data") || !node["data"].is_object()) {
          continue;
        }
        const std::string type = text(node, "type");
        const std::string label = "node " + text(node, "id") + (type.empty() ? "" : " (" + type + ")");
        for (auto it = node["data"].begin(); it != node["data"].end(); ++it) {
          scan(it.value(), it.key(), label + ", property " + it.key(), found, places);
        }
      }
      return found;
    }
  }
  scan(document, {}, {}, found, places);
  return found;
}

} // namespace nodetool::account
