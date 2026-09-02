# Reputation review flows — investigation & design proposals

Grounded against the monorepo at `conversion-tracking@28f2804` and live DB reads (2 Sep 2026).
Mockup: [`index.html`](./index.html) — 6 clickable screens.

---

## Part 1 — Investigation

### Summary: 5 of your 7 assumptions need correcting

| # | Your assumption | Verdict |
|---|---|---|
| 1 | Four options stored as a mode enum | **Wrong.** No enum, no stored mode. And there are five flows, not four. |
| 2 | All options share one segment | **Half right.** Three share `ALL_USERS`; one uses a distinct order-completion segment. |
| 3 | Internal→Google delay ~1hr, partner-level | **Wrong.** No such delay exists. The handoff is segment membership. |
| 4 | No Google→internal direction | **Correct.** |
| 5 | Name+timestamp matching, quality unknown | **Half right.** Name only, no timestamp. **Now measured: 54%.** |
| 6 | Sequence not visible anywhere | **Correct**, and worse than you thought — channel is implicit. |
| 7 | No funnel in reporting | **Correct.** |

---

### 1. How the flow mode is stored

**There is no mode.** `tenant_reputation_configs`
(`packages/database/src/schema/tenant-reputation-config.ts`) holds only channel sender IDs and
an onboarding timestamp. No flow column.

The active flow is *"which reputation automations are currently active."* `feature_sub_type`
lives on the **template** table (`automation-template.ts:60`), not on `business_automation` — it's
joined in at read time.

The four-option UI is reconstructed **client-side by set-equality**:

```ts
// apps/web/sdk-reach-admin/src/common/components/reputation/review-flow.utils.ts:39
export function findReviewFlowWithMatchingSubtypes(subTypesToMatchOn) {
  const matchingOption = REVIEW_FLOW_OPTIONS.find(option => {
    const sameLength = option.subTypes.length === subTypesToMatchOn.length;
    const sameMembers = option.subTypes.every(s => subTypesToMatchOn.includes(s));
    return sameLength && sameMembers;
  });
  return (matchingOption ?? REVIEW_FLOW_OPTIONS[0]).flow;  // silent fallback
}
```

Three consequences:

- **An unrecognised combination silently displays as "Feedback First, Then Google."** A tenant in
  a state the UI can't name is shown a flow they may not be in.
- **`PRIVATE_ONLY` and `SMART_ROUTING` overlap** on `INTERNAL_REVIEW`, distinguished only by
  whether a second automation is also active.
- **There is a fifth flow you didn't list:** `BOTH_REVIEWS` — "Ask for Both Together," a single
  message offering both at once. It is already non-gating and is the closest existing thing to
  the design you're proposing.

**Migration cost: this is the good news.** There's no enum to migrate because there's no enum.
The work is *adding* explicit config, not converting a column. Existing tenants keep working
because their automations keep working — you backfill a config row from their currently-active
subtypes using the mapping that already exists in `review-flow.constants.ts`.

### 2. Segments — not as shared as you thought

`packages/common/src/services/automation-template/reputation-default-templates.ts`:

| Template | Sub-type | Trigger segment | Cooldown |
|---|---|---|---|
| `internal-feedback` | `INTERNAL_REVIEW` | `ALL_USERS` | 14 d |
| `google-review-post-internal-feedback` | `POST_INTERNAL_REVIEW` | `019be120-…6590` | 90 d |
| `google-review-only` | `GOOGLE_REVIEW` | `ALL_USERS` | 90 d |
| `combined-review-request` | `BOTH_REVIEWS` | `ALL_USERS` | 14 d |

I resolved the mystery UUID against the live DB:

```
019be120-89cf-716c-8db9-a995692b6590 → "segment-users-with-recent-orders" (sql)
  "Users with orders completed within the last 20 hours who have not left a Google review"
```

That matches your description in assumption #2 — and critically, **it has no rating predicate.**
The Goose implementation (`goose-sql-fragments.ts`) filters on `invoiceStatus = 'CONFIRMED'`,
`isInStay = false`, `isVisit = true`, `name != 'temper-test'`, and `r.id IS NULL`. Order
criteria and review-existence only.

**Bug found (filed separately):** lines 236 and 352 of the shared defaults carry
`segmentIds: ['goose-product-reputation-review']` — a Goose-specific slug, in a field typed
`z.array(z.string().uuid())`, inside templates every partner receives.

### 3. The internal→Google delay does not exist

There is no configurable delay and no ~1-hour value anywhere. The handoff is **segment
membership**: submitting feedback puts the customer into `segment-users-with-recent-orders`,
whose entry event triggers the `POST_INTERNAL_REVIEW` automation. Latency is whatever segment
evaluation takes.

