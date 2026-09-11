# QA — Ecommerce SKU Visual Factory

Status: **partial**.

- Immutable source/entity provenance and true-alpha cutout: PASS.
- Native guided flow SKU-C1–C6: PASS. Exact brief, Commercial, three shots, Olive Travel Cup, 1:1, Photo / Commercial, FAL Flux2Max Edit, and three rendered stills are visible.
- Canonical editable storyboard: PASS, `3b95fdd8e581466382eca86de61cfb1c`.
- Accepted 2048px delivery media: PASS. Direct take attachment is unsupported, so the guide takes and accepted selections are mapped separately.
- Motion: PASS. 6.04 seconds, 1440×1440, silent H.264 yuv420p and silent VP9 verified with `ffprobe`.
- Print: PASS. 4096×4096 fal.ai upscale, labelled as upscaled.
- Listing copy: PASS. Merchant inputs remain explicit.
- Archive: PASS. `masters/catalogue-assets.zip` passes `unzip -t`.
- Recipe card and social preview: PASS at 1600×900 and 1200×630.
- Captures SKU-C0–C10: PASS for file presence and hashes. Recipe-page captures SKU-C1–C7 are lossless 3200×2000 PNGs from a 1600×1000 live UI viewport at 2× density. SKU-C0, SKU-C8, and SKU-C9 remain legacy 1045×768 JPEG bitstreams under `.png` paths, and SKU-C10 remains 370×182; those four are not published on the recipe page.
- Walkthrough: PARTIAL. MP4 H.264 and WebM VP9 are 48 seconds, 1280×720 and silent. The container advertises 30 fps, but 1,320 frames over 48 seconds yields a 27.5 fps average. WebVTT and a 1280×720 poster exist. The corrupt motion poster was deterministically regenerated from the accepted master at 2.0 seconds and now decodes.
- Project rename: UNVERIFIED. The native guide ran in a new project, but the mounted headless API exposes no project identifier or rename operation.
