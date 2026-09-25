# Serein Evaluation

This document gives the full context of the Serein evaluation: what it
measures, why it exists, its parts, how to run it, how to score it and how to
report it. Read it before you run or change the evaluation.

## 1. What it measures

An agent gets [BRIEF.md](BRIEF.md) and builds a 26-second launch film with
the NodeTool timeline harness only. The evaluation measures two things at
once:

1. **The film.** How close the result is to the brief, and how good it looks.
   This gives the score.
2. **The harness.** Which engine and tool features work, fail or need a
   workaround. This gives the defect log and the coverage table.

A low score means little without the defect log. The log tells you whether
the harness or the agent lost the points. The main product of each run is
therefore the list of harness defects, ranked by the points they cost.

## 2. Background

### The earlier benchmark

The first benchmark was the NodeTool sizzle, in `demo/benchmarks/sizzle/`. An
agent rebuilt a Remotion video from a frame-exact recipe, and a judge compared
the rebuild with the reference video frame by frame. It taught four lessons.

- **L1. A pixel reference ties the score to the reference's toolchain.** The
  sizzle reference drew the product UI inside its own Remotion window. The
  harness tool `render_demo_surface` draws the same UI through another
  wrapper, with an opaque background and other panel layouts. The best rebuild
  scored 0.943. About 0.05 of the loss came from that wrapper difference, not
  from the timeline engine or the agent. Serein has no reference video and no
  product surfaces. The brief is the reference, and the engine draws every
  pixel.
- **L2. SSIM does not measure a correct video.** A solid-colour frame scored
  0.755 against the reference. A 1% scale error scored 0.929, and a one-frame
  shift 0.966. So SSIM measured geometry and grain. Serein uses agent judges
  on labelled images.
- **L3. Judges vary.** Two judges on the same film differed by up to 0.02. On
  one film, one judge passed it and the other failed it. Serein uses two
  judges, and a third when they disagree (section 6).
- **L4. The builder must not judge its own work.** Self-grades were too kind.
  A judge must be a fresh agent with no build context.

### Engine behaviour found by the sizzle rebuild

BRIEF.md section 8 lists twelve behaviours and defects (D1–D12), for example
the missing weight 500, keyframe easing on the incoming segment, blur sigma
r/3 and the flipped rotation sign. Some of them may be fixed by the time you
run this evaluation. The builder records again every one that still happens.

## 3. Parts

All files are in `demo/benchmarks/serein/`.

| File | Owner | Purpose |
|---|---|---|
| `BRIEF.md` | fixed | The task and the reference: scenes, timing, design system, checkpoints. |
| `EVAL.md` | fixed | This document. |
| `JUDGE.md` | fixed | The judge rubric, the report format and the score formula. |
| `score.sh` | fixed | Automatic checks G1 and G2. |
| `sheets.sh` | fixed | Makes the judge images. |
| `build.js` | builder | The build source. |
| `DEFECTS.md` | builder | The harness defects with repros. |
| `COVERAGE.md` | builder | Worked, workaround or failed for each feature. |
| `runs/<date>-<label>/` | scorer | The results of one run (section 7). |

The film has no audio. The pinned input is the Inter fonts that the engine
has built in. The evaluation needs
`ffmpeg`, `ffprobe` and `jq` on the scoring machine.

## 4. Roles

A run has three roles. Each role is a separate agent session.

| Role | Reads | Does | Must not |
|---|---|---|---|
| Builder | BRIEF.md, EVAL.md, JUDGE.md, the harness docs | Builds the film with the NodeTool MCP tools. Writes `build.js`, `DEFECTS.md` and `COVERAGE.md`. | Change the fixed files, the engine or the tools. Use another renderer for the picture. |
| Scorer | Everything | Runs `score.sh` and `sheets.sh`, starts the judges, combines the results, writes the run report. | Grade the picture. |
| Judge (×2 or ×3) | JUDGE.md, BRIEF.md sections 5, 6 and 10, and the images | Grades the images and writes `judge.jsonl`. | Read the build files, the defect log or the builder's messages. |

The scorer can be the same session that asked for the build, but not the
builder. The judges must be fresh agents with image input.

## 5. Procedure

Run from the repository root.

1. **Pin the version.** Record the commit hash of `demo/benchmarks/serein/`
   and the NodeTool server commit. A result is valid only for those versions.
2. **Build.** Give BRIEF.md to a builder session. Wait for
   `demo/out/serein-launch.mp4` and the three builder files.
3. **Run the automatic checks.**

   ```bash
   demo/benchmarks/serein/score.sh demo/out/serein-launch.mp4 | tee <run>/score.txt
   ```

4. **Make the images.**

   ```bash
   demo/benchmarks/serein/sheets.sh demo/out/serein-launch.mp4 <run>/sheets
   ```

5. **Judge.** Start two judge agents at the same time with the prompt in
   section 8. Each writes `<run>/judge-a.jsonl` or `<run>/judge-b.jsonl`.
