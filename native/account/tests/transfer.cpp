// The transfer client of the native apps (WP2.8): LocalTransferClient
// against a fake bundled server, and the rows and choices of TransferReview.
#include "nodetool/account/cloud_transfer.h"
#include "nodetool/account/origin.h"
#include "nodetool/account/storage.h"
#include "test_support.h"

#include <nlohmann/json.hpp>

#include <functional>
#include <memory>
#include <mutex>
#include <vector>

namespace {

using namespace nodetool::account;
using account_test::FakeClock;
using account_test::FakeTokenServer;
using account_test::TempDir;
using account_test::TestContext;
using nlohmann::json;

constexpr const char* kServer = "https://nt.example";
constexpr const char* kLocal = "http://127.0.0.1:7777";
constexpr const char* kProject = "0123456789abcdef0123456789abcdef";
constexpr const char* kTransfer = "fedcba9876543210fedcba9876543210";

// Thread affinity: thread-safe. `mutex_` guards the log and the handler.
class FakeTransport final : public HttpTransport {
public:
  using Handler = std::function<HttpResponse(const HttpRequest&)>;
  explicit FakeTransport(Handler handler) : handler_(std::move(handler)) {}

  HttpResponse send(const HttpRequest& request) override {
    Handler handler;
    {
      const std::lock_guard lock(mutex_);
      sent_.push_back(request);
      handler = handler_;
    }
    return handler(request);
  }

  std::vector<HttpRequest> sent() {
    const std::lock_guard lock(mutex_);
    return sent_;
  }

private:
  std::mutex mutex_;
  Handler handler_;
  std::vector<HttpRequest> sent_;
};

// Thread affinity: the test thread.
struct SignedInApp {
  TempDir data;
  MemorySecretStore keychain;
  FakeClock clock;
  FakeTokenServer server{clock};
  std::unique_ptr<AccountSession> session;

