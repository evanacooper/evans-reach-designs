/* =============================================================================
   BUILDER — state, rendering, picker, menus.
   Sentence mode: every related block reads as a refined plain-English sentence
     <subject> has <quantifier> <noun> where …
   The quantifier ("at least one", "no", "exactly 3"…) is an inline editable
   control, so the language IS the control. Color coding differentiates the
   subject (teal) from traversals to other objects (indigo).
   ========================================================================== */

let state = { groups: [], example: 'fairs' };

const root = document.getElementById('groups-root');
const summaryEl = document.getElementById('summary-text');
const footerHint = document.getElementById('footer-hint');

/* ---------- tiny DOM helper ---------- */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function chip(label, icon, kind) {
  return { label, icon, kind };
}

/* =============================================================================
   RENDER
   ========================================================================== */
function render() {
  root.innerHTML = '';
  const topCtx = {
    fields: CONTACT_FIELDS, parentName: null, subject: true, subjectText: 'the contact',
    refs: null, depth: 0, path: [chip('Contact', ICONS.contact, 'subject')], scope: 'contact',
  };
  state.groups.forEach((group, gi) => {
    if (gi > 0) root.appendChild(connectorEl('AND'));
    root.appendChild(renderGroup(group, gi, topCtx));
  });
  renderSummary();
}

function connectorEl(label) {
  return el('div', 'connector', `<span class="connector-label">${label}</span>`);
}

