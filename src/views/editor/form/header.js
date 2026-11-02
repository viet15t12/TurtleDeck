// src/views/editor/form/header.js — Header điều hướng và popovers của Editor form
import { h } from '../../dom.js';
import { friendlyIssue } from '../../../core/validate.js';
import { mapIssueFieldToPath } from './validation.js';

export function renderHeader({
  headerHost,
  getDeck,
  getItem,
  computeVisibleIssues,
  openHeaderPopover,
  showTechId,
  mobileTab,
  onNavigatePrev,
  onNavigateNext,
  onDuplicate,
  onDelete,
  onChangeMobileTab,
  setOpenHeaderPopover,
  setShowTechId,
  focusFieldByPath,
}) {
  const deck = getDeck();
  const item = getItem();
  if (!item) {
    headerHost.replaceChildren();
    return;
  }

  const items = deck.items || [];
  const idx = items.findIndex(i => i.id === item.id);
  const total = items.length;
  const { headerIssues } = computeVisibleIssues();

  const issuesPopover = openHeaderPopover === 'issues' && headerIssues.length
    ? h('div', {
        class: 'ux-popover',
        style: 'min-width: 260px;',
        onclick: ev => ev.stopPropagation(),
      },
        h('div', { style: 'padding: 4px 10px; font-size: 11px; color: var(--c-text-muted); font-weight: 600;' },
          'Bấm để nhảy tới trường cần sửa'),
        headerIssues.map(iss => h('button', {
          type: 'button',
          class: 'ux-popover-item',
          onclick: () => {
            setOpenHeaderPopover(null);
            focusFieldByPath(mapIssueFieldToPath(iss.field, item));
          },
        },
          h('span', { style: `color: ${iss.level === 'error' ? 'var(--c-danger)' : 'var(--c-warn)'}; font-weight: 700;` },
            iss.level === 'error' ? '●' : '▲'),
          h('span', null, friendlyIssue(iss)))))
    : null;

  const morePopover = openHeaderPopover === 'more'
    ? h('div', {
        class: 'ux-popover align-right',
        style: 'min-width: 210px;',
        onclick: ev => ev.stopPropagation(),
      },
        h('button', {
          type: 'button',
          class: 'ux-popover-item',
          onclick: () => { setOpenHeaderPopover(null); onDuplicate(); },
        }, 'Nhân đôi mục (Ctrl+D)'),
        h('button', {
          type: 'button',
          class: 'ux-popover-item danger',
          onclick: () => { setOpenHeaderPopover(null); onDelete(); },
        }, 'Xoá mục này'),
        h('div', { class: 'ux-popover-sep' }),
        h('button', {
          type: 'button',
          class: 'ux-popover-item',
          onclick: () => {
            setShowTechId(!showTechId);
          },
        }, showTechId ? '▾ Thông tin kỹ thuật' : '▸ Thông tin kỹ thuật'),
        showTechId ? h('div', {
          style: 'padding: 4px 10px 6px; font-size: 11px; font-family: var(--font-mono); color: var(--c-text-muted); user-select: text;',
        }, `Mã mục: ${item.id}`) : null
      )
    : null;

  const mobileTabsEl = onChangeMobileTab
    ? h('div', { class: 'form-mobile-tabs' },
        h('div', { class: 'ux-segmented sm' },
          h('button', {
            type: 'button',
            class: `ux-seg-btn ${mobileTab !== 'preview' ? 'active' : ''}`,
            onclick: () => onChangeMobileTab('form'),
          }, 'Soạn'),
          h('button', {
            type: 'button',
            class: `ux-seg-btn ${mobileTab === 'preview' ? 'active' : ''}`,
            onclick: () => onChangeMobileTab('preview'),
          }, 'Xem trước')))
    : null;

  headerHost.replaceChildren(
    h('div', { class: 'form-nav-group' },
      h('button', {
        type: 'button',
        class: 'ux-icon-btn',
        disabled: idx <= 0,
        title: 'Mục trước (Alt+↑)',
        onclick: onNavigatePrev,
      }, '◀'),
      h('span', null, `Mục ${idx + 1}/${total}`),
      h('button', {
        type: 'button',
        class: 'ux-icon-btn',
        disabled: idx >= total - 1,
        title: 'Mục tiếp theo (Alt+↓)',
        onclick: onNavigateNext,
      }, '▶')),
    h('div', { style: 'display: flex; align-items: center; gap: 8px; position: relative;' },
      headerIssues.length ? h('div', { style: 'position: relative;' },
        h('button', {
          type: 'button',
          class: `ux-chip ${headerIssues.some(i => i.level === 'error') ? 'danger' : 'warn'}`,
          onclick: ev => {
            ev.stopPropagation();
            setOpenHeaderPopover(openHeaderPopover === 'issues' ? null : 'issues');
          },
        }, `⚠ ${headerIssues.length} vấn đề`),
        issuesPopover) : null,
      mobileTabsEl),
    h('div', { style: 'position: relative;' },
      h('button', {
        type: 'button',
        class: 'ux-icon-btn',
        title: 'Tác vụ khác',
        onclick: ev => {
          ev.stopPropagation();
          setOpenHeaderPopover(openHeaderPopover === 'more' ? null : 'more');
        },
      }, '⋮'),
      morePopover)
  );
}