  SignedInApp() {
    AccountSessionOptions options;
    options.dataDir = data.path();
    options.serverOrigin = kServer;
    options.userId = "u1";
    options.nowMs = clock.fn();
    server.addCode("code", "u1", "Ada");
    const TokenResult r = server.exchangeCode({"code", "v", "http://127.0.0.1/callback", kServer});
    recordSignIn(keychain, options, r.tokens);
    session = std::make_unique<AccountSession>(keychain, server, options);
  }
};

HttpResponse ok(const json& data) { return {200, json{{"result", {{"data", {{"json", data}}}}}}.dump()}; }

HttpResponse refusal(int status, const std::string& apiCode) {
  return {status, json{{"error", {{"json", {{"message", apiCode}, {"data", {{"apiCode", apiCode}}}}}}}}.dump()};
}

std::string header(const HttpRequest& request, const std::string& name) {
  for (const auto& [key, value] : request.headers) {
    if (key == name) {
      return value;
    }
  }
  return {};
}

void callsTheLocalRouterForTheAccount(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([](const HttpRequest& request) {
    if (request.url.ends_with("/trpc/cloudTransfer.send.capture")) {
      return ok({{"status", "captured"},
                 {"transfer_id", kTransfer},
                 {"first_publication", true},
                 {"operations", json::array({{{"op", "create_document"},
                                              {"kind", "workflow"},
                                              {"document_id", kProject},
                                              {"captured_hash", "h"}}})},
                 {"documents", json::array({{{"kind", "workflow"},
                                             {"local_id", kProject},
                                             {"cloud_id", kProject},
                                             {"name", "Flow"}}})},
                 {"missing_files", json::array({{{"asset_id", "a1"},
                                                 {"reason", "missing_locally"},
                                                 {"documents", json::array({{{"kind", "timeline"},
                                                                             {"document_id", "t1"}}})}}})},
                 {"skipped", json::array()},
                 {"deleted_locally", json::array({{{"kind", "workflow"},
                                                  {"local_id", "d1"},
                                                  {"cloud_id", "cd1"},
                                                  {"base_hash", "base-d1"}}})}});
    }
    if (request.url.ends_with("/trpc/cloudTransfer.send.run")) {
      return ok({{"status", "committed"},
                 {"transfer_id", kTransfer},
                 {"result", {{"outcome", "committed"}, {"project_id", "cp1"}, {"documents", json::array()}}}});
    }
    return refusal(404, "NOT_FOUND");
  });
  LocalTransferClient client(transport, kLocal, {{"Authorization", "Bearer local"}}, *app.session);

  const SendCapture capture = client.captureSend(kProject, "Cut", "Laptop");
  CHECK(capture.status == TransferStatus::Ok);
  CHECK(capture.transferId == kTransfer);
  CHECK(capture.firstPublication);
  CHECK(capture.operations.size() == 1 && capture.operations[0].op == "create_document");
  CHECK(capture.documents.size() == 1 && capture.documents[0].name == "Flow");
  CHECK(capture.missingFiles.size() == 1 && capture.missingFiles[0].documents.size() == 1);
  CHECK(capture.deletedLocally.size() == 1 && capture.deletedLocally[0].baseHash == "base-d1");

  const SendRun run = client.runSend(kTransfer, {{"workflow", kProject, "stored"}}, {{"workflow", "cd1", "base-d1"}});
  CHECK(run.status == TransferStatus::Ok);
  CHECK(run.committed);
  CHECK(run.cloudProjectId == "cp1");

  const auto sent = transport.sent();
  CHECK(sent.size() == 2);
  if (sent.size() == 2) {
    const json captured = json::parse(sent[0].body);
    CHECK(sent[0].method == "POST");
    CHECK(header(sent[0], "Authorization") == "Bearer local");
    CHECK(captured["origin"] == kServer);
    CHECK(captured["account_id"] == "u1");
    CHECK(captured["project_name"] == "Cut");
    // A capture reaches no cloud, so it carries no token.
    CHECK(!captured.contains("access_token"));
    const json ran = json::parse(sent[1].body);
    CHECK(ran.value("access_token", std::string()).size() > 0);
    CHECK(ran["decisions"][0]["choice"] == "keep_local");
    CHECK(ran["decisions"][0]["cloud_hash"] == "stored");
    // A confirmed deletion names the cloud revision it deletes (V4).
    CHECK(ran["confirm_deletes"][0] == json({{"kind", "workflow"}, {"cloud_id", "cd1"}, {"cloud_hash", "base-d1"}}));
    // A run carries files, so it gets far more time than a capture.
    CHECK(sent[1].timeout > sent[0].timeout);
  }
}

void renewsTheTokenOnceWhenTheCloudRefusesIt(TestContext& t) {
  SignedInApp app;
  std::vector<std::string> tokens;
  FakeTransport transport([&](const HttpRequest& request) {
    tokens.push_back(json::parse(request.body).value("access_token", std::string()));
    if (tokens.size() == 1) {
      return refusal(412, "CLOUD_SIGNED_OUT");
    }
    return ok({{"state", "cancelled"}});
  });
  LocalTransferClient client(transport, kLocal, {}, *app.session);
  const auto cancelled = client.cancelSend(kTransfer);
  CHECK(cancelled.status == TransferStatus::Ok);
  CHECK(!cancelled.committed);
  CHECK(tokens.size() == 2);
  CHECK(tokens.size() == 2 && tokens[0] != tokens[1]);
  CHECK(app.server.refreshCalls == 1);

  // A token the cloud keeps refusing ends as signed out after one renewal.
  SignedInApp refused;
  int calls = 0;
  FakeTransport always([&](const HttpRequest&) {
    ++calls;
    return refusal(412, "CLOUD_SIGNED_OUT");
  });
  LocalTransferClient stuck(always, kLocal, {}, *refused.session);
  CHECK(stuck.resume().status == TransferStatus::SignedOut);
  CHECK(calls == 2);
}

void sortsFailures(TestContext& t) {
  SignedInApp app;
  int status = 0;
  std::string code;
  FakeTransport transport([&](const HttpRequest&) {
    if (status == 0) {
      return HttpResponse{0, ""};
    }
    return refusal(status, code);
  });
  LocalTransferClient client(transport, kLocal, {}, *app.session);

  CHECK(client.captureSend(kProject).status == TransferStatus::LocalUnavailable);
  status = 502;
  code = "CLOUD_UNREACHABLE";
  CHECK(client.captureReceive(kProject).status == TransferStatus::Offline);
  status = 409;
  code = "ALREADY_EXISTS";
  const SendCapture refused = client.captureSend(kProject);
  CHECK(refused.status == TransferStatus::Refused);
  CHECK(refused.reason == "ALREADY_EXISTS");
  status = 500;
  code = "INTERNAL_SERVER_ERROR";
  CHECK(client.runReceive(kTransfer, {}).status == TransferStatus::Refused);
}

void readsCollectFirstAndRefusedSends(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([](const HttpRequest& request) {
    if (request.url.ends_with("send.capture")) {
      return ok({{"status", "collect_first"},
                 {"external", json::array({"/media/a.png"})},
                 {"message", "Copy these files into the project folder first"}});
    }
    return ok({{"status", "refused"},
               {"transfer_id", kTransfer},
               {"failures", json::array({{{"code", "BASE_CHANGED"},
                                          {"kind", "workflow"},
                                          {"document_id", kProject},
                                          {"stored_hash", "s1"},
                                          {"message", "changed"}}})}});
  });
  LocalTransferClient client(transport, kLocal, {}, *app.session);
  const SendCapture capture = client.captureSend(kProject);
  CHECK(capture.status == TransferStatus::Ok);
  CHECK(capture.collectFirst);
  CHECK(capture.external == std::vector<std::string>{"/media/a.png"});
  CHECK(capture.transferId.empty());

  const SendRun run = client.runSend(kTransfer, {}, {});
  CHECK(run.status == TransferStatus::Ok);
  CHECK(!run.committed);
  CHECK(run.failures.size() == 1 && run.failures[0].storedHash == "s1");
}

void readsTheReceiveCapture(TestContext& t) {
  SignedInApp app;
  std::string state = "both_changed";
  FakeTransport transport([&](const HttpRequest& request) {
    if (request.url.ends_with("receive.capture")) {
      return ok({{"set_id", "set1"},
                 {"documents", json::array({{{"kind", "timeline"},
                                             {"cloud_id", "c1"},
                                             {"local_id", "l1"},
                                             {"name", "Cut"},
                                             {"content_hash", "hc"},
                                             {"status", state},
                                             {"decision", nullptr},
                                             {"files", json::array()},
                                             {"missing_files", json::array({"h1", "h2"})}}})}});
    }
    return ok({{"status", "finished"},
               {"set_id", "set1"},
               {"result",
                {{"received", json::array({{{"kind", "timeline"}, {"id", "l1"}, {"name", "Cut"}}})},
                 {"changed_during_receive", json::array()},
                 {"not_received", json::array()},
                 {"kept_beside", json::array()},
                 {"missing_files", json::array({"h1"})},
                 {"file_kept", json::array()}}}});
  });
  LocalTransferClient client(transport, kLocal, {}, *app.session);
  const ReceiveCapture capture = client.captureReceive(kProject);
  CHECK(capture.status == TransferStatus::Ok);
  CHECK(capture.setId == "set1");
  CHECK(capture.documents.size() == 1);
  if (capture.documents.size() == 1) {
    CHECK(capture.documents[0].state == ReceiveState::BothChanged);
    CHECK(!capture.documents[0].decision);
    CHECK(capture.documents[0].missingFiles == 2);
    CHECK(capture.documents[0].contentHash == "hc");
  }
  const ReceiveRun run = client.runReceive("set1", {{"timeline", "l1", ReceiveChoice::KeepLocal}});
  CHECK(run.status == TransferStatus::Ok);
  CHECK(run.outcome == "finished");
  CHECK(run.received == std::vector<std::string>{"Cut"});
  CHECK(run.missingFiles == 1);
  const auto sent = transport.sent();
  CHECK(json::parse(sent.back().body)["decisions"][0]["decision"] == "keep_local");

  // A state this client does not know is refused, never received unseen.
  state = "moved_elsewhere";
  const ReceiveCapture unknown = client.captureReceive(kProject);
  CHECK(unknown.status == TransferStatus::Refused);
  CHECK(unknown.documents.empty());
}

std::size_t countOf(const TransferReview& review, ReviewSection section) {
  std::size_t n = 0;
  for (const ReviewRow& row : review.rows()) {
    n += row.section == section ? 1 : 0;
  }
  return n;
}

std::size_t indexOf(const TransferReview& review, ReviewSection section) {
  for (std::size_t i = 0; i < review.rows().size(); ++i) {
    if (review.rows()[i].section == section) {
      return i;
    }
  }
  return review.rows().size();
}

void reviewListsEachDocumentOnce(TestContext& t) {
  SendCapture send;
  send.operations = {{"replace_document", "workflow", "w1", ""}, {"rename_document", "timeline", "t1", "New name"}};
  send.deletedLocally = {{"workflow", "gone", "cloud-gone", "base-5"}};
  send.skipped = {{"workflow", "bad", "Broken", "invalid JSON"}};
  send.missingFiles = {{"a1", "too_large", {{"timeline", "t1"}}}};
  ReceiveCapture receive;
  receive.documents = {
      {"timeline", "c2", "t2", "Same", "h2", ReceiveState::Same, ReceiveChoice::Receive, 0},
      {"timeline", "c3", "t3", "Theirs", "h3", ReceiveState::CloudChanged, ReceiveChoice::Receive, 0},
      {"workflow", "c4", "w4", "Both", "h4", ReceiveState::BothChanged, std::nullopt, 0},
      {"workflow", "cloud-gone", "gone", "Deleted here", "h5", ReceiveState::LocalDeleted, std::nullopt, 0},
  };
  TransferReview review(send, receive);
  CHECK(countOf(review, ReviewSection::Send) == 2);
  CHECK(countOf(review, ReviewSection::Receive) == 1);
  CHECK(countOf(review, ReviewSection::Choice) == 1);
  // The deletion both halves list is one row.
  CHECK(countOf(review, ReviewSection::Deletion) == 1);
  CHECK(countOf(review, ReviewSection::Problem) == 2);

  // A both-changed document blocks until the person picks.
  CHECK(!review.ready());
  const std::size_t choice = indexOf(review, ReviewSection::Choice);
  CHECK(!review.confirmDeletion(choice, true));
  CHECK(review.choose(choice, ReceiveChoice::KeepLocal));
  // The missing file blocks too, until the person confirms the send goes
  // without it (X7, review F36).
  CHECK(!review.ready());
  CHECK(review.confirmMissingFile(indexOf(review, ReviewSection::Problem) + 1, true));
  CHECK(review.ready());

  // Deletions are off by default: nothing is deleted on the cloud and the
  // cloud version comes back (PRD V4 and V5).
  CHECK(review.confirmedDeletes().empty());
  // The receive names each document by its cloud id, not the local one.
  auto decisions = review.receiveDecisions();
  CHECK(decisions.size() == 2);
  bool restores = false;
  bool keepsBoth = false;
  for (const ReceiveDecision& d : decisions) {
    restores = restores || (d.documentId == "cloud-gone" && d.choice == ReceiveChoice::Receive);
    keepsBoth = keepsBoth || (d.documentId == "c4" && d.choice == ReceiveChoice::KeepLocal);
  }
  CHECK(restores);
  CHECK(keepsBoth);

  const std::size_t deletion = indexOf(review, ReviewSection::Deletion);
  CHECK(!review.choose(deletion, ReceiveChoice::Receive));
  CHECK(review.confirmDeletion(deletion, true));
  // The confirmation names the cloud revision the sheet showed, which an
  // edit in the cloud made newer than the base (V4, review F40).
  const auto deletes = review.confirmedDeletes();
  CHECK(deletes.size() == 1 && deletes[0].kind == "workflow" && deletes[0].cloudId == "cloud-gone" &&
        deletes[0].cloudHash == "h5");
  bool keeps = false;
  for (const ReceiveDecision& d : review.receiveDecisions()) {
    keeps = keeps || (d.documentId == "cloud-gone" && d.choice == ReceiveChoice::KeepLocal);
  }
  CHECK(keeps);
  // A problem row takes no choice.
  CHECK(!review.choose(indexOf(review, ReviewSection::Problem), ReceiveChoice::Receive));
}

void aRefusedSendAsksAgain(TestContext& t) {
  SendCapture send;
  send.operations = {{"replace_document", "workflow", "w1", ""}};
  TransferReview review(send, {});
  CHECK(review.ready());
  review.addRefusal({{"BASE_CHANGED", "workflow", "w1", "stored-1", "changed"},
                     {"MISSING_FILE", "workflow", "w1", "", "missing"},
                     {"BASE_CHANGED", "timeline", "t9", "stored-9", "changed"}});
  CHECK(countOf(review, ReviewSection::Send) == 0);
  CHECK(countOf(review, ReviewSection::Choice) == 2);
  CHECK(!review.ready());
  for (std::size_t i = 0; i < review.rows().size(); ++i) {
    review.choose(i, review.rows()[i].documentId == "w1" ? ReceiveChoice::KeepLocal : ReceiveChoice::Receive);
  }
  CHECK(review.ready());
  const auto keep = review.keepLocalDecisions();
  CHECK(keep.size() == 1 && keep[0].documentId == "w1" && keep[0].cloudHash == "stored-1");
  // A refused send's choice is the send half's, never a receive decision.
  CHECK(review.receiveDecisions().empty());
}

// A send row names its document, and a document linked under another
// cloud id is matched by that id when the cloud refuses it.
void sendRowsNameTheirDocument(TestContext& t) {
  SendCapture send;
  send.operations = {{"replace_document", "workflow", "c1", ""}, {"rename_document", "timeline", "t2", "New"}};
  send.documents = {{"workflow", "l1", "c1", "Flow"}, {"timeline", "t2", "t2", "Old"}};
  TransferReview review(send, {});
  CHECK(review.rows().size() == 2);
  if (review.rows().size() == 2) {
    CHECK(review.rows()[0].name == "Flow");
    CHECK(review.rows()[0].documentId == "l1");
    CHECK(review.rows()[0].cloudId == "c1");
    CHECK(review.rows()[1].name == "New");
  }
  review.addRefusal({{"BASE_CHANGED", "workflow", "c1", "stored-1", "changed"}});
  CHECK(countOf(review, ReviewSection::Choice) == 1);
  CHECK(countOf(review, ReviewSection::Send) == 1);
  review.choose(indexOf(review, ReviewSection::Choice), ReceiveChoice::KeepLocal);
  const auto keep = review.keepLocalDecisions();
  CHECK(keep.size() == 1 && keep[0].documentId == "c1");
}

// A send after a receive that kept local copies is refused for them. The
// person answered already when the stored hash is the revision they saw;
// a newer cloud revision asks again.
void aKeptDocumentIsNotAskedTwice(TestContext& t) {
  ReceiveCapture receive;
  receive.documents = {
      {"workflow", "c1", "w1", "Mine", "seen-1", ReceiveState::BothChanged, std::nullopt, 0},
      {"workflow", "c2", "w2", "Also mine", "seen-2", ReceiveState::BothChanged, std::nullopt, 0},
      {"workflow", "c3", "w3", "Theirs", "seen-3", ReceiveState::BothChanged, std::nullopt, 0},
  };
  TransferReview review({}, receive);
  for (std::size_t i = 0; i < review.rows().size(); ++i) {
    review.choose(i, review.rows()[i].cloudId == "c3" ? ReceiveChoice::Receive : ReceiveChoice::KeepLocal);
  }
  const std::vector<TransferFailure> failures{{"BASE_CHANGED", "workflow", "c1", "seen-1", "changed"},
                                              {"BASE_CHANGED", "workflow", "c2", "newer-2", "changed"},
                                              {"BASE_CHANGED", "workflow", "c3", "seen-3", "changed"},
                                              {"MISSING_FILE", "workflow", "c1", "", "missing"}};
  const auto answered = review.answeredRefusals(failures);
  CHECK(answered.size() == 1);
  if (answered.size() == 1) {
    CHECK(answered[0].documentId == "c1");
    CHECK(answered[0].cloudHash == "seen-1");
  }
}

} // namespace

