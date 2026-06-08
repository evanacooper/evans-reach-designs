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
| `CHILD_SCHEMAS` with 1 role | Transactions, Policies, Orders | **B′ — inbound, implicit single back-link** |
| `CHILD_SCHEMAS` with 2+ roles | Trips (guest / booker) | **B — inbound named**, role chosen via inline role chip |

**Picker grouping is by direction, not cardinality.** The field picker groups relationships as
"Records the contact points to" (**outbound** — `LINKED_REFS`) vs "Records that point to the contact"
(**inbound** — `CHILD_SCHEMAS`), tagged `outbound` (indigo) / `inbound` (teal). Cardinality (one vs
many) is still a structural property — it sets `single_ref` vs `array_ref` link shape — but it is no
longer the user-facing label, because direction is what determines how the condition behaves
(flat identity match vs count + nested), whereas one-vs-many rarely changes the user's intent.

### Findings against the checklist

1. **Fork (most important).** ✅ Fork A and Fork B now have **distinct control shapes**, resolving the
   earlier ambiguity. Outbound `single_ref` is operator-routed (see #2): its default is a flat
   identity match (`is` / `is one of` → record picker), with nesting available *only* behind an
   explicit `matches` verb. Inbound `child` keeps the count + nested block. The two no longer blend.

2. **Cardinality / operators.** ✅ Outbound single refs carry a `refOperator` with the full verb set —
   **is / is not / is one of / is not one of** (identity record picker), **has / does not have**
   (existence), **matches / does not match** (nested attribute conditions). "is one of" is the array
   analogue of "is". Operator label now matches intent instead of skipping to nested conditions.

3. **Mode (B vs B′).** ✅ The mockup now models **B (named inbound)** via the per-relationship `roles`
   array — each role is a named back-link (`guestIds`, `bookerId`). B′ (single implicit back-link) is
   the degenerate 1-role case. The named link is surfaced as the inline role chip.

4. **Inbound disambiguation.** ✅ Trip has two back-links to Contact (guest / booker). They are
   disambiguated by an **inline role dropdown** ("Trip as a guest ▾"), keyed by role — the spec's
   per-source-field rule, generalized to N roles for any schema pair.

5. **Current vs proposed.** The flat identity match (A) and counts (B′) are supported today. Still
   **proposed / needs engine confirmation:** (a) `matches` — nested conditions on an outbound ref
   target; (b) named inbound foreign keys (guest via `guestIds`, booker via `bookerId`) where the
   compiler's `foreignKeyPath` must accept a named back-ref, and may differ per selected role.

6. **Display names.** ✅ Identity picks resolve target **records** by display name (`SCHEMA_RECORDS`),
   never raw ID.

### What the audit changed in code

The forks were **split**, not unified: outbound refs default to a flat identity match and only nest
behind an explicit `matches` verb; inbound relationships model named roles surfaced as an inline
chip. See the worked example (Part 3) for the concrete mapping.

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
| 1. contact **is a guest** on ≥1 trip | **B — inbound named** (Trip→`guestIds`) | `child` on `schema-trip`, count `at least one`, inline role "Trip **as a guest ▾**" (switchable to booker, folded into the noun phrase) |
| 2. that trip's **listing is one of** {…} | **A — outbound single ref**, identity match (Trip→`listingId`→Listing) | `single_ref` with `refOperator: 'is_one_of'`, `refValues: [Fruita Single Track, Moab Single Track]` — a flat **record picker**, no nested block *(superseded the earlier nested-name approach)* |
| 3. **no trip as guest in last 180 days** | **B**, count `= 0` | second `child` on `schema-trip`, role `guest`, `inclusionMode: none`, nested `tripDate is after "180 days ago"` |
| 4. **no upcoming trips** | **B**, count `= 0` | third `child` on `schema-trip`, role `guest`, `inclusionMode: none`, nested `tripDate is after "today"` |

### Decisions taken for this example

- **Guest vs booker → one relationship with selectable roles.** `CHILD_SCHEMAS` models a single
  `Trips` relationship carrying a `roles` array — `guest` (`guestIds`) and `booker` (`bookerId`).
  The **number of roles drives the UI**, generalizing to any business:
  - **1 role** (Transactions via `customerId`, Policies, Orders) → the link is implicit. Rendered as
    **plain static text** ("this contact is the customer"); no control, no added friction. This is the
    legacy B′ behavior, preserved.
  - **2+ roles** (Trips: guest / booker; or e.g. a Shipment's sender / recipient / signedBy) → the
    role is an **inline dropdown folded into the relationship phrase**: "the contact has at least one
    **Trip as a guest ▾** where …". The role sits with the noun it modifies (not floating in the
    body); clicking it lists every back-link; switching is in-place and **preserves nested conditions**.
  - The picker shows the relationship **once** ("Trips"), not once per role. Role is a property of
    the condition, edited inline — mirroring how the count quantifier ("at least one ▾") is a chip.
- **Outbound ref match → operator-routed.** `single_ref` (and array_ref) carry a `refOperator` that
  splits into three control shapes:
  - **identity** — `is` / `is not` / `is one of` / `is not one of` → a **record picker** of target
    display names (`SCHEMA_RECORDS`). No nested block. *This is the default and what the Listing clause
    uses.*
  - **existence** — `has` / `does not have` → no value.
  - **attribute** — `matches` / `does not match` → the nested "where {conditions on the target's
    fields}" block (e.g. `Listing matches a Listing where Difficulty is hard`).
  Switching shape resets the value so a stale record list can't linger behind a `matches` verb.
- **The role is shown in both surfaces:** the builder block (inline teal role chip — editable when 2+
  roles) and the plain-English summary. The summary spells out the role only when there's a genuine
  choice (2+ roles), matching the UI.

### Engine implications to carry forward

- The named-inbound roles (guest via `guestIds`, booker via `bookerId`) are **Fork B with an
  arbitrary named foreign key** — the open question flagged in Part 1. This example assumes that's in
  scope. Confirm the segment compiler's `foreignKeyPath` can target a named array/single back-ref, not
  only the implicit userId (B′). The role model means a single relationship can compile to *different*
  `foreignKeyPath`s depending on the selected role.
- Clause 2 is now a flat **identity** match (`Listing is one of {…}`), the default for outbound refs.
  The nested-attribute path still exists behind the `matches` verb but is not used here.
