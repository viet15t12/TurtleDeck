// src/views/exam.js — Dựng và điều phối giao diện làm bài thi thử và xem kết quả chi tiết (Exam mode).
import { h } from './dom.js';
import { createExam, gradeExam, applyExamWrongToSRS } from '../core/exam.js';
import { createTimer } from './components/timer.js';
import { renderMarkdown } from '../core/richtext.js';

export function renderExam(root, { entry, config = {}, progress = {}, onSaveProgress = () => {} }, actions) {
  root.innerHTML = '';
  const deck = entry.deck;

  const exam = createExam({
    deck,
    topic: config.topic || 'all',
    count: config.count || (deck.items || []).length,
    durationMinutes: config.durationMinutes || 30,
  });

  let timer = null;

  function onSubmit() {
    if (timer) timer.stop();
    const result = gradeExam(exam);
    renderResultView(result);
  }

  function renderResultView(result) {
    root.innerHTML = '';

    let addedToSrs = false;
    const addToSrsBtn = result.wrongItems.length > 0 ? h('button', {
      type: 'button',
      class: 'ux-btn primary',
      onclick: () => {
        if (addedToSrs) return;
        const res = applyExamWrongToSRS(result, progress, { deckId: exam.deckId });
        onSaveProgress(res.progress);
        addedToSrs = true;
        addToSrsBtn.textContent = 'Đã đưa vào SRS ✓';
        addToSrsBtn.disabled = true;
      },
    }, `Đưa ${result.wrongItems.length} câu sai vào SRS`) : null;

    const wrongList = h('div', { class: 'exam-wrong-list' });
    result.results.filter(r => !r.isCorrect).forEach((r, idx) => {
      const q = r.question;
      const card = h('div', { class: 'exam-wrong-review-card' },
        h('div', { class: 'exam-q-num' }, `Câu sai ${idx + 1} / ${result.wrongCount}`),
        h('div', { class: 'exam-q-prompt' }),
        h('div', { style: 'margin: 8px 0; color: var(--c-danger);' },
          'Bạn chọn: ',
          h('strong', null, formatUserAnswer(r.userAnswer, q))
        ),
        h('div', { style: 'margin: 8px 0; color: var(--c-success);' },
          'Đáp án đúng: ',
          h('strong', null, formatCorrectAnswer(q))
        ),
        q.explanation ? h('div', { class: 'muted', style: 'margin-top: 8px; font-size: 14px;' },
          'Giải thích: ',
          h('span', null, q.explanation)
        ) : null
      );
      card.querySelector('.exam-q-prompt').innerHTML = renderMarkdown(q.prompt, entry.deckKey);
      wrongList.append(card);
    });

    const resultPage = h('div', { class: 'exam-page' },
      h('div', { class: 'exam-result-summary' },
        h('h1', null, result.passed ? '🎉 Chúc mừng bạn đã đỗ!' : 'Chưa đạt yêu cầu'),
        h('div', { class: `exam-score-big ${result.passed ? 'passed' : 'failed'}` }, `${result.score}%`),
        h('p', { class: 'muted' }, `Đúng ${result.correctCount} / ${result.total} câu (Điểm đạt: 70%)`),
        h('div', { class: 'toolbar', style: 'justify-content: center; margin-top: 24px; gap: 12px;' },
          addToSrsBtn,
          h('button', {
            type: 'button',
            class: 'ux-btn',
            onclick: () => renderExam(root, { entry, config, progress, onSaveProgress }, actions),
          }, 'Thi lại'),
          h('button', {
            type: 'button',
            class: 'ux-btn ghost',
            onclick: () => actions.openDeckView(entry),
          }, 'Về bộ thẻ')
        )
      ),
      result.wrongCount > 0 ? h('h2', { style: 'margin-bottom: 16px;' }, 'Chi tiết các câu sai') : null,
      wrongList
    );

    root.append(resultPage);
  }

  function formatUserAnswer(ans, q) {
    if (ans === undefined || ans === null) return '(Chưa trả lời)';
    if (Array.isArray(ans)) {
      return ans.map(i => q.choices?.[i] || i).join(', ');
    }
    return String(ans);
  }

  function formatCorrectAnswer(q) {
    if (Array.isArray(q.answers)) {
      return q.answers.map(i => {
        const n = Number(i);
        return (!Number.isNaN(n) && q.choices?.[n]) ? (q.choices[n]?.text || q.choices[n]) : i;
      }).join(' | ');
    }
    return String(q.answerDisplay || q.answers || '');
  }

  timer = createTimer({
    mode: 'countdown',
    initialSeconds: exam.durationSeconds,
    onExpire: () => {
      onSubmit();
    },
  });

  const questionCards = exam.questions.map((q, idx) => {
    const card = h('div', { class: 'exam-question-card' },
      h('div', { class: 'exam-q-num' }, `Câu hỏi ${idx + 1} / ${exam.questions.length}`),
      h('div', { class: 'exam-q-prompt' })
    );
    card.querySelector('.exam-q-prompt').innerHTML = renderMarkdown(q.prompt, entry.deckKey);

    if (q.choices && Array.isArray(q.choices)) {
      const isMulti = q.kind === 'multi';
      const choicesList = h('div', { class: 'exam-choices-list' });

      q.choices.forEach((choice, cIdx) => {
        const choiceText = typeof choice === 'string' ? choice : choice?.text || '';
        const inputType = isMulti ? 'checkbox' : 'radio';
        const inputEl = h('input', {
          type: inputType,
          name: `q-${idx}`,
          value: cIdx,
          onchange: () => {
            if (isMulti) {
              const selected = [...choicesList.querySelectorAll('input:checked')].map(i => Number(i.value));
              exam.answers[idx] = selected;
            } else {
              exam.answers[idx] = [cIdx];
            }
          },
        });

        const choiceItem = h('label', { class: 'exam-choice-item' },
          inputEl,
          h('span', null, choiceText)
        );
        choicesList.append(choiceItem);
      });
      card.append(choicesList);
    } else {
      const textInput = h('input', {
        type: 'text',
        class: 'ux-input',
        style: 'width: 100%; max-width: 400px;',
        placeholder: 'Gõ câu trả lời của bạn...',
        oninput: ev => {
          exam.answers[idx] = ev.target.value.trim();
        },
      });
      card.append(textInput);
    }

    return card;
  });

  const page = h('div', { class: 'exam-page' },
    h('header', { class: 'exam-header' },
      h('div', { class: 'exam-header-left' },
        h('button', {
          type: 'button',
          class: 'ux-btn ghost sm',
          onclick: () => {
            if (window.confirm('Bạn có chắc muốn thoát bài thi? Tiến trình bài thi sẽ không được lưu.')) {
              if (timer) timer.stop();
              actions.openDeckView(entry);
            }
          },
        }, '← Thoát'),
        h('h1', { style: 'font-size: 20px; font-weight: 700; margin: 0;' }, deck.meta.title),
        exam.topic !== 'all' ? h('span', { class: 'ux-chip' }, exam.topic) : null
      ),
      h('div', { class: 'exam-header-right' },
        timer.el,
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: () => {
            if (window.confirm('Bạn có chắc chắn muốn nộp bài thi?')) {
              onSubmit();
            }
          },
        }, 'Nộp bài')
      )
    ),
    h('div', { class: 'exam-body' }, ...questionCards)
  );

  root.append(page);
  timer.start();
}