void sendsNothingToAServerOffThisComputer(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([](const HttpRequest&) { return ok({{"status", "captured"}}); });
  for (const char* origin : {"https://editor.example", "http://192.168.1.4:7777", "http://127.0.0.1.evil.example:80",
                             "http://localhost@evil.example:80", "https://127.0.0.1:7777"}) {
    LocalTransferClient client(transport, origin, {{"Authorization", "Bearer local"}}, *app.session);
    const SendRun run = client.runSend(kTransfer, {}, {});
    CHECK(run.status == TransferStatus::Refused);
    CHECK(run.reason == "NOT_LOCAL_SERVER");
    CHECK(client.captureReceive(kProject).status == TransferStatus::Refused);
  }
  CHECK(transport.sent().empty());
  CHECK(isLoopbackHttpOrigin("http://127.0.0.1:7777"));
  CHECK(isLoopbackHttpOrigin("http://localhost:8000/"));
  CHECK(isLoopbackHttpOrigin("http://[::1]:7777"));
  CHECK(!isLoopbackHttpOrigin("http://127.0.0.1"));
  CHECK(!isLoopbackHttpOrigin("http://127.0.0.1:7777/trpc"));
}

void aRecaptureOnlyLeavesOutWhatWasReviewed(TestContext& t) {
  const std::vector<TransferOperation> approved{{"replace_document", "workflow", "c1", "", "h1", "b1"},
                                                {"replace_document", "workflow", "c2", "", "h2", "b2"}};
  // Leaving out the received document is fine.
  CHECK(unreviewedOperations(approved, {approved[0]}).empty());
  // A document created here, an edit since the sheet, and a moved base are not.
  const std::vector<TransferOperation> again{{"replace_document", "workflow", "c1", "", "h1", "b1"},
                                             {"create_document", "workflow", "n1", "", "h9", ""},
                                             {"replace_document", "workflow", "c2", "", "h3", "b2"},
                                             {"replace_document", "workflow", "c2", "", "h2", "b4"}};
  const auto unreviewed = unreviewedOperations(approved, again);
  CHECK(unreviewed.size() == 3);
  CHECK(!unreviewed.empty() && unreviewed[0].documentId == "n1");
}

