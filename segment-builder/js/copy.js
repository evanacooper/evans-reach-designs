/* =============================================================================
   COPY / LANGUAGE LAYER
   One mental model: every condition reads as a sentence anchored to a subject.
     · The subject is "the contact" at the top, or "that Transaction" one hop in.
     · A related block reads:  <subject> has <quantifier> <noun> where …
     · A single linked record reads:  <subject>'s <noun> is a <Target> where …
   The quantifier ("at least one", "no", "exactly 3"…) is an editable inline
   control, so the language IS the control.
   ========================================================================== */

function pluralize(name) {
  if (!name) return name;
  if (/(s|x|ch|sh)$/i.test(name)) return name + 'es';
  if (/y$/i.test(name) && !/[aeiou]y$/i.test(name)) return name.slice(0, -1) + 'ies';
  return name + 's';
}
function singularize(name) {
  if (!name) return name;
  if (/ies$/i.test(name)) return name.slice(0, -3) + 'y';
  if (/(s|x|ch|sh)es$/i.test(name)) return name.slice(0, -2);
  if (/s$/i.test(name) && !/ss$/i.test(name)) return name.slice(0, -1);
  return name;
}
function namesOverlap(a, b) {
  if (!a || !b) return false;
  return singularize(a).toLowerCase() === singularize(b).toLowerCase();
}
function indefinite(word) {
  return /^[aeiou]/i.test(word || '') ? 'an' : 'a';
}

/* The noun a related block refers to.
   · single linked record → use the relationship label ("Primary location").
   · many (array/child)   → use the target object name ("Event"/"Events"),
     which is a clean noun and pluralizes correctly (the label is often a
     phrase like "Events attended" that can't be pluralized). */
function relNoun(c) {
  const base = (c.linkShape === 'single_ref')
    ? (c.displayName || c.targetSchemaName)
    : (c.targetSchemaName || c.displayName);
  return { singular: singularize(base), plural: pluralize(base) };
}

/* "many" quantifier menu — maps friendly phrases onto the state model. */
const QUANT_MANY = [
  { key: 'has',  label: 'at least one', mode: 'has',    op: 'gte', count: false },
  { key: 'none', label: 'no',           mode: 'none',   op: 'eq',  count: false },
  { key: 'eq',   label: 'exactly',      mode: 'custom', op: 'eq',  count: true },
  { key: 'gte',  label: 'at least',     mode: 'custom', op: 'gte', count: true },
  { key: 'lte',  label: 'at most',      mode: 'custom', op: 'lte', count: true },
  { key: 'gt',   label: 'more than',    mode: 'custom', op: 'gt',  count: true },
  { key: 'lt',   label: 'fewer than',   mode: 'custom', op: 'lt',  count: true },
];

function currentQuantKey(c) {
  if (c.inclusionMode === 'has') return 'has';
  if (c.inclusionMode === 'none') return 'none';
  return c.countOperator || 'eq';
}
function quantNeedsCount(c) {
  const q = QUANT_MANY.find(q => q.key === currentQuantKey(c));
  return !!(q && q.count);
}
/* Whether the noun after the quantifier should be plural. */
function quantIsPlural(c) {
  if (c.inclusionMode === 'has') return false;       // "at least one Transaction"
  if (c.inclusionMode === 'none') return true;       // "no Transactions"
  return c.countValue !== 1;                          // "exactly 1 Transaction" / "exactly 3 Transactions"
}
/* The phrase shown on the quantifier chip (count value rendered separately). */
function quantPhrase(c) {
  const q = QUANT_MANY.find(q => q.key === currentQuantKey(c));
  return q ? q.label : 'at least one';
}

/* single-ref toggle: is / is not  (or matches / doesn't match when names overlap) */
function singleRefToggle(c) {
  const overlap = namesOverlap(c.displayName, c.targetSchemaName);
  const isNeg = c.inclusionMode === 'none';
  if (overlap) return isNeg ? "doesn't match" : 'matches';
  return isNeg ? 'is not' : 'is';
}
function singleRefMenu(c) {
  const overlap = namesOverlap(c.displayName, c.targetSchemaName);
  return overlap
    ? [{ key: 'has', label: 'matches' }, { key: 'none', label: "doesn't match" }]
    : [{ key: 'has', label: 'is' }, { key: 'none', label: 'is not' }];
}

/* Subject phrasing. ctx.parentName is the singular name of the object one hop up. */
function subjectFor(ctx) {
  if (ctx && ctx.parentName) return { text: 'that ' + ctx.parentName, subject: false };
  return { text: 'the contact', subject: true };
}

