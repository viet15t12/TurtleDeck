// src/views/editor/form.js — Re-export createFormPane từ form/index.js (tương thích ngược 100%)
export { createFormPane } from './form/index.js';
export { POS_OPTIONS } from './form/constants.js';
export {
  mapIssueFieldToPath,
  normalizeIssueGroup,
  computeVisibleIssues,
  updateValidationUI,
} from './form/validation.js';
export { renderHeader } from './form/header.js';
export { renderVocabSection } from './form/sections/vocab.js';
export { renderCardSection } from './form/sections/card.js';
export { renderQuestionSection } from './form/sections/question.js';