// A file put over its earlier version is a send row of its own, and a
// recapture's new or changed file puts are not what the sheet showed
// (review F33).
void fileOnlyChangesAreSendWork(TestContext& t) {
  SendCapture send;
  send.fileOperations = {{"put_asset_file", "a1", "media/still.png", "h2", "h1"},
                         {"put_asset_file", "a2", "media/new.png", "h3", ""}};
  TransferReview review(send, {});
  CHECK(countOf(review, ReviewSection::Send) == 1);
  if (!review.rows().empty()) {
    CHECK(review.rows()[0].documentId == "a1");
    CHECK(review.rows()[0].detail == "put_asset_file");
  }
  CHECK(unreviewedFileOperations(send.fileOperations, {send.fileOperations[0]}).empty());
  const auto changed = unreviewedFileOperations(send.fileOperations, {{"put_asset_file", "a1", "media/still.png", "h4", "h1"}});
  CHECK(changed.size() == 1);
}

// A send goes without a missing file only once the person confirms it, and
// the confirmation is the capture's entry as listed (X7, review F36).
// A send attempt names every deletion it carries, [] when there is none,
// so a withdrawn confirmation never survives from an earlier attempt
// (review F43).
void everySendNamesItsDeletions(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([](const HttpRequest&) {
    return ok({{"status", "committed"}, {"transfer_id", kTransfer}, {"result", json::object()}});
  });
  LocalTransferClient client(transport, kLocal, {}, *app.session);
  CHECK(client.runSend(kTransfer, {}, {}).committed);
  const json body = json::parse(transport.sent().back().body);
  CHECK(body.contains("confirm_deletes") && body["confirm_deletes"] == json::array());
}

