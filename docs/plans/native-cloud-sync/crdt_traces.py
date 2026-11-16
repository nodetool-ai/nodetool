"""Executable traces for the undo and selection rules (fixture suite v2).

Minimal model of one register of the timeline design, revision 4:
siblings, set, retract with a fallback restore, the display rule, the
ordinary-edit naming rule, and the undo chain with link cells.
It also models the current-result function of the storyboard and script
design, revision 3. Run: python3 crdt_traces.py
Each check prints PASS or FAIL. OLD_* checks reproduce the review's
counterexamples against the revision 3 rules and are expected to show the
failure.
"""
import itertools, random

NONE = "none"          # a pick of nothing


class Op:
    def __init__(s, dot, kind, names, value, stamp, fallback, deps, restores=()):
        s.dot, s.kind, s.names, s.value = dot, kind, frozenset(names), value
        s.stamp, s.fallback, s.deps = stamp, fallback, frozenset(deps)
        s.restores = frozenset(restores)


class Register:
    def __init__(s):
        s.sib = {}                      # dot -> Op that added the sibling
        s.applied = set()

    def apply(s, op):
        assert op.deps <= s.applied, "causal delivery"
        if op.dot in s.applied:
            return
        for d in op.names:
            s.sib.pop(d, None)
        if op.value is not None:
            s.sib[op.dot] = op
        s.applied.add(op.dot)

    def nonfallback(s):
        return [o for o in s.sib.values() if not o.fallback]

    def fallbacks(s):
        return [o for o in s.sib.values() if o.fallback]

    def displayed(s):
        pool = s.nonfallback() or s.fallbacks()
        return max(pool, key=lambda o: o.stamp) if pool else None

    def value(s, default=None):
        d = s.displayed()
        return d.value if d else default

    def key(s):
        return frozenset((o.dot, o.value, o.stamp, o.fallback) for o in s.sib.values())


class World:
    """Replicas of one register, a shared log, and a clock."""
    def __init__(s, actors):
        s.reg = {a: Register() for a in actors}
        s.seq = {a: 0 for a in actors}
        s.clock = 0
        s.log = []

    def _emit(s, actor, kind, names, value, fallback, stamp=None, restores=()):
        s.seq[actor] += 1
        s.clock += 1
        op = Op((actor, s.seq[actor]), kind, names, value,
                stamp if stamp is not None else s.clock, fallback,
                set(s.reg[actor].applied), restores)
        s.reg[actor].apply(op)
        s.log.append(op)
        return op

    def ordinary_names(s, actor):
        r = s.reg[actor]
        d = r.displayed()
        names = {o.dot for o in r.sib.values() if o.dot[0] == actor or o.fallback}
        if d:
            names.add(d.dot)
        return names

    def edit(s, actor, value):
        return s._emit(actor, "set", s.ordinary_names(actor), value, False)

    def sync(s, *actors):
        for a in actors or s.reg:
            pending = [o for o in s.log if o.dot not in s.reg[a].applied]
            progress = True
            while pending and progress:
                progress = False
                for o in list(pending):
                    if o.deps <= s.reg[a].applied:
                        s.reg[a].apply(o); pending.remove(o); progress = True

    def converges(s, runs=200):
        keys = set()
        rnd = random.Random(7)
        for _ in range(runs):
            r, todo = Register(), list(s.log)
            rnd.shuffle(todo)
            while todo:
                for o in list(todo):
                    if o.deps <= r.applied:
                        r.apply(o); todo.remove(o)
            keys.add(r.key())
        return len(keys) == 1


