import { h } from '../../util/dom';
import { ClassroomReady, type ClassroomStatus } from '../../systems/ClassroomReady';
import { open, closeModal, closeBtn } from './ModalHost';

export function classroomModal() {
  const abort = new AbortController();
  const status = h('p', { role: 'status', 'aria-live': 'polite' }, '수업 자료를 확인하고 있어요.');
  const progress = h('progress', { class: 'classroom-progress', max: '100', value: '0', 'aria-label': '수업 자료 준비 진행률' });
  const size = h('p', { class: 'classroom-size' });
  const start = h('button', { class: 'btn btn-primary', disabled: true }, '자료 다운로드');
  const verify = h('button', { class: 'btn btn-sky' }, '준비 상태 확인');
  const update = (s: ClassroomStatus) => {
    if (abort.signal.aborted) return;
    status.textContent = s.message;
    progress.value = s.total ? Math.round(100 * s.completed / s.total) : 0;
    size.textContent = s.total ? `${s.completed}/${s.total}개 · ${(s.bytes / 1e6).toFixed(1)} / ${(s.totalBytes / 1e6).toFixed(1)}MB · 완주 영상 포함` : '';
    start.disabled = s.state === 'downloading' || s.state === 'unsupported';
    verify.disabled = s.state === 'downloading';
    start.textContent = s.state === 'ready' ? '자료 다시 확인' : s.completed ? '남은 자료 이어 받기' : '수업 자료 다운로드';
  };
  start.onclick = () => { void ClassroomReady.prepare(update, abort.signal).then(update); };
  verify.onclick = () => { void ClassroomReady.verify().then(update); };
  const panel = h('section', { class: 'panel modal modal-md' }, h('h2', { class: 'panel-title sky' }, '수업 준비 · 오프라인'), closeBtn(),
    h('div', { class: 'classroom-status' }, h('p', {}, '인터넷이 연결되어 있을 때 한 번 준비해 주세요. 완료하면 이 브라우저에서 모든 지역을 이용할 수 있어요.'), status, progress, size),
    h('div', { class: 'modal-actions' }, start, verify, h('button', { class: 'btn btn-gray', onclick: () => closeModal() }, '닫기')));
  open(panel, undefined, () => abort.abort());
  void ClassroomReady.inspect().then(update);
}
