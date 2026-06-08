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

---

## Part 3 — Worked example: Fruita trail riders (the `anycreek` example)

The richest example, chosen to exercise the hard cases. Target query in plain English:

> Contacts where the contact has at least one trip **where the contact is a guest** on that trip and
> that trip's **listing is one of** {Fruita Single Track, Moab Single Track}, and the contact **has
> not been on a trip in 180 days or more**, and **has no upcoming trips**.

### The travel data model

| Schema | Points at | How |
|---|---|---|
| **Customer** (the Contact) | — | rooted schema; own fields (name, email, total trips…) |
| **Transaction** | User, Trip, Listing | by ID; price, dates |
| **Trip** | **booker** (single User), **guests** (User array), Listing (by ID) | name, type, dates |
| **Listing** | — | canonical offerings (Fruita Single Track, Moab Single Track, Vail Downhill MTB…) |

The decisive feature: **Trip points at Contact twice** — once as `booker` (single) and once via
`guests[]` (array). That is the spec's *critical asymmetry*: two inbound back-links to the same
schema. The builder models this as **one `Trips` relationship with two roles**, surfaced as an
editable role chip (see Decisions below).

### Clause-by-clause mapping

| Clause | Fork | Mechanic in the builder |
|---|---|---|
| 1. contact **is a guest** on ≥1 trip | **B — inbound named** (Trip→`guestIds`) | `child` on `schema-trip`, count `at least one`, `roleId: 'guest'` → editable role chip "the contact is a guest ▾" (switchable to booker) |
| 2. that trip's **listing is one of** {…} | **A — outbound single ref** from inside Trip (Trip→`listingId`→Listing) | nested `single_ref` hop into Listing, then `Name is any of {Fruita Single Track, Moab Single Track}` *(per the ratified "nested name condition" decision — not a flat ID picker)* |
| 3. **no trip as guest in last 180 days** | **B**, count `= 0` | second `child` on `schema-trip`, `roleId: 'guest'`, `inclusionMode: none`, nested `tripDate is after "180 days ago"` |
| 4. **no upcoming trips** | **B**, count `= 0` | third `child` on `schema-trip`, `roleId: 'guest'`, `inclusionMode: none`, nested `tripDate is after "today"` |

### Decisions taken for this example

- **Guest vs booker → one relationship with selectable roles.** `CHILD_SCHEMAS` models a single
  `Trips` relationship carrying a `roles` array — `guest` (`guestIds`) and `booker` (`bookerId`).
  The **number of roles drives the UI**, generalizing to any business:
  - **1 role** (Transactions via `customerId`, Policies, Orders) → the link is implicit. Rendered as
    **plain static text** ("this contact is the customer"); no control, no added friction. This is the
    legacy B′ behavior, preserved.
  - **2+ roles** (Trips: guest / booker; or e.g. a Shipment's sender / recipient / signedBy) → the
    role is an **editable dropdown chip** in the sentence: "the contact has at least one Trip where
    **[the contact is a guest ▾]** and …". Clicking it lists every back-link; switching is in-place
    and **preserves the nested conditions**.
  - The picker shows the relationship **once** ("Trips"), not once per role. Role is a property of
    the condition, edited in the block — mirroring how the count quantifier ("at least one ▾") is
    already an in-sentence chip.
- **Listing match → nested name condition** (not a flat record picker). Ratified choice; the listing
  hop reads "that Trip's Listing … where Name is any of …".
- **The role is shown in both surfaces:** the builder block (teal role chip — editable when 2+ roles)
  and the plain-English summary ("…has at least one Trip where the contact is a guest and…"). The
  summary only spells out the role when there's a genuine choice (2+ roles), matching the UI.

### Engine implications to carry forward

- The named-inbound roles (guest via `guestIds`, booker via `bookerId`) are **Fork B with an
  arbitrary named foreign key** — the open question flagged in Part 1. This example assumes that's in
  scope. Confirm the segment compiler's `foreignKeyPath` can target a named array/single back-ref, not
  only the implicit userId (B′). The role model means a single relationship can compile to *different*
  `foreignKeyPath`s depending on the selected role.
- Clause 2 keeps outbound-ref-with-nested-conditions (the unified-frame proposal from Part 2).