class UndoChain:
    """Revision 4. Entries E1..En of one actor on one register, and link
    cells L0..Ln. L[i] is the dot of the sibling that holds the value after
    Ei. L[i-1] is the dot of the sibling that holds the value beneath Ei."""
    def __init__(s, world, actor):
        s.w, s.a = world, actor
        s.entries = []                  # dict(value, stamp, prior, prior_restores)
        s.L = [None]
        s.done = 0                      # entries[0:done] are in effect

    def edit(s, value):
        r = s.w.reg[s.a]
        d = r.displayed()
        prior = d.value if d else None
        # dots a request must have seen for the restored value to count as seen
        prior_restores = (d.restores or {d.dot}) if d else ()
        if d and d.fallback and not d.restores:
            prior_restores = {d.dot}
        del s.entries[s.done:], s.L[s.done + 1:]
        op = s.w.edit(s.a, value)
        s.entries.append(dict(value=value, stamp=op.stamp, prior=prior,
                              prior_restores=frozenset(prior_restores)))
        s.L.append(op.dot)
        s.done += 1
        return op

    def undo(s):
        if s.done == 0:
            return "empty"
        i = s.done
        e, r = s.entries[i - 1], s.w.reg[s.a]
        s.done -= 1
        if s.L[i] not in r.sib:
            return "skipped"
        op = s.w._emit(s.a, "retract", {s.L[i]}, e["prior"], True,
                       restores=e["prior_restores"] if e["prior"] is not None else ())
        s.L[i - 1] = op.dot if e["prior"] is not None else None
        return "undone"

    def redo(s):
        if s.done == len(s.entries):
            return "empty"
        i = s.done + 1
        e, r = s.entries[i - 1], s.w.reg[s.a]
        below = s.L[i - 1]
        if below is not None and below not in r.sib:
            s.done += 1
            return "skipped"
        if below is None and e["prior"] is not None:
            s.done += 1
            return "skipped"
        names = ({below} if below else set()) | {o.dot for o in r.sib.values() if o.dot[0] == s.a}
        op = s.w._emit(s.a, "set", names, e["value"], False, stamp=e["stamp"])
        s.L[i] = op.dot
        s.done += 1
        return "redone"


class OldUndo:
    """Revision 3: an entry keeps only the dot of its own transaction."""
    def __init__(s, world, actor):
        s.w, s.a, s.entries = world, actor, []

    def edit(s, value):
        prior = s.w.reg[s.a].value()
        op = s.w.edit(s.a, value)
        s.entries.append((op.dot, prior))

    def undo(s):
        dot, prior = s.entries.pop()
        if dot not in s.w.reg[s.a].sib:
            return "skipped"
        s.w._emit(s.a, "retract", {dot}, prior, True)
        return "undone"


# ---- current result ---------------------------------------------------

class Request:
    def __init__(s, rid, order, adopt, seen, result=None, match="match", visible=True):
        s.id, s.order, s.adopt, s.seen = rid, order, adopt, frozenset(seen)
        s.result, s.match, s.visible = result, match, visible


def covers(req, sib):
    if sib.dot in req.seen:
        return True
    return sib.fallback and bool(sib.restores) and sib.restores <= req.seen


def current_result(reg, requests, visible=lambda r: True):
    """Revision 3 of the storyboard and script design, with A17 folded in."""
    in_effect = reg.nonfallback() or reg.fallbacks()
    q = [r for r in requests if r.adopt and r.result and r.match == "match"
         and r.visible and all(covers(r, s) for s in in_effect)]
    if q:
        return max(q, key=lambda r: (r.order, r.id)).result
    d = reg.displayed()
    if d and d.value != NONE and visible(d.value):
        return d.value
    return None


def old_current_result(reg, requests):
    """As the technical design, revision 1, wrote it: S is non-fallback only."""
    s = reg.nonfallback()
    q = [r for r in requests if r.adopt and r.result and r.match == "match"
         and all(x.dot in r.seen for x in s)]
    if q:
        return max(q, key=lambda r: (r.order, r.id)).result
    if s:
        return max(s, key=lambda o: o.stamp).value
    return None


def seen_now(w, actor):
    return {o.dot for o in w.reg[actor].sib.values()}


# ---- checks -----------------------------------------------------------

RESULTS = []


def check(name, got, want):
    ok = got == want
    RESULTS.append(ok)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  got {got!r} want {want!r}"))


def base(actors=("a", "b")):
    w = World(actors + ("c",))
    w.edit("c", 0)                      # the create's value
    w.sync()
    return w