6. **Score.** Run the jq command from JUDGE.md on each file. Apply the rules
   in section 6.
7. **Report.** Write `<run>/RESULTS.md` with the template in section 7.

## 6. Pass rule

A film passes when all of these are true:

1. `score.sh` exits 0: G1 format and G2 hard cuts both pass.
2. The mean picture score of the judges is 0.90 or more.
3. No judge gives a checkpoint `spec` 0 or a craft point 0.

**Third judge.** Start a third judge when the two picture scores differ by
more than 0.03, or when they fall on different sides of 0.90. Then use the
median of the three scores. Report every judge's score. Never choose the best
run.

**Automatic checks:**

| Check | Pass condition | Why |
|---|---|---|
| G1 format | 1920×1080, 30/1 fps, exactly 780 frames. | The brief fixes the format. |
| G2 hard cuts | Cuts found at 123, 245, 615, 642 and 668, each within ±1 frame, with `scdet` threshold 12. Other detected cuts are listed but not scored. | The cuts must land on the beat grid. |

`score.sh` was checked on two inputs. A black 780-frame video passed G1 and
failed G2 (0 of 5 cuts). An unrelated 977-frame video failed both checks.

## 7. Run report

Write `demo/benchmarks/serein/runs/<date>-<label>/RESULTS.md`:

```markdown
# Serein run <date> <label>

- Brief commit: <hash>. Server commit: <hash>.
- Builder: <model>. Judges: <model> ×<n>.
- Timeline: <id>. Export asset: <id>.

## Result: PASS or FAIL

| Check | Result |
|---|---|
| G1 / G2 | pass / pass |
| Judge A picture (checkpoints, motion, craft) | 0.93 (0.95, 0.88, 0.90) |
| Judge B picture | … |
| Mean picture | … |

## Lost points by cause

| Cause | Kind | Samples | Points | Defect |
|---|---|---|---|---|
| Glow has a hard edge in export | harness | C4, C15 | 0.02 | DEFECTS.md #3 |
| Headline placed 40 px too high | agent | C8 | 0.01 | – |

## Coverage

<copy of COVERAGE.md summary: n worked, n workaround, n failed>
```

**Attribute each lost point.** A point lost to a behaviour with an entry in
`DEFECTS.md` counts as **harness**. Every other lost point counts as
**agent**. The harness score to track over time is the share of points lost
to harness defects.

## 8. Judge prompt

Use this prompt for every judge. Change only the paths.

> You are a picture judge for a video evaluation. Read
> `demo/benchmarks/serein/JUDGE.md` and follow it exactly. The reference is
> `demo/benchmarks/serein/BRIEF.md`. Read only its sections 5, 6 and 10. The
> images are in `<run>/sheets/`: `checkpoints_1.png`, `checkpoints_2.png`,
> `motion.png` and `overview.png`. Read every image. Grade strictly, and give
> no credit for anything the brief does not ask for. Write the JSON lines to
> `<run>/judge-<x>.jsonl`, then run the jq command from JUDGE.md on that file.
> Do not read any other file and do not change anything. Report the picture
> score, the part scores, and every grade under 2 with its note.

## 9. Calibration

Calibrate the judges once for each new version of the rubric, before you
trust a score. Make two damaged copies of a finished film and judge them like
a real run:

```bash
# Stepped motion: every frame held for 5 frames. Motion (part B) and K1 must drop.
ffmpeg -i serein-launch.mp4 -vf "fps=6,fps=30" -an calib-stepped.mp4
# A black hole over the centre from frame 200 to 700. Checkpoints C5-C14 must fail spec.
ffmpeg -i serein-launch.mp4 -vf "drawbox=x=560:y=240:w=800:h=600:color=black:t=fill:enable='between(n,200,700)'" -an calib-hole.mp4
```

The rubric is sound when both copies score clearly lower than the original,
and the drop falls in the part that each damage targets. Record the three
scores in the run report.

## 10. Limits

- Stills cannot show all motion. The motion strips cover six animations, and
  K1 covers the rest from the overview. A stutter between samples is not seen.
- At sheet size, small UI text is not readable. The judge grades its shape
  and position only.
- The judges are agents, and they vary by about ±0.02. Treat a difference
  under 0.03 between two runs as noise.
- G2 finds only cuts that change the picture strongly. A cut between two dark
  frames can be missed. The sizzle cut at frame 800 was missed this way.
- The brief describes the film in words, so some details allow more than one
  reading. When a judge and the builder read a line differently, fix the
  brief in a new version. Do not argue about the score of the old run.

## 11. Rules

- Do not change BRIEF.md, EVAL.md, JUDGE.md, `score.sh` or `sheets.sh` during
  a run. Change them between runs, in a commit, and record the new hash.
- Do not show a judge the builder's files or messages.
- Report every judge score, including a failing one.
- Do not commit the rendered video. `demo/out/` is ignored by git.
