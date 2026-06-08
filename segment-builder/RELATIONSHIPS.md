# Reference & relationship conditions — permutation set + mockup audit

This file has two parts:

1. **The spec** — a shared vocabulary (from the relationship-permutations review) for how a
   reference between two resource schemas can show up in a condition builder. Surface-agnostic.
2. **The audit** — how *this* Sentence-mode mockup (`segment-builder/`) currently maps onto that
   spec, what's ambiguous, and what changed.

---

## Part 1 — The spec

> Two schemas only — `Contact` and `Event` — are enough to exercise every case.

### The two example schemas

| Schema | Field | Field type | Points at | Demonstrates |
|---|---|---|---|---|
| **Contact** | `primaryEvent` | single ref (`$ref`) | Event | Outbound named, **single** |
| **Contact** | `futureEvents` | array ref (`items.$ref`) | Event | Outbound named, **array** |
| **Contact** | `pastEvents` | array ref (`items.$ref`) | Event | A *second* outbound edge to the same schema |
| **Event** | `host` | single ref (`$ref`) | Contact | Inbound named, **single** source field |
| **Event** | `attendees` | array ref (`items.$ref`) | Contact | Inbound named, **array** source field |
| **Event** | `userId` | designated user-id field | Contact | Inbound **unnamed** |

`Contact` is the schema the segment is rooted on. `Event` is the related resource.

### Two axes, one structural fork

- **Cardinality** — does the reference field hold *one* ID (single) or *many* (array)? A property of **the field**.
- **Mode** — *who owns the link, and is it named?* Three values: **outbound named**, **inbound named**, **inbound unnamed (userId)**.

The axis that changes the **UI shape** is a structural fork inside "mode":

> **Fork A — the Contact owns the field (outbound).** Filter on a value the Contact itself holds.
> Flat field condition: pick target record(s) or test existence. *No nested conditions on the target, no counts.*
>
> **Fork B — the other schema owns the link (inbound).** Filter on *related records*. Nested block:
> a **count quantifier** + **sub-conditions on the Event's own fields**. The `related_resource` /
> `foreignKeyPath` path. Inbound-named and inbound-unnamed are both Fork B — they differ only in
> whether the back-link is a declared `$ref` or the hidden `userId`.

Fork A vs Fork B is the single most important disambiguation. They read similarly in English
("events…") but are completely different controls.

### Permutation matrix

**A. Outbound named** — Contact owns a `$ref` to Event. Match the Contact's own reference field
against specific Event(s). Picker resolves the Event's **display name**.

| | Single (`primaryEvent`) | Array (`futureEvents`) |
|---|---|---|
| **Reads as** | "Primary event **is** / **is any of** [Event ▾]" | "Future events **contains** / **contains any of** [Event ▾]" |
| **Operators** | `EQUALS`, `IN`, `EXISTS`, `NOT_EXISTS` | `ARRAY_CONTAINS` (+ existence); `EQUALS`/`IN` match the set |
| **Value control** | single/multi picker of Event records | multi picker of Event records |
| **Nested Event conditions?** | ❌ No — identity/existence only | ❌ No |

No literal "contains" for a *single* ref — that word is array-only (`ARRAY_CONTAINS`). Single refs use
`EQUALS`/`IN` → say "is / is any of"; reserve "contains" for arrays.

Same-target-twice outbound (`futureEvents` *and* `pastEvents` → Event) is **not** ambiguous — each
is its own labeled field.

**B. Inbound named** — Event owns a `$ref` back to Contact (`host`, `attendees`). Engine:
`related_resource` with `foreignKeyPath` = that field + `CountOperator` + nested conditions.

| | Single source (`Event.host`) | Array source (`Event.attendees`) |
|---|---|---|
| **Reads as** | "Has [**at least 1** / **no** / **exactly N** ▾] Events where **host is this contact** *and* […]" | "Has […] Events where **this contact is among attendees** *and* […]" |
| **Count quantifier** | `CountOperator`: `GTE 1`, `EQ 0`, `EQ/GT/LT/LTE N` | same |
| **Nested Event conditions?** | ✅ Yes | ✅ Yes |
| **Disambiguate by source field** | ✅ "via host" | ✅ "via attendees" |

**B′. Inbound unnamed (userId)** — same UI *shape* as B, but exactly **one** such link and it's
**implicit** (the "where Event's `userId` is this contact" clause is hidden). This is what's
supported today as "related resources."

| | (cardinality not user-visible) |
|---|---|
| **Reads as** | "Has [**at least 1** / **no** / **exactly N** ▾] Events where […]" — *no "via …" clause* |
| **Engine** | `related_resource`, `foreignKeyPath` = userId field, "self" implicit |
| **Disambiguation** | None — one userId link per schema |

**The one-line B vs B′ difference the UI must make legible:** B says "…where **host** is this
contact and…" (you chose a named link); B′ says "…where…" (link assumed). A frame silent on this is
ambiguous.

### The critical asymmetry

- **Outbound (A):** two edges (`futureEvents`, `pastEvents`) → **no ambiguity** (distinct named fields).
- **Inbound (B):** two edges (`host`, `attendees`) → **must disambiguate by source field**. Show each
  inbound edge separately ("…where host is this contact" vs "…among attendees"), not collapsed to
  "referenced by Event." The inbound list is keyed by *source field*, not *source schema*.

### Current reality vs open questions

