// src/types/views.d.ts — Khai báo kiểu cho các module view JS khi import từ file TS

declare module '*/views/dom.js' {
  export function fileName(p?: string | null): string;
  export function h(tag: string, attrs?: any, ...children: any[]): HTMLElement;
}

declare module '../dom.js' {
  const content: any;
  export = content;
}

declare module '../notify.js' {
  const content: any;
  export = content;
}

declare module '../result.js' {
  const content: any;
  export = content;
}

declare module '*views/notify.js' {
  export function notify(msg: string, type?: 'info' | 'warn' | 'error' | 'success', duration?: number): void;
}

declare module '*views/result.js' {
  export function formatNextIntervalText(card: any, now?: number): string;
}
