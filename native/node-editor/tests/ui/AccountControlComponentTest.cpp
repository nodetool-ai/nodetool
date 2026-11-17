// AccountControl.qml and its place in StatusBar.qml, against a real
// AccountController on a temporary data folder, an in-memory keychain and the
// account library's fake token server, and CloudDocumentsPanel.qml against a
// fake cloud transport. No EditorWindow, graph runner, QtNodes or cloud
// server.
#include "interfaces/PanelLayout.h"
#include "interfaces/StatusModel.h"
#include "server/WorkflowBrowser.h"
#include "nodetool/account/qt/AccountController.h"
#include "nodetool/account/qt/AccountServers.h"
#include "nodetool/account/qt/CloudBrowser.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "test_support.h"

#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QUrlQuery>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

#include <functional>
#include <thread>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::account::MemorySecretStore;
using nodetool::account::ManagedPolicy;
using nodetool::account::qt::AccountController;
using nodetool::account::qt::AccountServers;
using nodetool::account::qt::CloudBrowser;
using nodetool::account::qt::AccountServices;
using nodetool::node_editor::PanelLayout;
using nodetool::node_editor::StatusModel;
using nodetool::node_editor::WorkflowBrowser;

namespace {

QQuickItem *named(QQuickItem *root, const QString &name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto *child : root->childItems()) {
        if (auto *found = named(child, name)) {
            return found;
        }
    }
    return nullptr;
}

void click(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QTRY_VERIFY(item->isVisible() && item->width() > 0);
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier,
                      item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
}

bool shown(QQuickItem *root, const QString &name) {
    auto *item = named(root, name);
    return item && item->isVisible();
}

// Forwards to one token server the test owns.
//
// Thread affinity: thread-safe, as the wrapped endpoint.
class Endpoint final : public nodetool::account::TokenEndpoint {
public:
    explicit Endpoint(nodetool::account::TokenEndpoint &endpoint) : endpoint_(endpoint) {}
    nodetool::account::TokenResult exchangeCode(const nodetool::account::CodeExchange &e) override {
        return endpoint_.exchangeCode(e);
    }
    nodetool::account::TokenResult refresh(std::string_view t) override { return endpoint_.refresh(t); }
    nodetool::account::EndSessionStatus endSession(std::string_view h) override { return endpoint_.endSession(h); }

private:
    nodetool::account::TokenEndpoint &endpoint_;
};

struct Computer {
    account_test::TempDir data;
    account_test::FakeClock clock;
    account_test::FakeTokenServer server{clock};
    ManagedPolicy policy;

    AccountServices services(const std::string &origin = "https://nt.example") {
        AccountServices services;
        services.dataDir = data.path();
        services.serverOrigin = origin;
        services.app = "node-editor";
        services.store = std::make_unique<MemorySecretStore>();
        services.endpoint = std::make_unique<Endpoint>(server);
        services.policy = [this] { return policy; };
        services.nowMs = clock.fn();
        services.signInTimeout = std::chrono::seconds(10);
        return services;
    }

    std::unique_ptr<AccountController> app() { return std::make_unique<AccountController>(services()); }
};

// The cloud server's lists. Thread-safe: it holds no mutable state.
class ListTransport final : public nodetool::account::HttpTransport {
public:
    nodetool::account::HttpResponse send(const nodetool::account::HttpRequest &request) override {
        if (request.url.find("/trpc/workflows.list") != std::string::npos) {
            return {200, R"({"result":{"data":{"workflows":[{"id":"w1","name":"Launch film"}],"next":null}}})"};
        }
        if (request.url.find("/trpc/workflows.sharing.sharedWithMe") != std::string::npos) {
            return {200, R"({"result":{"data":{"workflows":[{"id":"w2","name":"Team graph","shared_role":"viewer"}]}}})"};
        }
        return {404, "{}"};
    }
};

// Plays the browser: sends the code to the loopback redirect.
void completeInBrowser(const QUrl &authorize, const QString &code) {
    const QUrlQuery query(authorize);
    QUrl callback(query.queryItemValue("redirect_uri", QUrl::FullyDecoded));
    QUrlQuery params;
    params.addQueryItem("code", code);
    params.addQueryItem("state", query.queryItemValue("state", QUrl::FullyDecoded));
    callback.setQuery(params);
    nodetool::account::HttpRequest request;
    request.url = callback.toString(QUrl::FullyEncoded).toStdString();
    std::thread([request] { nodetool::account::qt::QtHttpTransport().send(request); }).join();
}

} // namespace

