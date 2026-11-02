// src/views/editor/form/validation.js — Logic validation UI cho Editor form
import { h } from '../../dom.js';
import { validateItem, friendlyIssue } from '../../../core/validate.js';
import { isBlankNewItem } from '../../../core/deckmodel.js';

export function mapIssueFieldToPath(field, item) {
  if (!field) return item?.type === 'card' ? 'front' : (item?.term ? 'term' : 'question');
  const cm = /^choices\[(\d+)\]$/.exec(field);
  if (cm) return `choices.${cm[1]}`;
  if (/^answer\[\d+\]$/.test(field)) return 'answers.0';
  if (field === 'question') return item?.type === 'card' ? 'front' : (item?.term ? 'term' : 'question');
  if (field === 'choices') return 'choices.0';
  if (field === 'answer' || field === 'answers') {
    return (item?.type === 'single' || item?.type === 'multi') ? 'choices.0' : 'answers.0';
  }
  return field;
}

export function normalizeIssueGroup(field) {
  if (/^answer\[\d+\]$/.test(field)) return 'answer';
  if (field === 'term' || field === 'definition' || field === 'example') return field;
  return field || 'question';
}

export function computeVisibleIssues({
  getItem,
  getAssets,
  isItemTouched,
  getTouchedFields,
}) {
  const item = getItem();
  if (!item) return { allIssues: [], visibleByGroup: new Map(), headerIssues: [] };

  const assetsMap = new Map((getAssets() || []).map(a => [a.name, a]));
  const allIssues = validateItem(item, { assets: assetsMap });
  const itemTouched = isItemTouched(item.id);
  const touchedSet = getTouchedFields(item.id);
  const blank = isBlankNewItem(item);

  if (blank && !itemTouched && touchedSet.size === 0) {
    return { allIssues, visibleByGroup: new Map(), headerIssues: [] };
  }

  const visibleByGroup = new Map();
  const headerIssues = [];

  for (const iss of allIssues) {
    const rawField = iss.field || 'question';
    const group = normalizeIssueGroup(rawField);
    const isFieldChecked =
      itemTouched
      || touchedSet.has(rawField)
      || touchedSet.has(group)
      || (rawField.startsWith('choices[') && touchedSet.has('choices'))
      || touchedSet.has('*');

    if (isFieldChecked) {
      headerIssues.push(iss);
      if (!visibleByGroup.has(rawField)) visibleByGroup.set(rawField, []);
      visibleByGroup.get(rawField).push(iss);
      if (group !== rawField) {
        if (!visibleByGroup.has(group)) visibleByGroup.set(group, []);
        visibleByGroup.get(group).push(iss);
      }
    }
  }

  return { allIssues, visibleByGroup, headerIssues };
}

export function updateValidationUI(bodyHost, visibleByGroup) {
  if (!bodyHost) return;
  bodyHost.querySelectorAll('[data-validate-group]').forEach(slot => {
    const group = slot.getAttribute('data-validate-group');
    const list = visibleByGroup.get(group) || [];
    slot.replaceChildren(
      ...list.map(iss =>
        h('div', { class: `ux-field-msg ${iss.level === 'error' ? 'error' : 'warn'}` },
          friendlyIssue(iss))
      )
    );
  });

  bodyHost.querySelectorAll('[data-validate-input]').forEach(inp => {
    const group = inp.getAttribute('data-validate-input');
    const list = visibleByGroup.get(group) || [];
    const hasErr = list.some(i => i.level === 'error');
    const hasWarn = !hasErr && list.some(i => i.level === 'warn');
    inp.classList.toggle('has-error', hasErr);
    inp.classList.toggle('has-warn', hasWarn);
  });
}

