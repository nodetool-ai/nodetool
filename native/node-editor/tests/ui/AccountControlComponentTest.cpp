// AccountControl.qml and its place in StatusBar.qml, against a real
// AccountController on a temporary data folder, an in-memory keychain and the
// account library's fake token server. No EditorWindow, graph runner, QtNodes
// or cloud server.
#include "interfaces/PanelLayout.h"
#include "interfaces/StatusModel.h"
#include "nodetool/account/qt/AccountController.h"
#include "nodetool/account/qt/QtHttpTransport.h"
#include "test_support.h"

#include <QGuiApplication>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QUrlQuery>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

#include <thread>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)

using nodetool::account::MemorySecretStore;
using nodetool::account::ManagedPolicy;
using nodetool::account::qt::AccountController;
using nodetool::account::qt::AccountServices;
using nodetool::node_editor::PanelLayout;
using nodetool::node_editor::StatusModel;

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

    std::unique_ptr<AccountController> app() {
        AccountServices services;
        services.dataDir = data.path();
        services.serverOrigin = "https://nt.example";
        services.app = "node-editor";
        services.store = std::make_unique<MemorySecretStore>();
        services.endpoint = std::make_unique<Endpoint>(server);
        services.policy = [this] { return policy; };
        services.nowMs = clock.fn();
        services.signInTimeout = std::chrono::seconds(10);
        return std::make_unique<AccountController>(std::move(services));
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

    // The status bar shows the control only when the host gives it an
    // account.
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
        auto account = computer.app();
        QQuickView view;
        view.setInitialProperties({{"status", QVariant::fromValue(&status)},
                                   {"panels", QVariant::fromValue(&panels)},
                                   {"account", QVariant::fromValue(account.get())}});
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/StatusBar.qml"));
        QCOMPARE(view.status(), QQuickView::Ready);
        view.resize(1200, 28);
        view.show();
        QVERIFY(named(view.rootObject(), "status-account")->property("active").toBool());
        QTRY_VERIFY(shown(view.rootObject(), "account-sign-in"));
    }
};

QTEST_MAIN(AccountControlComponentTest)
#include "AccountControlComponentTest.moc"