**Supported today:**
- Fork A, single and array (matched against Event IDs, display-name picker). ✅
- Fork B′, userId-based "Contact has [N] Events where…" + counts + nested conditions. ✅

**Open / likely-proposed — flag, don't assume:**
- **Fork B with an arbitrary named `$ref`** as the foreign key ("Events where `host` is this
  contact"). Engine's `foreignKeyPath` allows it; whether the *builder UI* lets a user pick a named
  back-ref (vs only the hidden userId) is a current-vs-proposed line. **Is B in scope, or only B′?**
- **Nested conditions on the target in Fork A.** Today outbound is identity/existence only. A frame
  showing "futureEvents where Event.status = active" *redefines* outbound to behave like Fork B — a
  real semantic change, not a styling choice.

### Self-review checklist (per frame)

1. **Fork:** A (Contact owns the field — flat value match) or B (related records — count + nested)?
   Control shape must match (picker vs nested block).
2. **Cardinality:** single or array? Operator label match (`is`/`is any of` single; `contains`/`contains any of` array)?
3. **Mode (Fork B only):** named ("…where host is this contact") or unnamed/userId ("…where…")? Link phrase present-or-absent on purpose?
4. **Inbound disambiguation:** if inbound, labeled by **source field** (host vs attendees), not just schema?
5. **Current vs proposed:** supported today, or a proposed extension (named inbound `$ref`, or nested conditions on an outbound ref)? Label it.
6. **Display names:** wherever a target record is picked, show resolved display name, not raw ID.

---

## Part 2 — Audit of this mockup

The mockup's data model (`js/data.js`) maps to the spec like so:

| Mockup construct | Example | Spec fork |
|---|---|---|
| `LINKED_REFS` cardinality `one` | `primaryLocation`, `accountManager` | **A — outbound named, single** |
| `LINKED_REFS` cardinality `many` | `events` ("Events attended") | **A — outbound named, array** |
| `SCHEMA_LINKED_REFS` (nested) | Transaction → `eventIds` | **A — outbound named, from a nested context** |
| `CHILD_SCHEMAS` (`foreignKeyPath`) | Transactions, Policies, Orders, Trips | **B′ — inbound unnamed** (back-link `customerId` assumed) |

### Findings against the checklist

1. **Fork (most important).** ⚠️ The mockup renders **all** related picks — outbound `linked-ref`
   (single + array) *and* inbound `child` — through the same `renderRelatedSentence` block with an
   inline count/inclusion quantifier and nested `where…` conditions. That gives outbound refs (Fork A)
   the **Fork B control shape**. Per the spec this is the proposed-extension case ("nested conditions
   on the target in Fork A") — legitimate to show, but it must be *declared as proposed*, not silently
   blended with B. **This mockup intentionally proposes the unified nested frame for both forks.** See
   the decision note below.

2. **Cardinality.** ⚠️ Single (`single_ref`) and array (`array_ref`) outbound refs differ only in the
   quantifier phrasing, not in operator vocabulary. The spec wants "is / is any of" for single and
   "contains / contains any of" for array. The mockup does not surface those operator labels on
   outbound refs (it skips straight to nested conditions).

3. **Mode (B vs B′).** ✅/⚠️ The mockup only models **B′** (inbound unnamed — `CHILD_SCHEMAS` with an
   implicit `customerId` back-link, rendered "…where…" with no "via" clause). It does **not** model
   **B** (named inbound `$ref` with a "via host" selector). Consistent with "B′ only," but the mockup
   doesn't make the absence explicit.

4. **Inbound disambiguation.** N/A in the current data — each child schema has a single
   `foreignKeyPath`, so there's no two-inbound-edges-to-same-schema case to disambiguate. If B (named
   inbound) is ever added, the per-source-field labeling rule applies.

5. **Current vs proposed.** ⚠️ The mockup does not visually distinguish supported-today (Fork A flat
   match, Fork B′ counts) from proposed (unified nested frame for Fork A). This doc is the declaration.

6. **Display names.** ✅ Target records are referenced by display name (`displayName`,
   `targetSchemaName`), never raw ID.

### Decision (ratified)

**Keep the unified nested frame for both forks, declared as a proposed extension.**

Outbound refs (Fork A — e.g. "Primary location", "Events attended") intentionally use the same rich
`renderRelatedSentence` block as inbound related records (Fork B′), including the inline quantifier
and nested `where…` conditions on the target's own fields. This goes beyond today's engine, where
outbound is identity/existence only.

Rationale: a single, consistent "related records" frame is easier to learn than two structurally
different controls, and the nested-on-outbound capability (e.g. "Events attended where type = Fair")
is a deliberate target for the redesign — not an accident. This document is the required declaration
that finding #1 is **proposed**, not a silent ambiguity.

Implications to carry into the wireframe session:
- When this ships, the engine must support nested conditions on an outbound `$ref` target (Fork A
  gains Fork-B mechanics), OR the builder must gate outbound refs to flat match. That is an
  engine-scope question, flagged here, not resolved by the mockup.
- Fork B (named inbound `$ref` with a "via host" selector) remains **out of scope** — the mockup
  models B′ (implicit userId/foreign-key back-link) only.

### What the audit changed in code

No behavioral code changed. The unified-frame behavior was ratified as the intended proposal; this
doc is the declaration the spec's checklist (items #1 and #5) requires.
