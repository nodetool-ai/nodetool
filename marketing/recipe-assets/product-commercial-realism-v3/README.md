# A moment before the day: final action edit

The final commercial runs for 13 seconds at 1920×1080 and 24 fps:
four seconds of pouring, the approved four-second portrait, then five seconds
of departure. The two replacement videos were supplied by the user from Dreamina.
The middle shot comes from the earlier Seedance 2.0 generation through Fal.

- [Final commercial](masters/commercial-final-1080p.mp4)
- [Final edit and source hashes](documents/final-edit.json)
- [Editable NodeTool timeline](documents/timeline.json)
- [Timeline validation](evidence/timeline-validation.json)
- [Media probe](evidence/final-probe.json)
- [Final frame sheet](evidence/final-contact.jpg)

The pouring shot shows the liquid accumulating and the stream stopping. The
exit shows the woman walking away from an interior camera through the doorway.
The approved portrait keeps the same source footage, duration and framing.
The [comparison](evidence/approved-middle-comparison.log) measures the normal
encoding difference. Sound comes from the three generated clips, with levels
balanced and short fades at the joins. No music or narration was added.

The [pour reference](references/01-coffee-pour.png) and
[corrected departure reference](references/03-doorway-exit-corrected.png) were
created with Codex's built-in image tool. The earlier front-facing doorway
reference remains as a rejected take. The final video generation was performed
by the user in Dreamina, after the automated upload control failed.

The current recipe points to `/recipes/runs/2026-09-14-photographic-commercial/`.
Earlier 10-second and 11.5-second exports remain available as revision evidence.
The new master is 1080p. It is not described as native 4K.

[Verification results](evidence/final-verification.json) include successful media,
timeline, recipe, marketing type and lint checks. Broader repository checks
remain incomplete because of backend test timeouts, a pre-existing web type
error and validation errors in separate UGC fixtures.