The only delay in any template is `WAIT_FOR_DURATION { days: 5 }` — the **initial ask → reminder**
gap, hardcoded identically in all four templates. Not partner-configurable.

So "make the delay configurable" isn't exposing an existing field; it's **introducing an explicit
wait where an emergent one exists.** That's a real change to flow semantics, and it's the
prerequisite for your 24-hour follow-up.

### 4. Review matching — measured

Matching is **exact case-insensitive full-name equality. No timestamp component.**
(`reviews.service.ts:2093 attemptAutoLinkReview` → `partner-user.repository.ts:639`.) It bails on
single-word names and **skips ambiguous multi-matches entirely.** `reviews.partner_user_id` is a
bare nullable FK — **no confidence, method, or provenance column**, so an auto-match and a manual
link are indistinguishable after the fact.

**Measured (live DB):**

| Metric | Value |
|---|---|
| All-time match rate | **31.5%** (1,163 / 3,693) |
| Last 6 months | **54.1%** |
| Best recent months | 66–68% |
| Tenants > 80% match | 8 |
| Tenants < 50% match | 9 |
| **Tenants at exactly 0%** | **3** |

The distribution is **bimodal**, so a global average is the wrong way to think about it.
Suppression (`r.id IS NULL`) works well for some tenants and not at all for others — and today
nothing surfaces which kind a tenant is.

**This gates the design:** at 54%, roughly **half of people who already left a Google review will
be asked again.** That's an annoyance problem, not a compliance problem — but it also means
"stop asking once reviewed" is a weaker promise than the UI implies, which is why the mockup
surfaces per-tenant match rate at the point of configuring.

### 5. Message groups, channels, reminders

A reminder is **an extra action**, not a channel setting: `SEND_COMMUNICATION` →
`WAIT_FOR_DURATION` → `CHECK_SEGMENT_MEMBERSHIP` (bail-out) → `SEND_COMMUNICATION`.

Channels are **parallel column sets** on `communication_groups`, not a channel array. At send
time, a message goes out on **every channel that has both a configured sender and body copy**
(`automation-template.service.ts:2916`).

**Latent bug:** the reputation templates supply a `text` field intended as email fallback. That
field maps to `text_message_body`. So **configuring an SMS sender silently converts every
reputation email into an email + SMS send**, using copy written for email. Nobody chose this.

**Smallest change that makes sequence legible:** make channel an explicit per-message field
rather than inferring it from "is there a body and a sender." That's what unlocks the
sequence view in screen 3 — and it fixes the bug above as a side effect.

### 6. The sentiment-gating surface — it exists, unwired

This is the finding that matters most.

```ts
// packages/common/src/services/business-segments/sql-segments/shared/
//   product-reputation/nine-or-ten-feedback/nine-or-ten-feedback.ts
AND fr.status = 'received'
AND fr.rating >= 9
AND fr.rating <= 10
AND r.id IS NULL
```

A registered SQL segment that selects **only promoters.** And `CHECK_SEGMENT_MEMBERSHIP` is a
functioning gate — `handleNextAction.ts:563` only advances to the next action when the user is in
the segment, so a failed check means the downstream send never fires.

**Wiring `nine-or-ten-feedback` into a Google stream would be textbook review gating, and it
would take one config change.**

Is it live? I checked:

```sql
-- 11 segment_definitions rows match 'nine-or-ten'
-- active automations referencing them in action_data:      0
-- active automations triggered by them:                    0
```

**The machine is built and loaded. It has never fired.** Nothing structural prevents it firing
tomorrow.

Mitigating: rating gating is **not reachable through the declarative condition builder.**
`ConditionFieldEnum` is `['userId','email','phone','firstName','lastName','hipaaConsent']`, and
related-resource conditions key on `partner_resources` JSONB schemas — nothing references
`feedback_requests` or `reviews`. Rating gating requires a hand-written SQL segment. So the
attack surface is engineering-authored segments, not tenant self-service. That's exactly where a
validation guard can catch it.

### 7. The form path — the conditional redirect is new capability

```ts
// packages/shared-types/src/forms.ts
export const onSubmitActionSchema = z.discriminatedUnion('type', [showMessageActionSchema]);
```

A **single-member** discriminated union. No redirect action, no URL action, no threshold, no
conditional fields. And the renderer doesn't even use it — `FormPage.tsx:172` renders a
**hardcoded "Thank You!" card** and never reads `config.on_submit_action.message`.