void missingFilesNeedAConfirmation(TestContext& t) {
  SignedInApp app;
  const json listed{{"asset_id", "a1"},
                    {"hash", std::string(64, 'f')},
                    {"size", 12},
                    {"reason", "missing_locally"},
                    {"documents", json::array({{{"kind", "workflow"}, {"document_id", "w1"}},
                                               {{"kind", "workflow"}, {"document_id", "w2"}}})}};
  FakeTransport transport([&](const HttpRequest& request) {
    if (request.url.ends_with("/trpc/cloudTransfer.send.capture")) {
      return ok({{"status", "captured"},
                 {"transfer_id", kTransfer},
                 {"first_publication", false},
                 {"operations", json::array()},
                 {"documents", json::array()},
                 {"missing_files", json::array({listed})},
                 {"skipped", json::array()},
                 {"deleted_locally", json::array()}});
    }
    const json body = json::parse(request.body);
    if (!body.contains("confirm_missing_files")) {
      return ok({{"status", "missing_files_unconfirmed"}, {"transfer_id", kTransfer}, {"missing_files", json::array({listed})}});
    }
    return ok({{"status", "committed"}, {"transfer_id", kTransfer}, {"result", json::object()}});
  });
  LocalTransferClient client(transport, kLocal, {}, *app.session);
  const SendCapture send = client.captureSend(kProject);
  TransferReview review(send, {});
  CHECK(countOf(review, ReviewSection::Problem) == 2);
  CHECK(!review.ready());
  CHECK(review.confirmedMissingFiles().empty());
  const SendRun refused = client.runSend(kTransfer, {}, {}, review.confirmedMissingFiles());
  CHECK(refused.missingUnconfirmed && !refused.committed);
  // One confirmation covers every document that needs the file.
  CHECK(review.confirmMissingFile(indexOf(review, ReviewSection::Problem), true));
  CHECK(review.ready());
  const SendRun sent = client.runSend(kTransfer, {}, {}, review.confirmedMissingFiles());
  CHECK(sent.committed);
  const json body = json::parse(transport.sent().back().body);
  CHECK(body["confirm_missing_files"] == json::array({listed}));
  CHECK(!review.confirmMissingFile(review.rows().size(), true));
}

