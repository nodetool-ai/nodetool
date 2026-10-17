# UZU drumkit — provenance and license

These 16 one-shots form DR-1's `UZU` factory kit.

- **Upstream:** https://github.com/tidalcycles/uzu-drumkit
- **License:** The Unlicense (public domain dedication)
- **Source revision:** `2f3e05c70ab4d73ad053a1467adec89bd27377a0`
- **Contributors credited upstream:** Mot4i, Switch Angel, and Ludens

| DR-1 slot | Local file | Upstream path |
|---|---|---|
| `UZU BD1` | `UZU_BD1.wav` | `bd/10_bd_switchangel.wav` |
| `UZU BD2` | `UZU_BD2.wav` | `bd/17_bd_switchangel.wav` |
| `UZU SD` | `UZU_SD.wav` | `sd/10_sd_switchangel-bounce-2.wav` |
| `UZU CP` | `UZU_CP.wav` | `cp/10_cp_switchangel.wav` |
| `UZU RIM` | `UZU_RIM.wav` | `rim/10_rim_switchangel.wav` |
| `UZU HH` | `UZU_HH.wav` | `hh/10_hh_switchangel.wav` |
| `UZU OH` | `UZU_OH.wav` | `oh/10_oh_switchangel.wav` |
| `UZU RD` | `UZU_RD.wav` | `rd/10_rd_switchangel.wav` |
| `UZU LT` | `UZU_LT.wav` | `lt/10_lt_mot4i.wav` |
| `UZU MT` | `UZU_MT.wav` | `mt/10_mt_mot4i.wav` |
| `UZU HT` | `UZU_HT.wav` | `ht/10_ht_mot4i.wav` |
| `UZU CR` | `UZU_CR.wav` | `cr/10_cr_switchangel.wav` |
| `UZU PERC` | `UZU_PERC.wav` | `cb/10_perc_switchangel.wav` |
| `UZU SH` | `UZU_SH.wav` | `sh/10_sh_switchangel.wav` |
| `UZU TB` | `UZU_TB.wav` | `tb/10_tb.wav` |
| `UZU MOD` | `UZU_MOD.wav` | `misc/10_misc_switchangel_ludens.wav` |

The source recordings use a mixture of sample rates, bit depths, and mono or
stereo channel layouts. For DR-1's deterministic web/native sample pipeline,
each selected recording was converted with FFmpeg to mono, 44.1 kHz, signed
16-bit PCM. Stereo sources were downmixed equally; no creative processing or
normalization was applied.

The original Unlicense text is preserved verbatim in `LICENSE-UNLICENSE`.
