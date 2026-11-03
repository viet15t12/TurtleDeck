// src/app/busy.js — Bọc thực thi bất đồng bộ kèm trạng thái busy của ứng dụng

import { notify } from '../views/notify.js';
import { state } from './state.js';
import { render } from './runtime.js';

export async function withBusy(fn) {
  state.busy = true;
  render();
  try {
    return await fn();
  } catch (e) {
    notify('Lỗi: ' + (e?.message || e), 'error');
  } finally {
    state.busy = false;
    render();
  }
}