// The cloud refuses a confirmed deletion when the document changed there
// after the sheet showed it. The sheet asks again for the newer revision,
// and a second confirmation names that revision (V4, review F40).
void aRefusedDeletionAsksAgain(TestContext& t) {
  SendCapture send;
  send.deletedLocally = {{"workflow", "gone", "cloud-gone", "base-1"}};
  TransferReview review(send, {});
  const std::size_t deletion = indexOf(review, ReviewSection::Deletion);
  CHECK(review.confirmDeletion(deletion, true));
  auto deletes = review.confirmedDeletes();
  CHECK(deletes.size() == 1 && deletes[0].cloudHash == "base-1");

  review.addRefusal({{"BASE_CHANGED", "workflow", "cloud-gone", "stored-2", "changed"}});
  CHECK(countOf(review, ReviewSection::Deletion) == 1);
  CHECK(countOf(review, ReviewSection::Choice) == 0);
  CHECK(review.confirmedDeletes().empty());
  CHECK(review.rows()[deletion].detail == "cloud_changed");
  CHECK(review.confirmDeletion(deletion, true));
  deletes = review.confirmedDeletes();
  CHECK(deletes.size() == 1 && deletes[0].cloudId == "cloud-gone" && deletes[0].cloudHash == "stored-2");
}

