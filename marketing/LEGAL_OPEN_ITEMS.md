# Legal Review — Open Items

Adversarial review of `marketing/src/app/{privacy,terms,imprint}/` from a German IT-lawyer perspective. Items below are still open or only partially addressed after the NodeTool B.V. + Hetzner/Supabase update.

Last reviewed: 2026-05-02
Entity assumed: **NodeTool B.V.** (Netherlands), lead DPA = Autoriteit Persoonsgegevens.

---

## Partially fixed

### 1. International transfers (Privacy §8) — still thin
Section 8 is one short paragraph. If Cloud invokes OpenAI / Anthropic / Replicate / Hugging Face / Google from Hetzner servers, those are real US transfers and must be enumerated with:
- recipient country
- transfer mechanism (adequacy decision / SCCs / derogation)
- where to obtain a copy of the safeguards (Art. 13(1)(f), 46(1) GDPR; Schrems II)

**Fix:** rewrite §8 as a list, one row per non-EU recipient, with country + mechanism + "copy available on request to dpo@nodetool.ai".

### 2. DSA obligations for NodeTool Cloud
Imprint has the Art. 11/12 contact point. Still missing in Terms:
- **Art. 17 DSA** — statement of reasons on every restriction (account suspension, content removal, rate-limit lockout)
- **Art. 20 DSA** — internal complaint-handling system, free of charge, decision within reasonable time
- (Once thresholds are crossed) Art. 24 transparency reporting

Cloud is a hosting service under the DSA — these are not optional.

**Fix:** add a new Terms section "Account actions and complaints" covering both.

### 3. Sub-processor list — two placeholders remain
Hetzner + Supabase are now named. Still vague:
- **Email providers** — name the actual one (Postmark / Resend / Mailgun / SES), country, transfer basis.
- **Payment processors** — drop the speculative "if and where paid plans are offered" wording. State actual processor (likely Stripe Payments Europe, Ireland) once Cloud billing is live; until then, remove the row entirely rather than describing future processing.

---

## Still open

### 4. AI providers — controller/processor handwave
Privacy §5.3 still says "independent controller (or processor, where applicable)". Pick one per provider.

For Cloud, the realistic position is: **NodeTool B.V. = controller, AI provider = processor** (you decide purpose and means; provider executes inference for you). That means:
- you need an **AVV / DPA** with each provider you ship in Cloud (OpenAI, Anthropic, Google, Replicate, Hugging Face)
- Privacy §5.3 should reference those AVVs and link to each provider's processor terms

If a specific provider truly acts as independent controller (e.g. user brings their own API key in Studio and the call goes direct from device), label that case separately.

### 5. Terms §13 — governing law inconsistent with B.V.
Currently: "governed by the laws of the Federal Republic of Germany". A Dutch B.V. choosing German law looks like a copy-paste defect and invites § 307 BGB intransparency claims.

**Fix options:**
- (a) Switch to **Dutch law + Amsterdam jurisdiction** (natural for the B.V.)
- (b) Keep German law only if you actually establish a German Niederlassung and disclose it

Either way, draft a clean B2B vs. B2C split. Against EU consumers, Rome I Art. 6 + Brussels I-bis Art. 17–19 make the consumer's home-country mandatory law and forum non-derogable regardless of choice.

### 6. Terms §11 — limitation of liability, AGB structure
Exclusions ("not liable for indirect, incidental, special, consequential, punitive") come **before** the carve-outs. Classic § 309 Nr. 7 BGB / § 307 BGB trap — whole clause can be struck.

**Fix:** restructure as carve-outs first, then exclusions. Order:
1. Unlimited liability for intent and gross negligence
2. Unlimited liability for personal injury (§ 309 Nr. 7a BGB)
3. Liability under Produkthaftungsgesetz unaffected
4. For breach of essential contractual duties (Kardinalpflichten): limited to typical, foreseeable damages
5. All other liability excluded to the extent permitted by law

### 7. Terms §10 — disclaimer of warranties
"As is / as available" + "of any kind, express or implied" is a US construct. Against German consumers it's at best partly enforceable under §§ 327 ff. BGB (digital products since 2022). The statutory-rights save-clause prevents total nullity but doesn't fix § 307 BGB intransparency.

**Fix:** replace blanket "as is" with: explicit Mängelhaftung carve-out for consumers + reasonable B2B disclaimer.

### 8. Privacy §4 — retention of email correspondence vague
"As long as needed … plus statutory retention periods" — name the periods (HGB § 257, AO § 147 = 6 / 10 years for business correspondence). Currently inconsistent with §10 which lists billing 6–10 years but stays silent on email.

### 9. Children — no signup-side enforcement
Privacy §12 says "we do not knowingly collect from under 16". Cloud signup has no age gate. Art. 8 GDPR / Art. 8 AVG / § 21 BDSG expect verifiable parental consent for under-16s.

**Fix:** add an age confirmation checkbox at Cloud signup; mention it in Privacy §12.

### 10. Terms §6 — blanket third-party exclusion
"We are not responsible for outputs, availability, billing or data handling by third parties." For sub-processors **you** selected for Cloud (Hetzner, Supabase, your AI providers) this is unenforceable as a blanket exclusion. You remain controller and contractually responsible.

**Fix:** narrow §6 to third parties the **user** chooses (e.g. their own OpenAI key, third-party MCP server). Keep our processor responsibilities elsewhere.

---

## Smaller fixes (cosmetic / low-risk but worth doing)

- **Plausible wording (§3.2):** "does not collect personal data" → "does not store / retain personal data". IP is personal data per Breyer; transient processing happens but nothing is retained. (Consent itself is not required — § 25 TDDDG doesn't trigger because Plausible neither stores on nor reads from the terminal equipment.)
- **"Encrypted at rest" (§5.5):** name the mechanism (e.g. "AES-256 disk-level encryption via Supabase Postgres + S3-compatible object storage"). Art. 32 expects a description.
- **Last-updated "2 May 2026":** keep accurate; right now it's a future date for some readers.
- **§5.7 payment processors:** remove until billing is actually live, or name Stripe Payments Europe with country + AVV reference.

---

## Priority order to attack next

1. **Terms §10 + §11 + §13 rewrite** — single biggest remaining surface; closes three § 307 BGB / § 309 Nr. 7 BGB / Rome I attacks at once.
2. **AI provider role labelling + AVV references** in Privacy §5.3.
3. **DSA Art. 17 + 20** language in Terms.
4. **§8 transfer table** with each non-EU recipient enumerated.
5. **Email provider** named in §5.7 / §7; payment processor cleaned up.
6. **Children age gate** wired into Cloud signup + Privacy §12.
7. Cosmetic fixes in one pass.

---

## Already closed (for reference)

- § 5 DDG Impressum (full B.V. data, KvK, BTW, directors, phone, DPO, lead DPA, ODR, DSA contact)
- Art. 13(1)(a) controller identity
- DPO published (`dpo@nodetool.ai`)
- Lead supervisory authority named (Autoriteit Persoonsgegevens)
- Hetzner + Supabase Frankfurt named in Privacy §5.5, §5.7, §6, §7
- Plausible / § 25 TDDDG — defensible as drafted (no consent needed); only wording nit remains
