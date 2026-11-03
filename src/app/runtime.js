// src/app/runtime.js — Runtime renderer proxy tránh phụ thuộc vòng giữa router và actions

let renderFn = () => {};

export const setRenderer = fn => {
  renderFn = fn;
};

export const render = () => renderFn();