Rating extraction happens server-side after submit (`extractOverallRating`), but
**`is_overall_rating` is client-supplied** in the POST body rather than re-derived from the
stored form config. Worth hardening if the score is about to drive a redirect.

| Work | Difficulty |
|---|---|
| Conditional post-submit redirect | **Medium** — new action type, new renderer branch, first-ever post-submit navigation |
| Conditional complaint field | **Medium** — form model has no conditional-field concept at all |
| Threshold storage | Easy |
| Trusting the score | **Must fix** — re-derive `is_overall_rating` server-side |

### 8. Reporting today

Two disconnected analytics surfaces, and a scale mismatch that blocks a unified funnel:
`review-analytics.ts` caps rating at **1–5**; `feedback-analytics.ts` uses **1–10**. There is no
funnel, no ask-coverage metric, no per-score-band conversion, and — because there's no
match-provenance column and no suppression event log — **neither ask coverage nor conversion by
score band can be built from current data without a schema change.**

### 9. Data that reframes the design

| Metric | Value | Why it matters |
|---|---|---|
| Feedback requests sent | 9,165 | |
| Responses | 254 | |
| **Response rate** | **2.8%** | The combined flow's branching engages ~3% of customers |
| Score = 10 | **85%** of responses | The threshold moves very few people |
| Scores below 5 | ~4% | The "negative branch" is tiny |
| Scale in use | **Both 1–5 and 1–10** | **A single partner-level threshold integer is not well-defined** |

Two design consequences:

1. **The threshold is a low-leverage setting.** At 85% tens, moving it 9→8 reclassifies almost
   nobody. Worth keeping simple; not worth a rich configuration surface.
2. **`max_stars` is per-form**, so "threshold = 9" is meaningless on a 1–5 form. Either normalize
   to a percentage-of-scale, or scope the threshold to the form's scale. **This needs your
   decision** — see Open Questions.

---

## Part 2 — Design proposals

### Configuration model

Replace inference-from-active-automations with **explicit config + derived automations** —
the inverse of today.

```
tenant_review_config
  business_id                      uuid  pk
  private_feedback_enabled         bool
  google_ask_enabled               bool
  -- combined-mode (meaningful only when both true)
  fast_track_threshold             int          -- 7..10, CHECK constrained
  follow_up_enabled                bool         -- ONE column, both branches
  follow_up_delay_hours            int          -- default 24
  post_review_behavior             enum('stop','private_only')
  post_review_cadence_days         int
  -- per stream
  private_cooldown_days            int
  private_reminder_delay_days      int
  google_cooldown_days             int
  google_reminder_delay_days       int
  -- preset provenance, not a mode
  applied_preset                   text null    -- 'grow'|'fix'|'listen', nulled on manual edit
  graduation_date                  date null
```

The mode is **derived**: `both enabled → combined`, `one → single-stream`, `neither → off`.
There is no mode column to get out of sync with reality.

**The compliance constraint is the schema.** `follow_up_enabled` is one boolean. Per-branch
suppression has no column to live in, so it cannot be expressed, configured, or accidentally
shipped. That's the difference between a guard and a guideline.

**Migration for existing tenants** — no enum conversion, and nobody's behavior changes:

1. Add the table; backfill one row per tenant from currently-active subtypes via the existing
   `REVIEW_FLOW_OPTIONS` mapping. `[INTERNAL_REVIEW, POST_INTERNAL_REVIEW]` → both streams on;
   `[GOOGLE_REVIEW]` → google only; and so on.
2. Seed each field from the values already hardcoded in templates (5 d reminder, 14/90 d
   cooldowns) so the backfill is behavior-preserving by construction.
3. Templates read config instead of literals. Ship behind a flag, config-vs-literal diffed in
   logs before cutover.
4. `BOTH_REVIEWS` tenants map to combined mode with the threshold set so everyone fast-tracks —
   preserving today's single-message behavior until they choose otherwise.

**Unrecognised combinations stop being silently mislabeled** — that class of bug disappears with
the fallback.

### Combined-mode form

1. Score submitted and **persisted first**, unconditionally. It is complete private feedback on
   its own — which is what makes omitting the complaint box from the fast-track branch honest
   rather than a shortcut.
