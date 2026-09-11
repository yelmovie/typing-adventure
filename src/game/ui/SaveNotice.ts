import { SaveSystem } from '../systems/SaveSystem';
import { h } from '../util/dom';

export function installSaveNotice() {
  const message = h('span', {});
  const retry = h('button', { type: 'button', onclick: () => SaveSystem.save() }, '다시 저장');
  const backup = h('button', { type: 'button', onclick: () => {
    const url = URL.createObjectURL(new Blob([SaveSystem.status().state === 'recovered' ? SaveSystem.backup() : JSON.stringify(SaveSystem.get(), null, 2)], { type: 'application/json' }));
    const link = h('a', { href: url, download: 'typing-adventure-backup.json' });
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } }, '기록 파일 보관');
  const notice = h('aside', { class: 'save-notice', role: 'alert', hidden: true }, message, retry, backup);
  document.body.append(notice);
  SaveSystem.subscribe((status) => {
    notice.hidden = status.state === 'saved';
    message.textContent = status.message;
    retry.textContent = status.state === 'recovered' ? '복구한 기록 사용' : '다시 저장';
  });
}