class AccountControlComponentTest final : public QObject {
    Q_OBJECT

private slots:
    void signsInAndOut() {
        Computer computer;
        computer.server.addCode("code-1", "u1", "Ada Lovelace");
        auto account = computer.app();
        QQuickView view;
        view.setInitialProperties({{"account", QVariant::fromValue(account.get())}});
        // Tall enough for the account menu to open inside the window.
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/AccountControl.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(600, 240);
        view.show();
        auto *root = view.rootObject();

        QTRY_VERIFY(shown(root, "account-sign-in"));
        QCOMPARE(named(root, "account-sign-in")->property("text").toString(), QString("Sign in"));
        QVERIFY(!shown(root, "account-menu-button"));
        QVERIFY(!shown(root, "account-status"));

        QUrl authorize;
        connect(account.get(), &AccountController::browserRequested, this, [&](const QUrl &url) { authorize = url; });
        click(view, named(root, "account-sign-in"));
        QTRY_VERIFY(shown(root, "account-cancel"));
        QVERIFY(!shown(root, "account-sign-in"));
        QTRY_VERIFY(authorize.isValid());
        completeInBrowser(authorize, "code-1");

        QTRY_VERIFY(shown(root, "account-menu-button"));
        QCOMPARE(named(root, "account-menu-button")->property("text").toString(), QString("Ada Lovelace"));
        QVERIFY(!shown(root, "account-cancel"));

        click(view, named(root, "account-menu-button"));
        auto *signOut = root->findChild<QQuickItem *>("account-sign-out");
        QVERIFY(signOut);
        click(view, signOut);
        QTRY_VERIFY(shown(root, "account-sign-in"));
        QCOMPARE(account->state(), AccountController::State::SignedOut);
    }

    void cancelReturnsToSignIn() {
        Computer computer;
        auto account = computer.app();
        QQuickView view;
        view.setInitialProperties({{"account", QVariant::fromValue(account.get())}});
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/AccountControl.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(600, 28);
        view.show();
        auto *root = view.rootObject();
        QSignalSpy browser(account.get(), &AccountController::browserRequested);
        click(view, named(root, "account-sign-in"));
        QTRY_COMPARE(browser.count(), 1);
        click(view, named(root, "account-cancel"));
        QTRY_VERIFY(shown(root, "account-sign-in"));
        QVERIFY(!shown(root, "account-message"));
    }

    // TC91: with cloud features off, Sign in is disabled and the control
    // says why.
    void policyTurnsCloudOff() {
        Computer computer;
        computer.policy = nodetool::account::parsePolicyJson("{\"CloudEnabled\": false}");
        auto account = computer.app();
        QQuickView view;
        view.setInitialProperties({{"account", QVariant::fromValue(account.get())}});
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/AccountControl.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(800, 28);
        view.show();
        auto *root = view.rootObject();
        QTRY_VERIFY(shown(root, "account-status"));
        QCOMPARE(named(root, "account-status")->property("text").toString(),
                 QString("Cloud features are turned off on this computer"));
        QVERIFY(!named(root, "account-sign-in")->property("enabled").toBool());
    }

    // The status bar shows the control only when the host gives it the
    // account servers.
    void statusBarHostsTheControl() {
        StatusModel status;
        PanelLayout panels;
        {
            QQuickView view;
            view.setInitialProperties({{"status", QVariant::fromValue(&status)}, {"panels", QVariant::fromValue(&panels)}});
            view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/StatusBar.qml"));
            QCOMPARE(view.status(), QQuickView::Ready);
            QVERIFY(!named(view.rootObject(), "status-account")->property("active").toBool());
        }
        Computer computer;
        AccountServers servers(computer.data.path(), "https://nt.example",
                               [&](const std::string &origin) { return computer.services(origin); });
        QQuickView view;
        view.setInitialProperties({{"status", QVariant::fromValue(&status)},
                                   {"panels", QVariant::fromValue(&panels)},
                                   {"accountServers", QVariant::fromValue(&servers)}});
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/StatusBar.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(1200, 28);
        view.show();
        QVERIFY(named(view.rootObject(), "status-account")->property("active").toBool());
        QTRY_VERIFY(shown(view.rootObject(), "account-sign-in"));
        QTRY_VERIFY(shown(view.rootObject(), "account-server-button"));
        QCOMPARE(named(view.rootObject(), "account-server-button")->property("text").toString(), QString("NodeTool Cloud"));
    }