2. Server re-derives the overall rating from stored form config (don't trust the client).
3. `>= threshold` → success + Google CTA + 3s auto-redirect.
4. `< threshold` → success + optional complaint field + **the same Google CTA, same primary
   styling, same width.**
5. Both branches schedule the identical follow-up from the same config field.

Structural enforcement, in priority order:

| Constraint | How it's made impossible |
|---|---|
| Per-branch follow-up | No column exists. Single boolean. |
| Sentiment filtering a Google send | Save-time validation rejects any segment with a `feedback_requests.rating` / complaint / incident predicate on a Google stream — at both partner and tenant layers |
| Asymmetric CTA styling | Both branches render one shared CTA component; styling is not a per-branch prop |
| Asymmetric cooldowns | Cooldown takes a duration and nothing else — no ticket-state or score input |
| Bulk do-not-solicit abuse | Cap per import + required logged reason |

### Reporting (spec — not mocked, per your scope decision)

Funnel per stream: `eligible → sent → delivered → opened → private submitted → Google requested → Google left`.

**Ask coverage** — % of eligible completed visits producing any ask, with suppression reason
codes (`already_reviewed`, `cooldown`, `no_contact_method`, `do_not_solicit`, `consent`). Needs a
**suppression event log** — doesn't exist today.

**Google conversion by score band** — the drift detector. Needs a **score band recorded on the
ask**, which also doesn't exist today. Worth building precisely because it can prove us wrong:
if promoters convert far better than detractors, we've created a friction gap we didn't design,
regardless of what the config says.

Both metrics require schema additions. Neither is derivable retroactively.

---

## Part 3 — Sequencing

Dependency-ordered. The config model gates almost everything.

| # | Work | Size | Notes |
|---|---|---|---|
| 0 | Fix the Goose slug + `text`→SMS leak | **days** | Independent. Real bugs, ship now. |
| 1 | `tenant_review_config` + backfill + templates read config | **~2 weeks** | **Additive migration, not a conversion.** Cheaper than you feared. |
| 2 | Preset picker + per-stream settings UI | **~1 week** | Needs 1 |
| 3 | Explicit per-message channel + sequence view | **~1.5 weeks** | Fixes the SMS leak properly. Mostly independent of 1 |
| 4 | Form: post-submit actions + conditional field + redirect | **~3 weeks** | **Largest single item.** New capability in three places. Independent of 1 |
| 5 | 24h follow-up scheduling from config | **~1 week** | Needs 1 and 4 |
| 6 | Compliance guards (segment validation, DNS cap) | **~1 week** | Needs 1 |
| 7 | Suppression event log + score band on ask | **~1.5 weeks** | Schema additions. Gates all reporting |
| 8 | Funnel + ask coverage + conversion by band | **~2 weeks** | Needs 7 |
| 9 | Match-rate surfacing + linking improvements | **~1 week** | Independent. High value given 54% |

**Roughly a quarter in total.** Weeks: 0, 2, 5, 6, 9. Closer to a month: 4, and the 7+8 pair.

**Is the config model a schema migration?** Yes — but an **additive** one. New table, backfilled
from existing state, no column rewrite, no enum conversion, no destructive step. That's the
single biggest cost difference from what the brief assumed.

**Recommended first slice:** 0 → 1 → 6. That lands the explicit config model *and* the
compliance guards before the form work begins — so the gating machine gets disarmed early rather
than after the surface area grows.

---

## Where the design should change

**1. The threshold needs a scale decision, not just a range.** `max_stars` is per-form and both
1–5 and 1–10 are live. A partner-level integer is undefined across them. Recommend
percentage-of-scale, or scoping the threshold to the form.

**2. The threshold is lower-leverage than the brief implies.** 85% of responses are a 10.
Keep the control minimal.

**3. `BOTH_REVIEWS` already exists and is already non-gating.** "Ask for Both Together" sends one
message offering both, with no score branching. If the goal is minimizing gating risk, this
flow **already achieves it** and needs no form work at all. The combined flow is worth building
for conversion, not for compliance — worth being explicit about, since the combined flow is
where all the complexity and all the risk live.

**4. "Stop asking once reviewed" is weaker than it sounds** at a 54% match rate, and it's
0% for three tenants. Surface per-tenant match rate wherever suppression is promised.

**5. The 24h follow-up is a genuinely new mechanism**, not a tunable. There is no
internal→Google delay today.

---

## Open questions

1. **Threshold across scales** — percentage-of-scale, or per-form? (Blocks the threshold work.)
2. **Should the three at 0% match rate be blocked** from a mode whose value depends on
   suppression, or just warned?
3. **Is `BOTH_REVIEWS` a keeper?** It's the lowest-risk flow and needs no form work. Retire it,
   or promote it as a fourth preset?
4. **Graduation date on "Fix issues first"** — hard stop that auto-enables the Google stream, or
   a prompt? Auto-enabling is safer for compliance (nobody parks indefinitely) but surprising.
5. **Backfilling match provenance** — worth a one-off re-match pass with the current algorithm to
   distinguish auto from manual links, or start recording provenance from here forward only?
