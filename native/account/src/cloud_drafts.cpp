#include "nodetool/account/cloud_drafts.h"

#include "nodetool/account/sign_in.h"

#include <nlohmann/json.hpp>

#include <algorithm>

#include <utility>

namespace nodetool::account {
namespace {

nlohmann::json keyJson(const CloudDocumentKey& key) {
  return {{"server_key", key.serverKey},
          {"account_id", key.accountId},
          {"kind", key.kind},
          {"document_id", key.documentId}};
}

nlohmann::json baseJson(const CloudBase& base) {
  return {{"updated_at", base.updatedAt}, {"content_hash", base.contentHash}};
}

} // namespace

LocalServerDraftStore::LocalServerDraftStore(HttpTransport& transport, std::string localOrigin,
                                             std::vector<std::pair<std::string, std::string>> headers)
    : transport_(transport), origin_(std::move(localOrigin)), headers_(std::move(headers)) {}

std::optional<std::string> LocalServerDraftStore::call(HttpRequest request) {
  for (const auto& header : headers_) {
    request.headers.push_back(header);
  }
  const HttpResponse response = transport_.send(request);
  if (response.status != 200) {
    return std::nullopt;
  }
  const nlohmann::json body = nlohmann::json::parse(response.body, nullptr, false);
  if (!body.is_object() || !body.contains("result")) {
    return std::nullopt;
  }
  nlohmann::json data = body["result"].value("data", nlohmann::json());
  if (data.is_object() && data.contains("json")) {
    data = data["json"];
  }
  if (!data.is_object()) {
    return std::nullopt;
  }
  return data.dump();
}

std::optional<std::string> LocalServerDraftStore::mutate(const std::string& procedure, const std::string& input) {
  HttpRequest request;
  request.method = "POST";
  request.url = origin_ + "/trpc/" + procedure;
  request.headers.emplace_back("Content-Type", "application/json");
  request.body = input;
  return call(std::move(request));
}

std::optional<std::string> LocalServerDraftStore::query(const std::string& procedure, const std::string& input) {
  HttpRequest request;
  request.url = origin_ + "/trpc/" + procedure + "?input=" + urlEncode(input);
  return call(std::move(request));
}

std::optional<std::string> LocalServerDraftStore::put(const CloudDocumentKey& key, const CloudBase& base,
                                                      const std::string& draft) {
  nlohmann::json input = keyJson(key);
  input["base"] = baseJson(base);
  input["draft"] = draft;
  const auto data = mutate("cloudLocal.drafts.put", input.dump());
  if (!data) {
    return std::nullopt;
  }
  const std::string id = nlohmann::json::parse(*data, nullptr, false).value("draft_id", std::string());
  if (id.empty()) {
    return std::nullopt;
  }
  return id;
}

std::optional<AcceptOutcome> LocalServerDraftStore::accept(const CloudDocumentKey& key, const std::string& draftId,
                                                           const CloudBase& sentBase, const CloudBase& base,
                                                           const std::string& role,
                                                           const CloudDocumentOptions& options) {
  nlohmann::json input = keyJson(key);
  input["draft_id"] = draftId;
  input["sent_base"] = baseJson(sentBase);
  input["base"] = baseJson(base);
  input["role"] = role;
  input["options"] = {{"allow_history", options.allowHistory},
                      {"allow_download", options.allowDownload},
                      {"allow_duplicate", options.allowDuplicate}};
  const auto data = mutate("cloudLocal.drafts.accept", input.dump());
  if (!data) {
    return std::nullopt;
  }
  const std::string outcome = nlohmann::json::parse(*data, nullptr, false).value("outcome", std::string());
  if (outcome == "deleted") {
    return AcceptOutcome::Deleted;
  }
  if (outcome == "rebased") {
    return AcceptOutcome::Rebased;
  }
  if (outcome == "stale") {
    return AcceptOutcome::Stale;
  }
  if (outcome == "no_draft") {
    return AcceptOutcome::NoDraft;
  }
  return std::nullopt;
}

bool LocalServerDraftStore::markUnsent(const CloudDocumentKey& key, const std::string& draftId,
                                       const std::string& reason) {
  nlohmann::json input = keyJson(key);
  input["draft_id"] = draftId;
  input["reason"] = reason;
  return mutate("cloudLocal.drafts.markUnsent", input.dump()).has_value();
}

namespace {

std::optional<StoredDraft> draftFrom(const nlohmann::json& row, const std::string& serverKey,
                                     const std::string& accountId) {
  if (!row.is_object() || !row.contains("base") || !row["base"].is_object()) {
    return std::nullopt;
  }
  StoredDraft out;
  out.key = {serverKey, accountId, row.value("kind", std::string()), row.value("document_id", std::string())};
  out.draftId = row.value("draft_id", std::string());
  out.base = {row["base"].value("updated_at", std::string()), row["base"].value("content_hash", std::string())};
  out.draft = row.value("draft", std::string());
  out.state = row.value("state", std::string()) == "unsent" ? DraftState::Unsent : DraftState::Waiting;
  if (row.contains("refusal_reason") && row["refusal_reason"].is_string()) {
    out.refusal = row["refusal_reason"].get<std::string>();
  }
  if (out.key.kind.empty() || out.key.documentId.empty() || out.draftId.empty()) {
    return std::nullopt;
  }
  return out;
}

} // namespace

DraftLoad LocalServerDraftStore::load(const CloudDocumentKey& key) {
  DraftLoad out;
  const auto data = query("cloudLocal.drafts.get", keyJson(key).dump());
  if (!data) {
    return out;
  }
  const nlohmann::json parsed = nlohmann::json::parse(*data, nullptr, false);
  if (!parsed.is_object() || !parsed.contains("draft")) {
    return out;
  }
  out.ok = true;
  if (!parsed["draft"].is_null()) {
    out.draft = draftFrom(parsed["draft"], key.serverKey, key.accountId);
    out.ok = out.draft.has_value();
  }
  return out;
}

DraftList LocalServerDraftStore::list(const std::string& serverKey, const std::string& accountId) {
  DraftList out;
  const nlohmann::json input = {{"server_key", serverKey}, {"account_id", accountId}};
  const auto data = query("cloudLocal.drafts.list", input.dump());
  if (!data) {
    return out;
  }
  const nlohmann::json parsed = nlohmann::json::parse(*data, nullptr, false);
  if (!parsed.is_object() || !parsed.contains("drafts") || !parsed["drafts"].is_array()) {
    return out;
  }
  for (const auto& row : parsed["drafts"]) {
    auto draft = draftFrom(row, serverKey, accountId);
    if (!draft) {
      return out;
    }
    out.drafts.push_back(std::move(*draft));
  }
  out.ok = true;
  return out;
}

CloudDocumentSaver::CloudDocumentSaver(DraftStore& store, CloudSaver& cloud, CloudDocumentKey key, CloudBase base)
    : store_(store), cloud_(cloud), key_(std::move(key)), base_(std::move(base)) {}

CloudDocumentSaver::CloudDocumentSaver(DraftStore& store, CloudSaver& cloud, StoredDraft resumed)
    : store_(store), cloud_(cloud), key_(resumed.key), base_(resumed.base) {
  storedId_ = resumed.draftId;
  storedDraft_ = std::move(resumed.draft);
  if (resumed.state == DraftState::Waiting) {
    sendPending_ = true;
    state_.status = DocumentStatus::ChangesWaiting;
  } else {
    state_.status = DocumentStatus::Unsent;
    state_.refusal = std::move(resumed.refusal);
  }
}

void CloudDocumentSaver::edit(std::string document, int64_t nowMs) {
  const std::lock_guard lock(mutex_);
  if (!unstored_) {
    firstUnstoredMs_ = nowMs;
  }
  unstored_ = std::move(document);
  lastEditMs_ = nowMs;
  ++editCount_;
  state_.unstoredEdits = true;
  if (state_.status != DocumentStatus::Sending) {
    publishLocked(DocumentStatus::ChangesWaiting);
  }
  state_.refusal.clear();
}

void CloudDocumentSaver::publishLocked(DocumentStatus status) {
  // A failing local write is never hidden behind a cloud status (FR11).
  state_.status = writeFailing_ || recordFailing_ ? DocumentStatus::NotSaving : status;
}

void CloudDocumentSaver::persist(int64_t nowMs) {
  std::optional<std::string> toWrite;
  CloudBase base;
  uint64_t editsAtTake = 0;
  {
    const std::lock_guard lock(mutex_);
    const bool due = nowMs - lastEditMs_ >= kDraftIdleMs || nowMs - firstUnstoredMs_ >= kDraftForceMs;
    if (!unstored_ || !due || nowMs < nextWriteMs_) {
      return;
    }
    toWrite = *unstored_;
    base = base_;
    editsAtTake = editCount_;
  }
  const std::optional<std::string> id = store_.put(key_, base, *toWrite);
  const std::lock_guard lock(mutex_);
  if (!id) {
    // Step 4. The edits stay in memory and the write is tried again.
    writeFailing_ = true;
    publishLocked(DocumentStatus::NotSaving);
    nextWriteMs_ = nowMs + kDraftRetryMs;
    return;
  }
  writeFailing_ = false;
  storedId_ = *id;
  storedDraft_ = std::move(*toWrite);
  sendPending_ = true;
  nextSendMs_ = std::min(nextSendMs_, nowMs);
  nextWriteMs_ = 0;
  if (editCount_ == editsAtTake) {
    unstored_.reset();
    state_.unstoredEdits = false;
  } else {
    // Newer edits arrived during the write. They are due as soon as they
    // are idle, and at the latest one full delay from now.
    firstUnstoredMs_ = nowMs;
  }
  publishLocked(DocumentStatus::Sending);
}

bool CloudDocumentSaver::recordAcceptance(const Sent& sent, int64_t nowMs) {
  const SaveResult& result = sent.result;
  const std::optional<AcceptOutcome> outcome =
      store_.accept(key_, sent.draftId, sent.sentBase, result.base, result.role, result.options);
  const std::lock_guard lock(mutex_);
  if (!outcome) {
    recordFailing_ = true;
    unrecorded_ = sent;
    publishLocked(DocumentStatus::NotSaving);
    nextSendMs_ = nowMs + kDraftRetryMs;
    return false;
  }
  recordFailing_ = false;
  unrecorded_.reset();
  const bool latest = storedId_ == sent.draftId;
  if (latest) {
    storedId_.reset();
    sendPending_ = false;
  }
  publishLocked(unstored_ || !latest ? DocumentStatus::ChangesWaiting : DocumentStatus::SavedToCloud);
  return true;
}

bool CloudDocumentSaver::recordRefusal(const Sent& sent, int64_t nowMs) {
  const bool marked = store_.markUnsent(key_, sent.draftId, sent.result.reason);
  const std::lock_guard lock(mutex_);
  if (!marked) {
    recordFailing_ = true;
    unrecorded_ = sent;
    publishLocked(DocumentStatus::NotSaving);
    nextSendMs_ = nowMs + kDraftRetryMs;
    return false;
  }
  recordFailing_ = false;
  unrecorded_.reset();
  if (storedId_ != sent.draftId || unstored_) {
    // Newer edits are waiting and are sent next.
    publishLocked(DocumentStatus::ChangesWaiting);
    return true;
  }
  sendPending_ = false;
  publishLocked(DocumentStatus::Unsent);
  state_.refusal = sent.result.reason;
  return true;
}

void CloudDocumentSaver::send(int64_t nowMs) {
  Sent sent;
  std::string draft;
  bool retryRecord = false;
  {
    const std::lock_guard lock(mutex_);
    if (nowMs < nextSendMs_) {
      return;
    }
    if (unrecorded_) {
      sent = *unrecorded_;
      retryRecord = true;
    } else if (sendPending_ && storedId_) {
      sent.draftId = *storedId_;
      sent.sentBase = base_;
      draft = storedDraft_;
    } else {
      return;
    }
  }
  if (retryRecord) {
    // The server already answered this save. Only the local record is
    // retried, so the server never sees the same draft twice.
    if (sent.result.status == SaveStatus::Ok) {
      recordAcceptance(sent, nowMs);
    } else {
      recordRefusal(sent, nowMs);
    }
    return;
  }

  sent.result = cloud_.save(key_, sent.sentBase, draft);
  switch (sent.result.status) {
  case SaveStatus::Ok: {
    {
      // The server holds the new version whether or not the local record
      // commits, so the next save edits it.
      const std::lock_guard lock(mutex_);
      base_ = sent.result.base;
      state_.lastContactMs = nowMs;
    }
    recordAcceptance(sent, nowMs);
    return;
  }
  case SaveStatus::Refused: {
    {
      const std::lock_guard lock(mutex_);
      state_.lastContactMs = nowMs;
    }
    recordRefusal(sent, nowMs);
    return;
  }
  case SaveStatus::Offline: {
    const std::lock_guard lock(mutex_);
    nextSendMs_ = nowMs + kSendRetryMs;
    publishLocked(DocumentStatus::Offline);
    return;
  }
  case SaveStatus::SignedOut: {
    const std::lock_guard lock(mutex_);
    nextSendMs_ = nowMs + kSendRetryMs;
    publishLocked(DocumentStatus::SignedOut);
    return;
  }
  }
}

DocumentState CloudDocumentSaver::state() const {
  const std::lock_guard lock(mutex_);
  return state_;
}

} // namespace nodetool::account