    // Sign in to another server… asks for the address first, refuses one
    // that is not HTTPS, then switches to the server and opens its sign-in.
    void signsInToAnotherServer() {
        Computer computer;
        AccountServers servers(computer.data.path(), "https://nt.example",
                               [&](const std::string &origin) { return computer.services(origin); });
        QQuickView view;
        view.setInitialProperties({{"account", QVariant::fromValue(servers.current())},
                                   {"servers", QVariant::fromValue(&servers)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/AccountControl.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(700, 320);
        view.show();
        auto *root = view.rootObject();
        // The window binds `account` to the current server, as the status
        // bar does.
        connect(&servers, &AccountServers::currentChanged, root,
                [&] { root->setProperty("account", QVariant::fromValue(servers.current())); });
        QSignalSpy browser(&servers, &AccountServers::browserRequested);

        click(view, named(root, "account-server-button"));
        auto *add = root->findChild<QQuickItem *>("account-add-server");
        QVERIFY(add);
        click(view, add);
        auto *address = root->findChild<QQuickItem *>("account-server-address");
        QVERIFY(address);
        QTRY_VERIFY(address->isVisible());
        address->setProperty("text", "http://plain.example");
        click(view, root->findChild<QQuickItem *>("account-server-continue"));
        auto *error = root->findChild<QQuickItem *>("account-server-error");
        QTRY_VERIFY(error && error->isVisible());
        QCOMPARE(servers.currentServer(), QString("https://nt.example"));
        QCOMPARE(browser.count(), 0);

        address->setProperty("text", "team.example");
        click(view, root->findChild<QQuickItem *>("account-server-continue"));
        QTRY_COMPARE(servers.currentServer(), QString("https://team.example"));
        QTRY_COMPARE(browser.count(), 1);
        QCOMPARE(servers.current()->state(), AccountController::State::SigningIn);
        QTRY_VERIFY(!address->isVisible());
        QCOMPARE(named(root, "account-server-button")->property("text").toString(), QString("team.example"));
        servers.current()->cancelSignIn();
        QTRY_COMPARE(servers.current()->state(), AccountController::State::SignedOut);
    }

    // The Cloud and Shared with me groups list the signed-in account's
    // documents and ask the app to open the one chosen.
    void cloudDocumentsPanelLists() {
        Computer computer;
        computer.server.addCode("code-p", "u1", "Ada");
        auto account = computer.app();
        connect(account.get(), &AccountController::browserRequested, this,
                [](const QUrl &url) { std::thread([url] { completeInBrowser(url, "code-p"); }).detach(); });
        account->signIn();
        QTRY_COMPARE(account->state(), AccountController::State::SignedIn);
        CloudBrowser browser("workflow", std::make_unique<ListTransport>());
        browser.setAccount(account.get());

        QQuickView view;
        view.setInitialProperties({{"browser", QVariant::fromValue(&browser)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/CloudDocumentsPanel.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(400, 400);
        view.show();
        auto *root = view.rootObject();
        QTRY_COMPARE(named(root, "cloud-documents")->property("count").toInt(), 1);
        QTRY_COMPARE(named(root, "shared-documents")->property("count").toInt(), 1);
        QVERIFY(!shown(root, "cloud-documents-signed-out"));

        QSignalSpy open(root, SIGNAL(openRequested(QString, QString, QString, QString)));
        // Delegates belong to the list's content item, not its QObject tree.
        std::function<QQuickItem *(QQuickItem *)> rowOf = [&](QQuickItem *item) -> QQuickItem * {
            if (item->property("documentId").toString() == "w2") {
                return item;
            }
            for (auto *child : item->childItems()) {
                if (auto *found = rowOf(child)) {
                    return found;
                }
            }
            return nullptr;
        };
        click(view, rowOf(named(root, "shared-documents")));
        QTRY_COMPARE(open.count(), 1);
        QCOMPARE(open.at(0).at(1).toString(), QString("w2"));
        QCOMPARE(open.at(0).at(3).toString(), QString("viewer"));

        account->signOut();
        QTRY_VERIFY(shown(root, "cloud-documents-signed-out"));
        QTRY_COMPARE(named(root, "cloud-documents")->property("count").toInt(), 0);
    }

    // The workflow browser shows the cloud groups below the workflows on
    // this computer, and a chosen row reaches the window through the
    // CloudBrowser.
    void workflowBrowserHostsTheCloudGroups() {
        Computer computer;
        computer.server.addCode("code-w", "u1", "Ada");
        auto account = computer.app();
        connect(account.get(), &AccountController::browserRequested, this,
                [](const QUrl &url) { std::thread([url] { completeInBrowser(url, "code-w"); }).detach(); });
        account->signIn();
        QTRY_COMPARE(account->state(), AccountController::State::SignedIn);
        CloudBrowser cloud("workflow", std::make_unique<ListTransport>());
        cloud.setAccount(account.get());
        QSignalSpy open(&cloud, &CloudBrowser::openRequested);

        WorkflowBrowser browser;
        PanelLayout panels;
        StatusModel status;
        status.setStatus({.connected = true});
        QQuickView view;
        view.setInitialProperties({{"browser", QVariant::fromValue(&browser)},
                                   {"panels", QVariant::fromValue(&panels)},
                                   {"status", QVariant::fromValue(&status)},
                                   {"cloudBrowser", QVariant::fromValue(&cloud)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/WorkflowBrowser.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(360, 700);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        QTRY_VERIFY(named(root, "cloud-documents") != nullptr);
        QTRY_COMPARE(named(root, "cloud-documents")->property("count").toInt(), 1);
        std::function<QQuickItem *(QQuickItem *)> rowOf = [&](QQuickItem *item) -> QQuickItem * {
            if (item->property("documentId").toString() == "w1") {
                return item;
            }
            for (auto *child : item->childItems()) {
                if (auto *found = rowOf(child)) {
                    return found;
                }
            }
            return nullptr;
        };
        click(view, rowOf(named(root, "cloud-documents")));
        QTRY_COMPARE(open.count(), 1);
        QCOMPARE(open.at(0).at(0).toString(), QString("workflow"));
        QCOMPARE(open.at(0).at(1).toString(), QString("w1"));
        QCOMPARE(open.at(0).at(3).toString(), QString("owner"));
    }
};

QTEST_MAIN(AccountControlComponentTest)
#include "AccountControlComponentTest.moc"