def run():
    # OLD-1: review point 1 reproduced on the revision 3 rule
    w = base(); u = OldUndo(w, "a")
    u.edit(10); u.edit(20)
    r1, r2 = u.undo(), u.undo()
    check("OLD-1 rev 3 undo chain stops at 10 (the reported failure)",
          (r1, r2, w.reg["a"].value()), ("undone", "skipped", 10))

    # T22a: three edits, three undos, three redos, one user
    w = base(); u = UndoChain(w, "a"); seq = []
    for v in (10, 20, 30):
        u.edit(v)
    for _ in range(3):
        u.undo(); seq.append(w.reg["a"].value())
    for _ in range(3):
        u.redo(); seq.append(w.reg["a"].value())
    check("T22a values after each undo and redo", seq, [20, 10, 0, 10, 20, 30])
    d = w.reg["a"].displayed()
    check("T22a one sibling, not a fallback, original stamp of the third edit",
          (len(w.reg["a"].sib), d.fallback, d.stamp), (1, False, u.entries[2]["stamp"]))
    check("T22a converges in every delivery order", w.converges(), True)

    # T22b: Bob writes 7 concurrently with the whole chain (never sees it)
    w = base(); u = UndoChain(w, "a"); seq = []
    for v in (10, 20, 30):
        u.edit(v)
    w.edit("b", 7)                      # b has seen only the create
    w.sync("a")
    for _ in range(3):
        u.undo(); seq.append(w.reg["a"].value())
    check("T22b Bob's value is displayed after each undo", seq, [7, 7, 7])
    check("T22b fallback 0 is kept and Bob's value is the only non-fallback",
          sorted((o.value, o.fallback) for o in w.reg["a"].sib.values()), [(0, True), (7, False)])
    seq = []
    for _ in range(3):
        u.redo(); seq.append(sorted(o.value for o in w.reg["a"].nonfallback()))
    check("T22b each redo returns Alice's value as a sibling of Bob's",
          seq, [[7, 10], [7, 20], [7, 30]])
    check("T22b converges", w.converges(), True)

    # T22c: a remote concurrent write arrives between the undos
    w = base(); u = UndoChain(w, "a")
    for v in (10, 20, 30):
        u.edit(v)
    u.undo()
    w.edit("b", 7); w.sync("a")
    check("T22c after the first undo and Bob's concurrent write", w.reg["a"].value(), 7)
    u.undo(); u.undo()
    check("T22c chain still reaches the fallback 0 under Bob's value",
          sorted((o.value, o.fallback) for o in w.reg["a"].sib.values()), [(0, True), (7, False)])
    u.redo(); u.redo(); u.redo()
    check("T22c after three redos", sorted(o.value for o in w.reg["a"].nonfallback()), [7, 30])
    check("T22c converges", w.converges(), True)

    # T22d: Bob sees the state after the first undo and edits (names the fallback)
    w = base(); u = UndoChain(w, "a")
    for v in (10, 20, 30):
        u.edit(v)
    u.undo(); w.sync("b")
    w.edit("b", 50); w.sync("a")
    r = [u.undo(), u.undo()]
    check("T22d later undos are skipped once someone replaced the restored value",
          (r, w.reg["a"].value()), (["skipped", "skipped"], 50))
    check("T22d redo of the entries whose base is gone is skipped",
          ([u.redo(), u.redo(), u.redo()], w.reg["a"].value()), (["skipped"] * 3, 50))

    # T22e: undo, then a new edit, then undo twice
    w = base(); u = UndoChain(w, "a")
    u.edit(10); u.edit(20); u.undo(); u.edit(25)
    seq = [w.reg["a"].value()]
    u.undo(); seq.append(w.reg["a"].value())
    u.undo(); seq.append(w.reg["a"].value())
    check("T22e undo, new edit, undo, undo", seq, [25, 10, 0])

    # T15e still holds
    w = base(); u = UndoChain(w, "a")
    u.edit(10); w.sync("b"); w.edit("b", 20); w.sync("a")
    check("T15e undo after Bob replaced the value", (u.undo(), w.reg["a"].value()), ("skipped", 20))

    # ---- selection ----
    def sel():
        w = World(("a", "b"))
        return w, UndoChain(w, "a")

    # OLD-2: review point 2 reproduced
    w, u = sel()
    u.edit("A"); u.edit("B"); u.undo()
    check("OLD-2 rev 1 function returns no result after undoing a pick (the reported failure)",
          old_current_result(w.reg["a"], []), None)
    w, u = sel()
    old = Request("r0", 1, True, set(), "R0")
    u.edit("A"); u.edit("B"); u.undo()
    check("OLD-2 rev 1 function lets an older adopting request win",
          old_current_result(w.reg["a"], [old]), "R0")

    # S58: pick A, pick B, undo, redo; an older adopting request exists
    w, u = sel()
    old = Request("r0", 1, True, set(), "R0")
    u.edit("A"); u.edit("B")
    seq = [current_result(w.reg["a"], [old])]
    u.undo(); seq.append(current_result(w.reg["a"], [old]))
    u.undo(); seq.append(current_result(w.reg["a"], [old]))
    u.redo(); seq.append(current_result(w.reg["a"], [old]))
    u.redo(); seq.append(current_result(w.reg["a"], [old]))
    check("S58 pick A, pick B, undo, undo, redo, redo", seq, ["B", "A", "R0", "A", "B"])

    # S59: pick before the request (the request saw it), adoption, pick, undo, redo
    w, u = sel()
    u.edit("A")
    r = Request("r1", 5, True, seen_now(w, "a"), "R1")
    seq = [current_result(w.reg["a"], [r])]
    u.edit("B"); seq.append(current_result(w.reg["a"], [r]))
    u.undo(); seq.append(current_result(w.reg["a"], [r]))
    u.redo(); seq.append(current_result(w.reg["a"], [r]))
    check("S59 adopted, then pick B, undo returns the adopted result, redo returns B",
          seq, ["R1", "B", "R1", "B"])

    # S60: pick while the request runs, completion, undo
    w, u = sel()
    u.edit("A")
    r = Request("r1", 5, True, seen_now(w, "a"), None)
    u.edit("B")
    r.result = "R1"
    seq = [current_result(w.reg["a"], [r])]
    u.undo(); seq.append(current_result(w.reg["a"], [r]))
    check("S60 pick during the job survives it, undo of the pick lets the adoption apply",
          seq, ["B", "R1"])

    # S61: request created after the undo sees the restored selection
    w, u = sel()
    u.edit("A"); u.edit("B"); u.undo()
    r = Request("r2", 9, True, seen_now(w, "a"), "R2")
    check("S61 request that saw the restored pick adopts", current_result(w.reg["a"], [r]), "R2")
    r.match = "no_match"
    check("S61 without a recorded match the restored pick stays", current_result(w.reg["a"], [r]), "A")

    # S62: concurrent picks, one is undone
    w, u = sel(); ub = UndoChain(w, "b")
    u.edit("A"); w.sync("b")
    u.edit("B"); ub.edit("C"); w.sync()
    both = current_result(w.reg["a"], [])
    u.undo(); w.sync()
    check("S62 concurrent picks, Alice undoes hers",
          (both, current_result(w.reg["a"], []), current_result(w.reg["b"], [])), ("C", "C", "C"))
    check("S62 converges", w.converges(), True)

    # S63: a pick of nothing
    w, u = sel()
    r = Request("r1", 2, True, set(), "R1")
    seq = [current_result(w.reg["a"], [r])]
    u.edit(NONE); seq.append(current_result(w.reg["a"], [r]))
    u.undo(); seq.append(current_result(w.reg["a"], [r]))
    check("S63 empty register, pick of nothing, undo", seq, ["R1", None, "R1"])

    # S64: the displayed pick names a result that is not visible
    w, u = sel()
    u.edit("A")
    check("S64 pick of a deleted result gives no current result",
          current_result(w.reg["a"], [], visible=lambda x: x != "A"), None)

    # S65: same answer on replicas with different delivery orders
    w, u = sel(); ub = UndoChain(w, "b")
    u.edit("A"); w.sync()
    r = Request("r1", 5, True, seen_now(w, "a"), "R1")
    u.edit("B"); ub.edit("C"); u.undo(); ub.undo(); w.sync()
    check("S65 both picks undone concurrently, both replicas agree on the adopted result",
          (current_result(w.reg["a"], [r]), current_result(w.reg["b"], [r]), w.converges()),
          ("R1", "R1", True))

    print(f"{sum(RESULTS)} of {len(RESULTS)} checks passed")
    return all(RESULTS)


if __name__ == "__main__":
    raise SystemExit(0 if run() else 1)