function renderGroup(group, gi, ctx) {
  const wrap = el('section', 'group');
  wrap.dataset.groupId = group.id;

  const header = el('header', 'group-header');
  header.innerHTML = `
    <div class="group-header-left">
      <strong>Group ${gi + 1}</strong>
      <span>· the contact matches</span>
      <div class="logic-toggle" role="group" aria-label="Group logic">
        <button type="button" aria-pressed="${group.logic === 'and'}" data-logic="and">ALL of</button>
        <button type="button" aria-pressed="${group.logic === 'or'}" data-logic="or">ANY of</button>
      </div>
    </div>
    <div class="group-actions">
      <button type="button" class="icon-btn danger" data-action="delete-group" aria-label="Delete group">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4V3h3v1M5 4.5l.5 8.5h5l.5-8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  header.querySelectorAll('[data-logic]').forEach(btn => {
    btn.addEventListener('click', () => { group.logic = btn.dataset.logic; render(); });
  });
  header.querySelector('[data-action="delete-group"]').addEventListener('click', () => {
    state.groups = state.groups.filter(g => g.id !== group.id);
    if (state.groups.length === 0) state.groups = [{ id: uid(), logic: 'and', conditions: [] }];
    render();
  });
  wrap.appendChild(header);

  const body = el('div', 'group-body');
  group.conditions.forEach((c, ci) => {
    if (ci > 0) body.appendChild(connectorEl(group.logic.toUpperCase()));
    body.appendChild(renderCondition(c, group.conditions, ci, ctx));
  });

  const addRow = el('div', 'add-row');
  addRow.innerHTML = `
    <button type="button" class="add-btn primary" data-action="add-condition">+ Add condition</button>
    <button type="button" class="add-btn" data-action="add-nested">+ Nested ${group.logic === 'and' ? 'OR' : 'AND'} group</button>`;
  addRow.querySelector('[data-action="add-condition"]').addEventListener('click', e => {
    openFieldPicker(e.currentTarget, picked => { group.conditions.push(buildConditionFromPick(picked)); render(); });
  });
  addRow.querySelector('[data-action="add-nested"]').addEventListener('click', () => {
    group.conditions.push({ id: uid(), kind: 'nested', logic: group.logic === 'and' ? 'or' : 'and', conditions: [] });
    render();
  });
  body.appendChild(addRow);

  wrap.appendChild(body);
  return wrap;
}

function renderCondition(c, list, index, ctx) {
  if (c.kind === 'field') return renderFieldRow(c, list, index, ctx);
  if (c.kind === 'nested') return renderNestedGroup(c, list, index, ctx);
  if (c.kind === 'related') return renderRelatedSentence(c, list, index, ctx);
  return el('div', null, 'Unknown condition');
}

/* =============================================================================
   FIELD ROW
   ========================================================================== */
function renderFieldRow(c, list, index, ctx) {
  const fieldOptions = ctx.fields;
  const row = el('div', 'row');

  const fieldBtn = el('button', 'control');
  fieldBtn.type = 'button';
  const currentField = fieldOptions.find(f => f.name === c.field);
  fieldBtn.innerHTML = `<span>${currentField?.label ?? 'Choose field…'}</span><span class="control-caret">▾</span>`;
  fieldBtn.addEventListener('click', () => {
    openMenu(fieldBtn, fieldOptions.map(f => ({ label: f.label, value: f.name, meta: f.type })), val => {
      const picked = fieldOptions.find(f => f.name === val);
      c.field = picked.name; c.fieldType = picked.type;
      const ops = OPERATORS[c.fieldType] ?? OPERATORS.unknown;
      if (!ops.find(o => o.value === c.operator)) c.operator = ops[0].value;
      c.value = []; render();
    });
  });
  row.appendChild(fieldBtn);

  const opBtn = el('button', 'control');
  opBtn.type = 'button';
  const ops = OPERATORS[c.fieldType] ?? OPERATORS.unknown;
  const currentOp = ops.find(o => o.value === c.operator) ?? ops[0];
  opBtn.innerHTML = `<span>${currentOp.label}</span><span class="control-caret">▾</span>`;
  opBtn.addEventListener('click', () => {
    openMenu(opBtn, ops.map(o => ({ label: o.label, value: o.value })), val => { c.operator = val; c.value = []; render(); });
  });
  row.appendChild(opBtn);

  row.appendChild(renderValueInput(c, currentField));

  const del = el('button', 'icon-btn danger');
  del.type = 'button';
  del.setAttribute('aria-label', 'Remove condition');
  del.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  del.addEventListener('click', () => { list.splice(index, 1); render(); });
  row.appendChild(del);
  return row;
}

function renderValueInput(c, fieldInfo) {
  const wrap = el('div');
  if (c.operator === 'exists' || c.operator === 'not_exists') {
    wrap.innerHTML = `<span class="value-novalue">No value needed</span>`;
    return wrap;
  }
  if (c.fieldType === 'boolean') {
    const sel = el('button', 'control'); sel.type = 'button';
    const cur = c.value[0];
    sel.innerHTML = `<span>${cur === true ? 'true' : cur === false ? 'false' : 'Choose…'}</span><span class="control-caret">▾</span>`;
    sel.addEventListener('click', () => openMenu(sel, [{ label: 'true', value: 'true' }, { label: 'false', value: 'false' }], v => { c.value = [v === 'true']; render(); }));
    wrap.appendChild(sel); return wrap;
  }
  if (fieldInfo?.enum && (c.operator === 'equals' || c.operator === 'not_equals')) {
    const sel = el('button', 'control'); sel.type = 'button';
    sel.innerHTML = `<span>${c.value[0] ?? 'Choose…'}</span><span class="control-caret">▾</span>`;
    sel.addEventListener('click', () => openMenu(sel, fieldInfo.enum.map(v => ({ label: v, value: v })), v => { c.value = [v]; render(); }));
    wrap.appendChild(sel); return wrap;
  }
  if (fieldInfo?.enum && c.operator === 'in') {
    const sel = el('button', 'control control-multi'); sel.type = 'button';
    sel.innerHTML = c.value.length === 0
      ? `<span style="color:var(--text-muted)">Choose one or more…</span><span class="control-caret">▾</span>`
      : c.value.map(v => `<span class="control-tag">${v}</span>`).join('') + `<span class="control-caret">▾</span>`;
    sel.addEventListener('click', () => openMenu(sel, fieldInfo.enum.map(v => ({ label: v, value: v, selected: c.value.includes(v) })), v => {
      c.value = c.value.includes(v) ? c.value.filter(x => x !== v) : [...c.value, v]; render();
    }, true));
    wrap.appendChild(sel); return wrap;
  }
  if (c.fieldType === 'date') {
    const input = el('input', 'value-input'); input.type = 'text';
    input.placeholder = relativeOrDatePlaceholder(c.operator);
    input.value = c.value[0] ?? '';
    input.addEventListener('input', () => { c.value = input.value ? [input.value] : []; renderSummary(); });
    wrap.appendChild(input); return wrap;
  }
  if (c.operator === 'in') {
    const input = el('input', 'value-input'); input.type = 'text';
    input.placeholder = 'Comma-separated values';
    input.value = c.value.join(', ');
    input.addEventListener('input', () => { c.value = input.value.split(',').map(s => s.trim()).filter(Boolean); renderSummary(); });
    wrap.appendChild(input); return wrap;
  }
  const input = el('input', 'value-input');
  input.type = c.fieldType === 'number' ? 'number' : 'text';
  input.placeholder = c.fieldType === 'array' ? 'Member to look for' : 'Value';
  input.value = c.value[0] ?? '';
  input.addEventListener('input', () => {
    const v = c.fieldType === 'number' ? Number(input.value) : input.value;
    c.value = input.value === '' ? [] : [v]; renderSummary();
  });
  wrap.appendChild(input); return wrap;
}

/* =============================================================================
   QUANTIFIER CONTROL — the inline editable phrase that drives matching mode
   ========================================================================== */
function quantControlMany(c) {
  const wrap = el('span', 'quant-wrap');
  wrap.style.display = 'inline-flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '5px';

  const btn = el('button', 'quant'); btn.type = 'button';
  btn.innerHTML = `<span>${quantPhrase(c)}</span><span class="control-caret">▾</span>`;
  btn.addEventListener('click', () => {
    openMenu(btn, QUANT_MANY.map(q => ({ label: q.label, value: q.key, selected: q.key === currentQuantKey(c) })), key => {
      const q = QUANT_MANY.find(x => x.key === key);
      c.inclusionMode = q.mode; c.countOperator = q.op;
      if (q.mode === 'none') c.countValue = 0;
      else if (q.mode === 'custom' && (c.countValue == null || c.countValue <= 0)) c.countValue = 2;
      else if (q.mode === 'has') c.countValue = 1;
      render();
    });
  });
  wrap.appendChild(btn);

  if (quantNeedsCount(c)) {
    const num = el('input', 'quant-count'); num.type = 'number'; num.min = 0; num.value = c.countValue;
    num.addEventListener('input', () => { const n = parseInt(num.value, 10); if (!Number.isNaN(n) && n >= 0) c.countValue = n; renderSummary(); });
    num.addEventListener('change', render);
    wrap.appendChild(num);
  }
  return wrap;
}
/* Operator control for an outbound single ref (is / is one of / has / matches…).
   Switching to a different shape resets the value so a stale record list doesn't
   linger behind a "matches" verb (or vice-versa). */
function refOperatorControl(c) {
  const current = REF_OPERATORS.find(o => o.value === c.refOperator) ?? REF_OPERATORS[0];
  const btn = el('button', 'quant'); btn.type = 'button';
  btn.innerHTML = `<span>${current.label}</span><span class="control-caret">▾</span>`;
  btn.addEventListener('click', () => {
    openMenu(btn, REF_OPERATORS.map(o => ({ label: o.label, value: o.value, selected: o.value === current.value })), val => {
      const next = REF_OPERATORS.find(o => o.value === val);
      const prev = REF_OPERATORS.find(o => o.value === c.refOperator) ?? REF_OPERATORS[0];
      c.refOperator = val;
      if (next.shape !== prev.shape) {
        c.refValues = [];          // identity record picks
        c.conditions = [];         // attribute nested conditions
      } else if (!next.multi && (c.refValues?.length > 1)) {
        c.refValues = c.refValues.slice(0, 1); // multi→single: keep first
      }
      render();
    });
  });
  return btn;
}

/* Value control for identity operators — pick target record(s) by display name.
   single (is / is not) → one record; multi (is one of …) → many. */
function refRecordControl(c, refOp) {
  const records = SCHEMA_RECORDS[c.targetSchemaId] ?? [];
  const picked = c.refValues ?? [];
  const btn = el('button', 'control control-multi'); btn.type = 'button';
  const label = picked.length === 0
    ? `<span style="color:var(--text-muted)">${refOp.multi ? 'Choose one or more…' : 'Choose…'}</span>`
    : picked.map(name => `<span class="control-tag">${name}</span>`).join('');
  btn.innerHTML = `${label}<span class="control-caret">▾</span>`;
  btn.addEventListener('click', () => {
    openMenu(btn, records.map(r => ({ label: r.name, value: r.name, selected: picked.includes(r.name) })), name => {
      if (refOp.multi) {
        c.refValues = picked.includes(name) ? picked.filter(x => x !== name) : [...picked, name];
      } else {
        c.refValues = [name];
      }
      render();
    }, refOp.multi);
  });
  return btn;
}

/* =============================================================================
   RELATED BLOCK — sentence + breadcrumb path
   ========================================================================== */
function childCtxFor(c, ctx) {
  const canTraverse = !c.parentSchemaId; // depth limit: only one further hop
  return {
    fields: TARGET_SCHEMA_FIELDS[c.targetSchemaId] ?? [],
    refs: canTraverse ? (SCHEMA_LINKED_REFS[c.targetSchemaId] ?? null) : null,
    parentName: singularize(c.targetSchemaName),
    subject: false,
    subjectText: 'that ' + singularize(c.targetSchemaName),
    depth: ctx.depth + 1,
    path: [...ctx.path, chip(c.targetSchemaName, iconForSchema(c.targetSchemaId, c.targetSchemaName), 'rel')],
    scope: c.targetSchemaId,
  };
}

function renderRelatedSentence(c, list, index, ctx) {
  const block = el('div', 'related-block' + (ctx.depth > 0 ? ' depth-1' : ''));
  const childCtx = childCtxFor(c, ctx);
  const isSingle = c.linkShape === 'single_ref';
  const noun = relNoun(c);
  const subj = subjectFor(ctx);

  /* sentence header with inline quantifier */
  const header = el('div', 'rel-header');
  const icon = el('span', 'rel-icon', iconForSchema(c.targetSchemaId, c.targetSchemaName));
  const sentence = el('span', 'rel-sentence');
  const subjCls = subj.subject ? 'subject-noun' : '';

  const refOp = isSingle ? (REF_OPERATORS.find(o => o.value === c.refOperator) ?? REF_OPERATORS[0]) : null;

  if (isSingle) {
    /* outbound single ref: <subject>'s <noun> <op ▾> [value depends on op shape] */
    sentence.appendChild(el('span', subjCls, subj.text + "'s"));
    sentence.appendChild(el('span', 'noun', noun.singular));
    sentence.appendChild(refOperatorControl(c));
    if (refOp.shape === 'identity') {
      sentence.appendChild(refRecordControl(c, refOp));
    } else if (refOp.shape === 'attribute') {
      sentence.appendChild(document.createTextNode(`${indefinite(c.targetSchemaName)} ${c.targetSchemaName} where…`));
    }
    /* existence shape: nothing further — "…'s Listing has" reads complete */
  } else {
    sentence.appendChild(el('span', subjCls, subj.text));
    sentence.appendChild(document.createTextNode('has'));
    sentence.appendChild(quantControlMany(c));
    const word = quantIsPlural(c) ? noun.plural : noun.singular;
    sentence.appendChild(el('span', 'noun', word));
    /* inline role: "Trip as a guest ▾" — only when the relationship has 2+ roles */
    const roleCtrl = inlineRoleControl(c);
    if (roleCtrl) sentence.appendChild(roleCtrl);
    sentence.appendChild(document.createTextNode('where…'));
  }

  const actions = el('div', 'rel-actions');
  const del = el('button', 'icon-btn danger'); del.type = 'button'; del.setAttribute('aria-label', 'Remove');
  del.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  del.addEventListener('click', () => { list.splice(index, 1); render(); });
  actions.appendChild(del);

  header.append(icon, sentence, actions);
  block.appendChild(header);

  /* Identity / existence single-refs have no nested body — the sentence is the
     whole condition. Only the "many" (child/array) blocks and the attribute
     ("matches") single-ref show nested where-rows. */
  const showsBody = !isSingle || refOp.shape === 'attribute';
  if (!showsBody) return block;

  /* body — where rows */
  const body = el('div', 'rel-body');
  const rows = el('div', 'where-rows');
  c.conditions.forEach((nc, ni) => {
    if (ni > 0) rows.appendChild(connectorEl('AND'));
    rows.appendChild(renderCondition(nc, c.conditions, ni, childCtx));
  });
  body.appendChild(rows);
  body.appendChild(buildWhereAdd(c, childCtx));
  block.appendChild(body);
  return block;
}

/* Resolve the back-link roles available for a related condition (from the
   schema definition it was built from). Returns [] for refs that have no roles
   concept (single_ref / array_ref outbound). */
function rolesForCondition(c) {
  if (c.linkShape !== 'child') return [];
  const schema = CHILD_SCHEMAS.find(s => s.id === c.sourceId);
  return schema?.roles ?? [];
}

/* Inline role control, rendered right after the noun: "Trip as a guest ▾".
   0–1 roles → null (single-role links are implicit, nothing shown). 2+ → an
   editable dropdown folded into the relationship phrase. */
function inlineRoleControl(c) {
  const roles = rolesForCondition(c);
  if (roles.length < 2) return null;
  const current = roles.find(r => r.id === c.roleId) ?? roles[0];

  const wrap = el('span', 'role-inline');
  wrap.appendChild(document.createTextNode('as'));
  const btn = el('button', 'role-chip'); btn.type = 'button';
  btn.innerHTML = `<span>${current.label}</span><span class="control-caret">▾</span>`;
  btn.addEventListener('click', () => {
    openMenu(btn, roles.map(r => ({ label: 'as ' + r.label, value: r.id, selected: r.id === current.id })), id => {
      c.roleId = id; render();
    });
  });
  wrap.appendChild(btn);
  return wrap;
}

function buildWhereAdd(c, childCtx) {
  const addRow = el('div', 'add-row');
  const btn = el('button', 'add-btn'); btn.type = 'button';
  const canTraverse = childCtx.refs && childCtx.refs.length;
  btn.textContent = canTraverse ? '+ Add filter or another hop' : '+ Add filter';
  btn.addEventListener('click', e => {
    if (canTraverse) {
      openWhereFieldPicker(e.currentTarget, childCtx.fields, childCtx.refs, c.targetSchemaId, picked => {
        c.conditions.push(buildConditionFromPick(picked)); render();
      });
    } else {
      const first = childCtx.fields[0];
      if (!first) return;
      const ops = OPERATORS[first.type] ?? OPERATORS.unknown;
      c.conditions.push({ id: uid(), kind: 'field', field: first.name, fieldType: first.type, operator: ops[0].value, value: [] });
      render();
    }
  });
  addRow.appendChild(btn);
  return addRow;
}

/* =============================================================================
   NESTED BOOLEAN GROUP
   ========================================================================== */
function renderNestedGroup(c, list, index, ctx) {
  const block = el('div', 'nested-group');
  block.innerHTML = `
    <header class="nested-group-header">
      <span class="nested-group-title">Nested ${c.logic.toUpperCase()} group · ${ctx.subject ? 'the contact' : 'this record'} matches ${c.logic === 'and' ? 'ALL of' : 'ANY of'}</span>
      <div class="logic-toggle" role="group" aria-label="Nested logic">
        <button type="button" aria-pressed="${c.logic === 'and'}" data-logic="and">ALL of</button>
        <button type="button" aria-pressed="${c.logic === 'or'}" data-logic="or">ANY of</button>
      </div>
      <div class="group-actions" style="margin-left:auto">
        <button type="button" class="icon-btn danger" data-action="delete" aria-label="Delete nested">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
      </div>
    </header>`;
  block.querySelectorAll('[data-logic]').forEach(btn => btn.addEventListener('click', () => { c.logic = btn.dataset.logic; render(); }));
  block.querySelector('[data-action="delete"]').addEventListener('click', () => { list.splice(index, 1); render(); });

  const body = el('div', 'nested-group-body');
  c.conditions.forEach((nc, ni) => {
    if (ni > 0) body.appendChild(connectorEl(c.logic.toUpperCase()));
    body.appendChild(renderCondition(nc, c.conditions, ni, ctx));
  });
  const add = el('div', 'add-row');
  add.innerHTML = `<button type="button" class="add-btn" data-action="add-condition">+ Add condition</button>`;
  add.querySelector('[data-action="add-condition"]').addEventListener('click', e => {
    openFieldPicker(e.currentTarget, picked => { c.conditions.push(buildConditionFromPick(picked)); render(); }, ctx);
  });
  body.appendChild(add);
  block.appendChild(body);
  return block;
}

/* =============================================================================
   PICKER — jargon-free, grouped by "what kind of thing"
   ========================================================================== */
const picker = document.getElementById('field-picker');
const pickerBody = document.getElementById('field-picker-body');
const pickerSearch = document.getElementById('field-picker-search');
let pickerCallback = null;

function openFieldPicker(anchor, callback) {
  pickerCallback = callback;
  positionPopover(picker, anchor);
  picker.hidden = false;
  pickerSearch.value = '';
  pickerSearch.oninput = () => renderPickerBody(pickerSearch.value.trim().toLowerCase());
  renderPickerBody('');
  pickerSearch.focus();
}
/* NOTE: do not null pickerCallback here — option onClicks call closeFieldPicker()
   *before* invoking the callback, so nulling it would drop the pick. The callback
   is replaced on the next openFieldPicker() anyway. */
function closeFieldPicker() { picker.hidden = true; }

function renderPickerBody(query) {
  const m = (s) => !query || s.toLowerCase().includes(query);
  const contactMatches = CONTACT_FIELDS.filter(f => m(f.label) || m(f.name));
  // Direction, not cardinality: outbound = the contact owns the reference field;
  // inbound = another record points back at the contact.
  const outboundRefs = LINKED_REFS.filter(r => m(r.name) || m(r.targetSchemaName));
  const inboundRefs = CHILD_SCHEMAS.filter(s => m(s.name) || m(s.targetSchemaName));

  pickerBody.innerHTML = '';
  if (!contactMatches.length && !outboundRefs.length && !inboundRefs.length) {
    pickerBody.innerHTML = `<div class="popover-empty">Nothing matches "${query}".</div>`;
    return;
  }
  if (contactMatches.length) {
    pickerBody.appendChild(buildPickerGroup("The contact's own details", "Attributes stored directly on the contact", contactMatches.map(f => ({
      label: f.label, desc: typeLabel(f.type), icon: ICONS.contact,
      onClick: () => { closeFieldPicker(); pickerCallback({ kind: 'field', field: f }); },
    }))));
  }
  if (outboundRefs.length) {
    pickerBody.appendChild(buildPickerGroup('Records the contact points to', 'The contact holds a reference to these (outbound)', outboundRefs.map(r => ({
      label: r.name, arrow: r.targetSchemaName, tag: 'outbound', isRel: true, icon: iconForSchema(r.targetSchemaId, r.targetSchemaName),
      onClick: () => { closeFieldPicker(); pickerCallback({ kind: 'linked-ref', ref: r }); },
    }))));
  }
  if (inboundRefs.length) {
    pickerBody.appendChild(buildPickerGroup('Records that point to the contact', 'These reference the contact (inbound)', inboundRefs.map(s => ({
      label: s.name, arrow: s.targetSchemaName, tag: 'inbound', isRel: true, icon: iconForSchema(s.targetSchemaId ?? s.id, s.targetSchemaName),
      onClick: () => { closeFieldPicker(); pickerCallback({ kind: 'child', schema: s }); },
    }))));
  }
}

function typeLabel(t) {
  return { string: 'text', number: 'number', boolean: 'yes / no', date: 'date', array: 'list' }[t] || t;
}

function buildPickerGroup(header, sub, items) {
  const wrap = el('div', 'popover-group');
  wrap.appendChild(el('div', 'popover-group-header', header));
  if (sub) wrap.appendChild(el('div', 'popover-group-sub', sub));
  items.forEach(it => {
    const btn = el('button', 'popover-option' + (it.isRel ? ' is-rel' : '')); btn.type = 'button';
    let meta = '';
    if (it.arrow) meta += `<span style="color:var(--text-muted)">→</span><span style="color:var(--accent-text);font-weight:500">${it.arrow}</span>`;
    if (it.tag) meta += `<span class="opt-tag ${it.tag}">${it.tag}</span>`;
    btn.innerHTML = `
      <span class="opt-ico">${it.icon || ICONS.generic}</span>
      <span class="opt-main"><span class="opt-label">${it.label}</span>${it.desc ? `<span class="opt-desc">${it.desc}</span>` : ''}</span>
      <span class="opt-meta">${meta}</span>`;
    btn.addEventListener('click', it.onClick);
    wrap.appendChild(btn);
  });
  return wrap;
}

function openWhereFieldPicker(anchor, fields, refs, parentSchemaId, callback) {
  pickerCallback = callback;
  positionPopover(picker, anchor);
  picker.hidden = false;
  pickerSearch.value = '';
  pickerSearch.oninput = () => renderWherePicker(pickerSearch.value.trim().toLowerCase(), fields, refs, parentSchemaId);
  renderWherePicker('', fields, refs, parentSchemaId);
  pickerSearch.focus();
}
function renderWherePicker(query, fields, refs, parentSchemaId) {
  const m = (s) => !query || s.toLowerCase().includes(query);
  const fieldMatches = fields.filter(f => m(f.label) || m(f.name));
  const refMatches = (refs || []).filter(r => m(r.name) || m(r.targetSchemaName));
  pickerBody.innerHTML = '';
  if (!fieldMatches.length && !refMatches.length) { pickerBody.innerHTML = `<div class="popover-empty">Nothing matches "${query}".</div>`; return; }
  if (fieldMatches.length) {
    pickerBody.appendChild(buildPickerGroup('Details of this record', null, fieldMatches.map(f => ({
      label: f.label, desc: typeLabel(f.type),
      onClick: () => { closeFieldPicker(); pickerCallback({ kind: 'field', field: f }); },
    }))));
  }
  if (refMatches.length) {
    pickerBody.appendChild(buildPickerGroup('Take one more hop', 'Filter on a record this one links to', refMatches.map(r => ({
      label: r.name, arrow: r.targetSchemaName, tag: 'outbound', isRel: true, icon: iconForSchema(r.targetSchemaId, r.targetSchemaName),
      onClick: () => { closeFieldPicker(); pickerCallback({ kind: 'linked-ref', ref: r, parentSchemaId }); },
    }))));
  }
}

function buildConditionFromPick(pick) {
  if (pick.kind === 'field') {
    const f = pick.field;
    const ops = OPERATORS[f.type] ?? OPERATORS.unknown;
    return { id: uid(), kind: 'field', field: f.name, fieldType: f.type, operator: ops[0].value, value: [] };
  }
  if (pick.kind === 'linked-ref') {
    const r = pick.ref;
    const single = r.cardinality === 'one';
    return {
      id: uid(), kind: 'related', linkShape: single ? 'single_ref' : 'array_ref',
      sourceId: r.id, displayName: r.name, targetSchemaId: r.targetSchemaId, targetSchemaName: r.targetSchemaName,
      ...(single ? { refOperator: 'is', refValues: [] } : { inclusionMode: 'has', countOperator: 'gte', countValue: 1 }),
      ...(pick.parentSchemaId ? { parentSchemaId: pick.parentSchemaId } : {}),
      conditions: [],
    };
  }
  if (pick.kind === 'child') {
    const s = pick.schema;
    return {
      id: uid(), kind: 'related', linkShape: 'child', sourceId: s.id, displayName: s.name,
      targetSchemaId: s.targetSchemaId ?? s.id, targetSchemaName: s.targetSchemaName,
      roleId: s.roles?.[0]?.id, inclusionMode: 'has', countOperator: 'gte', countValue: 1, conditions: [],
    };
  }
  throw new Error('Unknown pick');
}

/* =============================================================================
   MENUS + positioning
   ========================================================================== */
let openedMenu = null;
let openedMenuAnchor = null;
function openMenu(anchor, options, onPick, keepOpen) {
  const sameAnchor = openedMenuAnchor === anchor;
  closeMenu();
  if (sameAnchor) return;   // clicking the same trigger again closes it
  const menu = el('div', 'popover menu');
  const body = el('div', 'popover-body');
  options.forEach(o => {
    const btn = el('button', 'popover-option'); btn.type = 'button';
    btn.setAttribute('aria-selected', o.selected ? 'true' : 'false');
    btn.innerHTML = `<span>${o.label}</span>${o.meta ? `<span class="opt-meta">${o.meta}</span>` : ''}${o.selected ? '<span class="opt-meta">✓</span>' : ''}`;
    btn.addEventListener('click', e => { e.stopPropagation(); onPick(o.value); if (!keepOpen) closeMenu(); });
    body.appendChild(btn);
  });
  menu.appendChild(body);
  document.body.appendChild(menu);
  positionPopover(menu, anchor);
  openedMenu = menu;
  openedMenuAnchor = anchor;
}
function closeMenu() { if (openedMenu) { openedMenu.remove(); openedMenu = null; openedMenuAnchor = null; } }
function positionPopover(elm, anchor) {
  const rect = anchor.getBoundingClientRect();
  const w = elm.offsetWidth || 240;
  elm.style.top = `${rect.bottom + window.scrollY + 5}px`;
  elm.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - w - 12))}px`;
}

