// src/views/editor/bulkimport.js — Modal Nhập hàng loạt vào bộ thẻ (GĐ 4)
import { h } from '../dom.js';
import { allowedTypes, itemType } from '../../core/deckkinds.js';
import { normalizeTerm } from '../../core/hash.js';
import { addImportedItems } from '../../core/deckmodel.js';

export function renderBulkImportModal({
  deckKey,
  deck,
  onImportSuccess,
  onClose,
  showToast,
}) {
  const api = window.api;

  let activeTab = 'paste'; // 'paste' | 'file'
  let rawText = '';
  let pickedFilePath = '';
  let pickedFileName = '';
  let format = 'auto'; // 'auto' | 'tsv' | 'csv' | 'quizlet' | 'md-vocab' | 'md-quiz'
  let termSep = '\t';
  let cardSep = '\n';
  let customTermSep = '';
  let customCardSep = '';

  let isPreviewing = false;
  let importResult = null; // { ok, format, items, issues, importId }
  let selectedIds = new Set();

  const deckAllowedTypes = allowedTypes(deck.meta.kind);
  const existingIds = new Set(deck.items.map(it => it.id));
  const existingTerms = new Set(
    deck.items.filter(it => it.term).map(it => normalizeTerm(it.term))
  );

  const backdrop = h('div', {
    class: 'modal-backdrop',
    onclick: ev => { if (ev.target === backdrop) handleCancel(); },
  });

  const dialog = h('div', {
    class: 'modal-dialog modal-large',
    style: 'max-width: 1000px; max-height: 90vh; display: flex; flex-direction: column;',
  });
  backdrop.appendChild(dialog);

  function handleCancel() {
    if (importResult?.importId) {
      api.commitImport({ importId: importResult.importId, selectedIds: [] }).catch(() => {});
    }
    onClose();
  }

  async function runPreview() {
    let textToPreview = rawText;
    let path = undefined;

    if (activeTab === 'file') {
      if (!pickedFilePath) {
        showToast('Vui lòng chọn một tập tin trước.');
        return;
      }
      path = pickedFilePath;
      textToPreview = undefined;
    } else {
      if (!rawText.trim()) {
        showToast('Vui lòng dán nội dung văn bản để nhập.');
        return;
      }
    }

    const effectiveTermSep = termSep === 'custom' ? customTermSep : termSep;
    const effectiveCardSep = cardSep === 'custom' ? customCardSep : cardSep;

    isPreviewing = true;
    renderContent();

    try {
      const res = await api.previewImport({
        text: textToPreview,
        path,
        format,
        options: {
          termSep: effectiveTermSep,
          cardSep: effectiveCardSep,
        },
      });

      if (!res || !res.ok) {
        showToast(res?.error || 'Không thể đọc nội dung nhập.');
        importResult = null;
        selectedIds.clear();
      } else {
        importResult = res;
        selectedIds.clear();

        // Mặc định chọn các mục hợp lệ, không trùng, đúng loại
        for (const it of res.items) {
          const itT = itemType(it);
          const isMismatch = !deckAllowedTypes.includes(itT);
          const isDup = existingIds.has(it.id) || (it.term && existingTerms.has(normalizeTerm(it.term)));
          // Không chọn nếu trùng hoặc khác loại
          if (!isMismatch && !isDup) {
            selectedIds.add(it.id);
          }
        }
      }
    } catch (e) {
      showToast('Lỗi khi xem trước: ' + (e.message || String(e)));
      importResult = null;
      selectedIds.clear();
    } finally {
      isPreviewing = false;
      renderContent();
    }
  }

  async function handlePickFile() {
    try {
      const res = await api.pickImportFile();
      if (!res || res.canceled) return;
      pickedFilePath = res.path;
      pickedFileName = res.path.split(/[/\\]/).pop() || res.path;
      renderContent();
      await runPreview();
    } catch (e) {
      showToast('Không thể chọn tập tin: ' + (e.message || String(e)));
    }
  }

  async function handleCommit() {
    if (!importResult || !importResult.items) return;
    const itemsToImport = importResult.items.filter(it => selectedIds.has(it.id));
    if (itemsToImport.length === 0) {
      showToast('Chưa chọn mục nào để thêm.');
      return;
    }

    try {
      await api.commitImport({
        deckKey,
        importId: importResult.importId,
        selectedIds: Array.from(selectedIds),
      });

      const updatedDeck = addImportedItems(deck, itemsToImport);
      onImportSuccess(updatedDeck, itemsToImport.length);
      onClose();
    } catch (e) {
      showToast('Lỗi khi thêm mục: ' + (e.message || String(e)));
    }
  }

  function renderContent() {
    dialog.innerHTML = '';

    // Head
    const head = h('div', { class: 'modal-head' },
      h('h2', null, 'Nhập hàng loạt vào bộ thẻ'),
      h('button', { class: 'ux-icon-btn', title: 'Đóng (Esc)', onclick: handleCancel }, '✕')
    );
    dialog.appendChild(head);

    // Body scrollable container
    const body = h('div', { style: 'flex: 1; overflow-y: auto; padding: 12px 0;' });
    dialog.appendChild(body);

    // Tabs
    const tabs = h('div', { class: 'segmented', style: 'margin-bottom: 12px;' },
      h('button', {
        class: `ux-btn ${activeTab === 'paste' ? 'primary' : 'ghost'}`,
        onclick: () => { activeTab = 'paste'; renderContent(); },
      }, 'Dán văn bản'),
      h('button', {
        class: `ux-btn ${activeTab === 'file' ? 'primary' : 'ghost'}`,
        onclick: () => { activeTab = 'file'; renderContent(); },
      }, 'Chọn tập tin…')
    );
    body.appendChild(tabs);

    // Tab content
    if (activeTab === 'paste') {
      const pasteWrap = h('div', { style: 'margin-bottom: 12px;' },
        h('textarea', {
          class: 'ux-input',
          style: 'width: 100%; height: 120px; font-family: monospace; resize: vertical;',
          placeholder: 'Dán nội dung CSV, TSV, Quizlet export hoặc Markdown vào đây...',
          value: rawText,
          oninput: ev => { rawText = ev.target.value; },
        })
      );
      body.appendChild(pasteWrap);
    } else {
      const fileWrap = h('div', { style: 'margin-bottom: 12px; display: flex; align-items: center; gap: 8px;' },
        h('button', { class: 'ux-btn', onclick: handlePickFile }, '📁 Chọn file (.csv, .tsv, .txt, .md)…'),
        h('span', { class: 'muted', style: 'font-size: 13px;' }, pickedFileName ? `Đã chọn: ${pickedFileName}` : 'Chưa chọn file nào')
      );
      body.appendChild(fileWrap);
    }

    // Format & Delimiters options
    const optRow = h('div', { style: 'display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; background: var(--c-surface-2, #f5f5f5); padding: 8px 12px; border-radius: 6px;' },
      h('label', { style: 'font-size: 13px; font-weight: 500;' }, 'Định dạng:'),
      h('select', {
        class: 'ux-select',
        value: format,
        onchange: ev => { format = ev.target.value; renderContent(); },
      },
        h('option', { value: 'auto' }, 'Tự nhận diện'),
        h('option', { value: 'tsv' }, 'TSV (Tab-separated)'),
        h('option', { value: 'csv' }, 'CSV (RFC 4180)'),
        h('option', { value: 'quizlet' }, 'Quizlet export'),
        h('option', { value: 'md-vocab' }, 'Markdown từ vựng'),
        h('option', { value: 'md-quiz' }, 'Markdown trắc nghiệm')
      )
    );

    if (format === 'quizlet') {
      optRow.appendChild(h('label', { style: 'font-size: 13px; font-weight: 500; margin-left: 8px;' }, 'Ngăn từ:'));
      optRow.appendChild(h('select', {
        class: 'ux-select',
        value: termSep,
        onchange: ev => { termSep = ev.target.value; renderContent(); },
      },
        h('option', { value: '\t' }, 'Tab'),
        h('option', { value: ',' }, 'Dấu phẩy (,)'),
        h('option', { value: ';' }, 'Chấm phẩy (;)'),
        h('option', { value: 'custom' }, 'Tuỳ ý')
      ));
      if (termSep === 'custom') {
        optRow.appendChild(h('input', {
          class: 'ux-input',
          style: 'width: 60px;',
          value: customTermSep,
          placeholder: 'Dấu',
          oninput: ev => { customTermSep = ev.target.value; },
        }));
      }

      optRow.appendChild(h('label', { style: 'font-size: 13px; font-weight: 500; margin-left: 8px;' }, 'Ngăn thẻ:'));
      optRow.appendChild(h('select', {
        class: 'ux-select',
        value: cardSep,
        onchange: ev => { cardSep = ev.target.value; renderContent(); },
      },
        h('option', { value: '\n' }, 'Xuống dòng'),
        h('option', { value: ';' }, 'Chấm phẩy (;)'),
        h('option', { value: 'custom' }, 'Tuỳ ý')
      ));
      if (cardSep === 'custom') {
        optRow.appendChild(h('input', {
          class: 'ux-input',
          style: 'width: 60px;',
          value: customCardSep,
          placeholder: 'Dấu',
          oninput: ev => { customCardSep = ev.target.value; },
        }));
      }
    }

    optRow.appendChild(h('button', {
      class: 'ux-btn primary sm',
      style: 'margin-left: auto;',
      disabled: isPreviewing,
      onclick: runPreview,
    }, isPreviewing ? 'Đang đọc…' : 'Xem trước'));

    body.appendChild(optRow);

    // Issues list if any
    if (importResult?.issues?.length) {
      const issueBox = h('div', {
        style: 'max-height: 100px; overflow-y: auto; background: var(--c-warn-subtle, #fff8e6); border: 1px solid var(--c-warn, #f59e0b); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 12px;',
      },
        h('strong', null, `Cảnh báo / Ghi chú (${importResult.issues.length}):`),
        h('ul', { style: 'margin: 4px 0 0 16px; padding: 0;' },
          ...importResult.issues.map(iss => h('li', null, `${iss.row ? `[Dòng ${iss.row}] ` : ''}${iss.msg}`))
        )
      );
      body.appendChild(issueBox);
    }

    // Preview Table
    if (importResult?.items) {
      const items = importResult.items;

      // Stats calculation
      let newCount = 0;
      let dupCount = 0;
      let mismatchCount = 0;

      const itemStatuses = items.map(it => {
        const itT = itemType(it);
        const isMismatch = !deckAllowedTypes.includes(itT);
        const isDup = existingIds.has(it.id) || (it.term && existingTerms.has(normalizeTerm(it.term)));

        if (isMismatch) mismatchCount++;
        else if (isDup) dupCount++;
        else newCount++;

        return { item: it, isMismatch, isDup, itType: itT };
      });

      const selectableCount = items.filter(it => deckAllowedTypes.includes(itemType(it))).length;
      const allSelected = selectableCount > 0 && selectedIds.size >= selectableCount;

      const summaryBar = h('div', {
        style: 'display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 13px;',
      },
        h('div', null,
          h('span', null, `Tổng: `), h('strong', null, `${items.length}`),
          h('span', { class: 'muted', style: 'margin-left: 8px;' }, `(Mới: ${newCount}, Trùng: ${dupCount}${mismatchCount ? `, Không khớp: ${mismatchCount}` : ''})`)
        ),
        h('div', null,
          h('span', null, `Đã chọn: `),
          h('strong', { style: 'color: var(--c-primary);' }, `${selectedIds.size}`)
        )
      );
      body.appendChild(summaryBar);

      const tableWrap = h('div', {
        style: 'max-height: 380px; overflow-y: auto; border: 1px solid var(--c-border); border-radius: 6px;',
      });

      const table = h('table', { class: 'ux-table', style: 'width: 100%; font-size: 13px;' });
      tableWrap.appendChild(table);

      const thead = h('thead', null,
        h('tr', null,
          h('th', { style: 'width: 36px; text-align: center;' },
            h('input', {
              type: 'checkbox',
              checked: allSelected,
              onchange: ev => {
                if (ev.target.checked) {
                  for (const entry of itemStatuses) {
                    if (!entry.isMismatch) selectedIds.add(entry.item.id);
                  }
                } else {
                  selectedIds.clear();
                }
                renderContent();
              },
            })
          ),
          h('th', { style: 'width: 36px; text-align: center;' }, '#'),
          h('th', null, 'Thuật ngữ / Câu hỏi'),
          h('th', null, 'Định nghĩa / Đáp án'),
          h('th', { style: 'width: 90px;' }, 'Phiên âm / Loại'),
          h('th', { style: 'width: 70px;' }, 'Từ loại'),
          h('th', null, 'Ví dụ / Giải thích'),
          h('th', { style: 'width: 90px; text-align: center;' }, 'Trạng thái')
        )
      );
      table.appendChild(thead);

      const tbody = h('tbody', null);
      itemStatuses.forEach((entry, idx) => {
        const it = entry.item;
        const isSel = selectedIds.has(it.id);

        let statusBadge = null;
        if (entry.isMismatch) {
          statusBadge = h('span', { class: 'badge warn', title: `Loại ${entry.itType} không phù hợp với bộ thẻ ${deck.meta.kind}` }, 'Khác loại');
        } else if (entry.isDup) {
          statusBadge = h('span', { class: 'badge muted', title: 'Thuật ngữ hoặc ID đã có trong bộ thẻ' }, 'Trùng');
        } else {
          statusBadge = h('span', { class: 'badge ok' }, 'Mới');
        }

        const tr = h('tr', { style: entry.isMismatch ? 'opacity: 0.6;' : '' },
          h('td', { style: 'text-align: center;' },
            h('input', {
              type: 'checkbox',
              checked: isSel,
              disabled: entry.isMismatch,
              title: entry.isMismatch ? 'Không thể thêm vì khác loại với bộ thẻ' : '',
              onchange: ev => {
                if (ev.target.checked) selectedIds.add(it.id);
                else selectedIds.delete(it.id);
                renderContent();
              },
            })
          ),
          h('td', { style: 'text-align: center; color: var(--c-muted);' }, `${idx + 1}`),
          h('td', { style: 'font-weight: 500;' }, it.term || it.question || it.prompt || ''),
          h('td', null, it.definition || (it.choices ? it.choices.map(c => (c.correct ? `[x] ${c.text}` : c.text)).join(', ') : (it.answers ? it.answers.join(' | ') : ''))),
          h('td', { style: 'color: var(--c-muted);' }, it.phonetic || it.type || ''),
          h('td', { style: 'color: var(--c-muted);' }, it.pos || ''),
          h('td', { style: 'color: var(--c-muted); font-size: 12px;' }, it.example || it.explanation || ''),
          h('td', { style: 'text-align: center;' }, statusBadge)
        );
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      body.appendChild(tableWrap);
    }

    // Foot
    const foot = h('div', { class: 'modal-foot', style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;' },
      h('button', { class: 'ux-btn', onclick: handleCancel }, 'Huỷ'),
      h('button', {
        class: 'ux-btn primary',
        disabled: !importResult || selectedIds.size === 0,
        onclick: handleCommit,
      }, `Thêm ${selectedIds.size} mục đã chọn`)
    );
    dialog.appendChild(foot);
  }

  renderContent();
  return backdrop;
}

