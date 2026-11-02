// src/tts.js — Wrapper mỏng cho Web Speech API (speechSynthesis) (ES module).
import { pickVoice } from './core/ttsvoice.js';
import { toPlain } from './core/richtext.js';

let cachedVoices = [];
let voicesLoadedPromise = null;

export function isSupported() {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

// Đợi danh sách giọng nạp xong (voiceschanged) có timeout
export function getVoicesAsync(timeoutMs = 1500) {
  if (!isSupported()) return Promise.resolve([]);

  const current = window.speechSynthesis.getVoices();
  if (current && current.length > 0) {
    cachedVoices = current;
    return Promise.resolve(current);
  }

  if (voicesLoadedPromise) return voicesLoadedPromise;

  voicesLoadedPromise = new Promise(resolve => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cachedVoices = window.speechSynthesis.getVoices() || [];
        resolve(cachedVoices);
      }
    }, timeoutMs);

    const onVoicesChanged = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        cachedVoices = window.speechSynthesis.getVoices() || [];
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve(cachedVoices);
      }
    };

    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
  });

  return voicesLoadedPromise;
}

export function getVoices() {
  if (!isSupported()) return [];
  const current = window.speechSynthesis.getVoices();
  if (current && current.length > 0) cachedVoices = current;
  return cachedVoices;
}

export function hasVoice(lang = 'en-US') {
  if (!isSupported()) return false;
  const list = getVoices();
  return Boolean(pickVoice(list, lang));
}

export function cancel() {
  if (isSupported()) {
    window.speechSynthesis.cancel();
  }
}

export function speak(text, lang = 'en-US', { rate = 1.0, voiceName = null } = {}) {
  if (!isSupported()) return;

  const plain = toPlain(text);
  if (!plain) return;

  cancel();

  const utterance = new SpeechSynthesisUtterance(plain);
  utterance.rate = Math.max(0.2, Math.min(2.0, rate));

  const list = getVoices();
  const matchedVoice = pickVoice(list, lang, voiceName);
  if (matchedVoice) {
    utterance.voice = matchedVoice;
    utterance.lang = matchedVoice.lang;
  } else {
    utterance.lang = lang;
  }

  window.speechSynthesis.speak(utterance);
}