document.addEventListener('click', e => {
  if (!picker.hidden && !picker.contains(e.target) && !e.target.closest('[data-action="add-condition"]') && !e.target.closest('.add-btn')) closeFieldPicker();
  // Close the open menu on any click outside it, EXCEPT on its own trigger
  // (the trigger's own handler toggles it). Works for any control class.
  if (openedMenu && !openedMenu.contains(e.target) && !(openedMenuAnchor && openedMenuAnchor.contains(e.target))) closeMenu();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeFieldPicker(); closeMenu(); } });

/* =============================================================================
   SUMMARY
   ========================================================================== */
function renderSummary() {
  const parts = state.groups.map(g => summarizeGroup(g));
  const total = state.groups.reduce((acc, g) => acc + countConditions(g.conditions), 0);
  summaryEl.innerHTML = parts.length === 0 ? 'No conditions yet.'
    : 'Include a contact when ' + parts.join(' <mark>AND</mark> ') + '.';
  footerHint.textContent = total === 0 ? 'Add at least one condition to continue' : `${total} condition${total === 1 ? '' : 's'} defined`;
}
function countConditions(list) {
  return list.reduce((acc, c) => {
    if (c.kind === 'nested') return acc + countConditions(c.conditions);
    if (c.kind === 'related') return acc + 1 + countConditions(c.conditions);
    return acc + 1;
  }, 0);
}

/* =============================================================================
   WIRING
   ========================================================================== */
function loadExample(key) {
  state.groups = EXAMPLES[key]().groups;
  state.example = key;
  const meta = EXAMPLE_META[key];
  if (meta) {
    const sub = document.getElementById('topbar-sub');
    if (sub) sub.textContent = meta.desc;
    const nameInput = document.getElementById('segment-name');
    if (nameInput) nameInput.value = meta.title;
  }
  document.querySelectorAll('.example-link').forEach(b => b.dataset.active = String(b.dataset.example === key));
  render();
}

document.getElementById('add-group').addEventListener('click', () => { state.groups.push({ id: uid(), logic: 'and', conditions: [] }); render(); });
document.querySelectorAll('.example-link').forEach(btn => btn.addEventListener('click', () => loadExample(btn.dataset.example)));

loadExample('fairs');