// A refused document has one decision row, whichever rows named it, and a
// Receive pick on that row is a receive of the new cloud revision, never a
// decision on the old set (review F39).
void aRefusedDocumentKeepsOneRow(TestContext& t) {
  SendCapture send;
  send.operations = {{"replace_document", "workflow", "c1", ""}};
  send.documents = {{"workflow", "w1", "c1", "Flow"}};
  ReceiveCapture receive;
  receive.documents = {{"workflow", "c1", "w1", "Flow", "h1", ReceiveState::BothChanged, std::nullopt, 0}};
  TransferReview review(send, receive);
  // The sheet holds a Send row and a Choice row that both name c1.
  review.addRefusal({{"BASE_CHANGED", "workflow", "c1", "s1", "changed"}});
  review.addRefusal({{"BASE_CHANGED", "workflow", "c1", "s2", "changed"}});
  std::size_t named = 0;
  for (const ReviewRow& row : review.rows()) {
    named += row.kind == "workflow" && row.cloudId == "c1" ? 1 : 0;
  }
  CHECK(named == 1);
  const std::size_t choice = indexOf(review, ReviewSection::Choice);
  CHECK(review.rows()[choice].cloudHash == "s2");
  CHECK(review.choose(choice, ReceiveChoice::Receive));
  CHECK(review.receiveDecisions().empty());
  CHECK(review.keepLocalDecisions().empty());
  const auto receives = review.refusalsToReceive();
  CHECK(receives.size() == 1 && receives[0].kind == "workflow" && receives[0].cloudId == "c1" &&
        receives[0].cloudHash == "s2");
}

