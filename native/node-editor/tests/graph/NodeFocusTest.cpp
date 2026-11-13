#include "graph/NodeFocus.h"
#include <QtTest>
using namespace nodetool::node_editor;
// stores/NodeFocusStore.ts navigateFocus: order for next and previous,
// nearest position for a direction with the cross axis at half weight.
class NodeFocusTest : public QObject {
  Q_OBJECT
private slots:
  void cyclesInDocumentOrder() {
    const QVector<FocusCandidate> nodes{{"a", {0, 0}}, {"b", {100, 0}}, {"c", {200, 0}}};
    QCOMPARE(nextFocus(nodes, {}, FocusDirection::Next), QString("a"));
    QCOMPARE(nextFocus(nodes, {}, FocusDirection::Previous), QString("c"));
    QCOMPARE(nextFocus(nodes, "c", FocusDirection::Next), QString("a"));
    QCOMPARE(nextFocus(nodes, "a", FocusDirection::Previous), QString("c"));
    QCOMPARE(nextFocus(nodes, "gone", FocusDirection::Next), QString("a"));
    QCOMPARE(nextFocus({}, "a", FocusDirection::Next), QString("a"));
  }
  void movesToTheNearestNodeThatWay() {
    const QVector<FocusCandidate> nodes{{"origin", {0, 0}}, {"right-far", {400, 0}}, {"right-off-axis", {200, 300}},
                                        {"below", {-50, 250}}, {"above", {-80, -500}}};
    // 200 + 300 / 2 = 350 beats 400.
    QCOMPARE(nextFocus(nodes, "origin", FocusDirection::Right), QString("right-off-axis"));
    QCOMPARE(nextFocus(nodes, "origin", FocusDirection::Down), QString("below"));
    QCOMPARE(nextFocus(nodes, "origin", FocusDirection::Up), QString("above"));
    // Nothing to the left of the leftmost node keeps the focus.
    QCOMPARE(nextFocus(nodes, "above", FocusDirection::Left), QString("above"));
    // No focus yet starts at the first node.
    QCOMPARE(nextFocus(nodes, {}, FocusDirection::Left), QString("origin"));
  }
};
QTEST_GUILESS_MAIN(NodeFocusTest)
#include "NodeFocusTest.moc"
