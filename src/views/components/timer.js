// src/views/components/timer.js — Dựng widget hiển thị đồng hồ đếm ngược hoặc đếm xuôi (thời gian định dạng, cảnh báo sắp hết giờ).
import { h } from '../dom.js';

export function createTimer({
  mode = 'countdown', // 'countdown' | 'countup'
  initialSeconds = 0,
  onExpire = () => {},
  warnAtSeconds = 60,
  dangerAtSeconds = 10,
} = {}) {
  let seconds = initialSeconds;
  let timerId = null;
  let isRunning = false;

  const timeDisplay = h('span', { class: 'ux-timer-text' }, formatSeconds(seconds));
  const root = h('div', { class: 'ux-timer-badge', role: 'timer' },
    h('span', { class: 'ux-timer-icon' }, '⏱'),
    timeDisplay
  );

  function formatSeconds(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const remS = s % 60;
    return `${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
  }

  function updateView() {
    timeDisplay.textContent = formatSeconds(seconds);
    root.classList.toggle('warn', mode === 'countdown' && seconds <= warnAtSeconds && seconds > dangerAtSeconds);
    root.classList.toggle('danger', mode === 'countdown' && seconds <= dangerAtSeconds);
  }

  function tick() {
    if (mode === 'countdown') {
      seconds = Math.max(0, seconds - 1);
      updateView();
      if (seconds <= 0) {
        stop();
        onExpire();
      }
    } else {
      seconds++;
      updateView();
    }
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    updateView();
    timerId = setInterval(tick, 1000);
  }

  function stop() {
    if (!isRunning) return;
    isRunning = false;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function getSeconds() {
    return seconds;
  }

  function setSeconds(newSec) {
    seconds = Math.max(0, newSec);
    updateView();
  }

  return {
    el: root,
    start,
    stop,
    getSeconds,
    setSeconds,
  };
}