// A receive closed before it applies ends on the local router, which
// releases the cloud set and deletes its local row (review F41).
void cancelsAReceive(TestContext& t) {
  SignedInApp app;
  FakeTransport transport([](const HttpRequest& request) {
    if (request.url.ends_with("/trpc/cloudTransfer.receive.cancel")) {
      const json body = json::parse(request.body);
      return ok({{"state", body["set_id"] == "applied-set" ? "applied" : "cancelled"}});
    }
    return refusal(404, "NOT_FOUND");
  });
  LocalTransferClient client(transport, kLocal, {}, *app.session);
  const auto cancelled = client.cancelReceive("s1");
  CHECK(cancelled.status == TransferStatus::Ok && !cancelled.applied);
  CHECK(client.cancelReceive("applied-set").applied);
  const auto sent = transport.sent();
  CHECK(sent.size() == 2);
  if (!sent.empty()) {
    const json body = json::parse(sent[0].body);
    CHECK(body["set_id"] == "s1");
    CHECK(body.value("access_token", std::string()).size() > 0);
  }
}

int main() {
  return account_test::runTests({
      {"callsTheLocalRouterForTheAccount", callsTheLocalRouterForTheAccount},
      {"renewsTheTokenOnceWhenTheCloudRefusesIt", renewsTheTokenOnceWhenTheCloudRefusesIt},
      {"sortsFailures", sortsFailures},
      {"readsCollectFirstAndRefusedSends", readsCollectFirstAndRefusedSends},
      {"readsTheReceiveCapture", readsTheReceiveCapture},
      {"reviewListsEachDocumentOnce", reviewListsEachDocumentOnce},
      {"aRefusedSendAsksAgain", aRefusedSendAsksAgain},
      {"aKeptDocumentIsNotAskedTwice", aKeptDocumentIsNotAskedTwice},
      {"sendRowsNameTheirDocument", sendRowsNameTheirDocument},
      {"sendsNothingToAServerOffThisComputer", sendsNothingToAServerOffThisComputer},
      {"aRecaptureOnlyLeavesOutWhatWasReviewed", aRecaptureOnlyLeavesOutWhatWasReviewed},
      {"fileOnlyChangesAreSendWork", fileOnlyChangesAreSendWork},
      {"missingFilesNeedAConfirmation", missingFilesNeedAConfirmation},
      {"everySendNamesItsDeletions", everySendNamesItsDeletions},
      {"aRefusedDeletionAsksAgain", aRefusedDeletionAsksAgain},
      {"aRefusedDocumentKeepsOneRow", aRefusedDocumentKeepsOneRow},
      {"cancelsAReceive", cancelsAReceive},
  });
}