/* ---- Plain-text summary (the readback at the bottom) ---- */
function summarizeGroup(g) {
  if (g.conditions.length === 0) return '<em>(empty group)</em>';
  const inner = g.conditions.map(c => summarizeCondition(c, { subjectText: 'the contact', subject: true })).join(` <mark>${g.logic.toUpperCase()}</mark> `);
  return g.conditions.length > 1 ? `(${inner})` : inner;
}

function summarizeCondition(c, ctx) {
  const subj = ctx.subject
    ? `<span class="summary-subject">${ctx.subjectText}</span>`
    : ctx.subjectText;

  if (c.kind === 'field') {
    const label = findFieldLabel(c.field) ?? c.field;
    const op = (OPERATORS[c.fieldType] ?? OPERATORS.unknown).find(o => o.value === c.operator)?.label ?? c.operator;
    if (c.operator === 'exists' || c.operator === 'not_exists') {
      return `<span class="summary-pill">${label}</span> ${op}`;
    }
    const v = c.value.length === 0
      ? '<em>(no value)</em>'
      : c.value.map(x => typeof x === 'string' ? `"${x}"` : x).join(', ');
    return `<span class="summary-pill">${label}</span> ${op} ${v}`;
  }

  if (c.kind === 'nested') {
    const inner = c.conditions.map(nc => summarizeCondition(nc, ctx)).join(` <mark>${c.logic.toUpperCase()}</mark> `);
    return `(${inner})`;
  }

  if (c.kind === 'related') {
    const noun = relNoun(c);
    const childCtx = { subjectText: 'that ' + c.targetSchemaName.replace(/s$/, ''), subject: false, parentName: singularize(c.targetSchemaName) };
    const innerParts = c.conditions.map(nc => summarizeCondition(nc, childCtx));
    const hasRel = c.conditions.some(nc => nc.kind === 'related');
    const innerClause = c.conditions.length
      ? innerParts.join(' AND ')
      : '<em>(no conditions yet)</em>';

    if (c.linkShape === 'single_ref') {
      const op = (typeof REF_OPERATORS !== 'undefined' ? REF_OPERATORS : []).find(o => o.value === c.refOperator) ?? { value: 'is', label: 'is', shape: 'identity' };
      const head = `${subj}'s <span class="summary-pill">${noun.singular}</span>`;
      if (op.shape === 'identity') {
        const vals = (c.refValues ?? []);
        const list = vals.length ? vals.map(v => `"${v}"`).join(', ') : '<em>(nothing chosen)</em>';
        return `${head} ${op.label} ${list}`;
      }
      if (op.shape === 'existence') {
        return `${head} ${op.label}`;   // "…'s Listing has" / "does not have"
      }
      // attribute: matches / does not match → nested where
      return `${head} ${op.label} ${indefinite(c.targetSchemaName)} <strong>${c.targetSchemaName}</strong> where ${innerClause}`;
    }

    // many (child / array_ref)
    const phrase = c.inclusionMode === 'custom'
      ? `${quantPhrase(c)} ${c.countValue}`
      : quantPhrase(c);
    const word = quantIsPlural(c) ? noun.plural : noun.singular;
    const roles = c.linkShape === 'child' ? (CHILD_SCHEMAS.find(s => s.id === c.sourceId)?.roles ?? []) : [];
    const role = roles.find(r => r.id === c.roleId) ?? roles[0];
    const linkClause = (roles.length > 1 && role) ? `<span class="summary-subject">${role.phrase}</span>` : '';
    const body = c.conditions.length
      ? (linkClause ? `${linkClause} AND ${innerClause}` : innerClause)
      : (linkClause || innerClause);
    return `${subj} has ${phrase} <span class="summary-pill">${word}</span> where ${body}`;
  }
  return '';
}

function findFieldLabel(name) {
  const c = CONTACT_FIELDS.find(f => f.name === name);
  if (c) return c.label;
  for (const fields of Object.values(TARGET_SCHEMA_FIELDS)) {
    const m = fields.find(f => f.name === name);
    if (m) return m.label;
  }
  return null;
}

function relativeOrDatePlaceholder(op) {
  switch (op) {
    case 'greater_than': return 'after… (date or "30 days ago")';
    case 'less_than': return 'before… (date or "today")';
    case 'equals_month_day': return 'MM-DD';
    case 'equals_month_day_year': return 'YYYY-MM-DD';
    case 'between_month_day': return 'MM-DD to MM-DD';
    case 'between_month_day_year': return 'YYYY-MM-DD to YYYY-MM-DD';
    default: return 'Date';
  }
}
