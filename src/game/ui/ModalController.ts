import { h, clear, fmt, uiImg, icon, type IconName } from '../util/dom';
import { SaveSystem } from '../systems/SaveSystem';
import { AudioManager } from '../systems/AudioManager';
import { navigate } from '../Game';
import { BADGES } from '../data/badges';
import { todayKey, type DailyKind } from '../systems/DailySystem';
import { currentTitle, TITLES, DECORS, unlockMet2 } from '../data/titles';
import { ABOUT, STORY, STUDENT_GUIDE, TEACHER_GUIDE } from '../data/about';
import { ENEMIES } from '../data/enemies';
import { PETS, CHARACTERS, portraitUrl } from '../data/characters';
import { ITEMS } from '../data/items';

const root = () => document.getElementById('modal-root')!;

function open(panel: HTMLElement, onClose?: () => void) {
  const back = h('div', { class: 'modal-backdrop' }, panel);
  back.addEventListener('click', (e) => {
    if (e.target === back) close(onClose);
  });
  clear(root());
  root().appendChild(back);
  const first = panel.querySelector<HTMLElement>('button, input');
  first?.focus();
  return back;
}

export function closeModal() {
  clear(root());
}
function close(onClose?: () => void) {
  closeModal();
  onClose?.();
}

function closeBtn(onClose?: () => void) {
  return h('button', { class: 'modal-close', 'aria-label': '닫기', onclick: () => { AudioManager.sfx('click'); close(onClose); } }, '✕');
}

export function alertModal(title: string, body: string | HTMLElement, okText = '확인'): Promise<void> {
  return new Promise((resolve) => {
    const panel = h(
      'div',
      { class: 'panel modal' },
      h('div', { class: 'panel-title' }, title),
      h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); close(resolve); } }, okText)),
    );
    open(panel, resolve);
  });
}

export function confirmModal(title: string, body: string, okText = '예', cancelText = '아니요'): Promise<boolean> {
  return new Promise((resolve) => {
    const panel = h(
      'div',
      { class: 'panel modal' },
      h('div', { class: 'panel-title' }, title),
      h('div', { class: 'modal-body' }, body),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn btn-primary', onclick: () => { AudioManager.sfx('click'); closeModal(); resolve(true); } }, okText),
        h('button', { class: 'btn btn-red', onclick: () => { AudioManager.sfx('click'); closeModal(); resolve(false); } }, cancelText),
      ),
    );
    open(panel, () => resolve(false));
  });
}

/** 설정 모달: BGM / 효과음 / 화면 흔들림 / 키보드 가이드 / 초기화 */
export function settingsModal(opts: { onReset?: () => void } = {}) {
  const s = SaveSystem.get().settings;
  const row = (label: string, key: keyof typeof s) => {
    const t = h('div', { class: `toggle ${s[key] ? 'on' : ''}`, role: 'switch', 'aria-checked': String(s[key]) });
    t.addEventListener('click', () => {
      const v = !SaveSystem.get().settings[key];
      SaveSystem.setSettings({ [key]: v });
      t.classList.toggle('on', v);
      t.setAttribute('aria-checked', String(v));
      AudioManager.applySettings();
      AudioManager.sfx('click');
    });
    return h('div', { class: 'setting-row' }, h('span', {}, label), t);
  };
  const slider = (label: string, key: 'bgmVolume' | 'sfxVolume') => {
    const input = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round((s[key] ?? 0.7) * 100)), class: 'vol', 'aria-label': label }) as HTMLInputElement;
    const val = h('span', { class: 'vol-val' }, `${input.value}%`);
    input.addEventListener('input', () => {
      SaveSystem.setSettings({ [key]: Number(input.value) / 100 });
      val.textContent = `${input.value}%`;
      AudioManager.applySettings();
    });
    input.addEventListener('change', () => AudioManager.sfx('click'));
    return h('div', { class: 'setting-row' }, h('span', {}, label), h('div', { class: 'vol-wrap' }, input, val));
  };
  const cleared = SaveSystem.get().progress.clearedStages.includes('stage_5');
  const panel = h(
    'div',
    { class: 'panel modal modal-sm' },
    h('div', { class: 'panel-title purple' }, icon('settings'), '설정'),
    closeBtn(),
    h(
      'div',
      { class: 'settings-body' },
      row('배경 음악', 'bgm'),
      slider('　　볼륨', 'bgmVolume'),
      row('효과음', 'sfx'),
      slider('　　볼륨', 'sfxVolume'),
      row('화면 흔들림', 'screenShake'),
      row('키보드 가이드', 'showKeyboardGuide'),
    ),
    h(
      'div',
      { class: 'setting-links' },
      h('button', { class: 'btn btn-sm btn-sky', onclick: () => { AudioManager.sfx('click'); guideModal('student'); } }, icon('book'), ' 학생 가이드'),
      h('button', { class: 'btn btn-sm btn-purple', onclick: () => { AudioManager.sfx('click'); guideModal('teacher'); } }, icon('book'), ' 교사용 가이드'),
      h('button', { class: 'btn btn-sm btn-gray', onclick: () => { AudioManager.sfx('click'); storyModal('prologue'); } }, '프롤로그 다시보기'),
      h('button', { class: `btn btn-sm btn-gray ${cleared ? '' : 'disabled'}`, onclick: () => { if (!cleared) { toast('어둠의 성채를 밝히면 열려요'); return; } AudioManager.sfx('click'); storyModal('ending'); } }, cleared ? icon('star_on') : icon('lock'), ' 엔딩 다시보기'),
      h('button', { class: 'btn btn-sm btn-gold', onclick: () => { AudioManager.sfx('click'); aboutModal(); } }, '정보·크레딧'),
    ),
    h(
      'div',
      { class: 'modal-actions' },
      h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); closeModal(); } }, '확인'),
      h(
        'button',
        {
          class: 'btn btn-red btn-md',
          onclick: async () => {
            AudioManager.sfx('click');
            closeModal();
            const ok = await confirmModal('전체 초기화', '모든 진행 기록과 설정이 지워져요.\n정말 처음부터 다시 시작할까요?');
            if (ok) {
              SaveSystem.reset();
              opts.onReset?.();
            }
          },
        },
        '기록 초기화',
      ),
    ),
  );
  open(panel);
}

/** 인증서 능력 진술: "나는 이제 ___ 할 수 있다" — 아이가 직접 고르거나 쓴다 */
const CAN_DO_CHIPS = ['받침 있는 낱말도 정확하게 칠', '문장을 띄어쓰기에 맞게 칠', '틀린 글자를 바로 찾아 고칠', '1분에 100타 넘게 칠'];
function canDoBlock(current: string): HTMLElement {
  const line = h('div', { class: 'c-cando-line' }, '나는 이제 ', h('b', {}, current || '________'), ' 수 있다.');
  const input = h('input', { class: 'input c-cando-input', type: 'text', maxlength: '24', placeholder: '직접 쓰기 (예: 문장도 안 틀리고 칠)', value: current }) as HTMLInputElement;
  const apply = (v: string) => {
    const t = v.trim().normalize('NFC');
    SaveSystem.get().profile.canDo = t;
    SaveSystem.save();
    line.replaceChildren('나는 이제 ', h('b', {}, t || '________'), ' 수 있다.');
  };
  input.addEventListener('change', () => apply(input.value));
  const chips = h('div', { class: 'c-cando-chips' }, CAN_DO_CHIPS.map((c) => h('button', { class: 'btn btn-sm btn-sky', onclick: () => { AudioManager.sfx('click'); input.value = c; apply(c); } }, c)));
  return h('div', { class: 'c-cando' }, h('div', { class: 'c-cando-title' }, '내가 할 수 있게 된 것'), line, chips, input);
}

/** 학생·교사 가이드 */
export function guideModal(kind: 'student' | 'teacher') {
  const lines = kind === 'student' ? STUDENT_GUIDE : TEACHER_GUIDE;
  const panel = h(
    'div',
    { class: 'panel modal modal-lg' },
    h('div', { class: `panel-title ${kind === 'student' ? 'sky' : 'purple'}` }, icon('book'), kind === 'student' ? '학생 가이드 · 이렇게 놀아요' : '교사용 가이드'),
    closeBtn(),
    h('div', { class: 'guide-list' }, lines.map((l) => h('p', {}, l))),
    kind === 'teacher'
      ? h('div', { class: 'guide-std' }, h('b', {}, '관련 성취기준(요약) '), h('span', { class: 'muted' }, ABOUT.standards.join(' · ')))
      : null,
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); closeModal(); } }, '확인')),
  );
  open(panel);
}

/** 프롤로그 / 엔딩 이야기 */
export function storyModal(kind: 'prologue' | 'ending', onDone?: () => void) {
  const lines = kind === 'prologue' ? STORY.prologue : STORY.ending;
  const body = h('div', { class: 'story-body' });
  let i = 0;
  const showNext = () => {
    if (i >= lines.length) return;
    const p = h('p', { class: 'anim-fade-in' }, lines[i++]);
    body.appendChild(p);
    if (i >= lines.length) btn.textContent = kind === 'prologue' ? '모험 시작!' : '확인';
  };
  const btn = h('button', { class: 'btn btn-gold btn-md', onclick: () => { AudioManager.sfx('click'); if (i < lines.length) showNext(); else { closeModal(); onDone?.(); } } }, '다음');
  const panel = h(
    'div',
    { class: 'panel panel-cream modal story-modal modal-lg' },
    h('div', { class: 'panel-title' }, kind === 'prologue' ? '사라진 글자들' : '되찾은 글자들'),
    h('img', { class: 'story-art', src: `./assets/backgrounds/${kind === 'prologue' ? 'bg_story_prologue' : 'bg_story_ending'}.webp`, alt: '', draggable: 'false' }),
    closeBtn(onDone),
    body,
    h('div', { class: 'modal-actions' }, btn),
  );
  open(panel, onDone);
  showNext();
}

/** 정보·크레딧·저작권 */
export function aboutModal() {
  const panel = h(
    'div',
    { class: 'panel modal modal-lg' },
    h('div', { class: 'panel-title gold' }, `${ABOUT.appName} ${ABOUT.version}`),
    closeBtn(),
    h(
      'div',
      { class: 'about-body' },
      h('p', {}, h('b', {}, '기획·제작 '), ABOUT.author),
      h('p', {}, h('b', {}, '제공 '), ABOUT.platform),
      h('p', {}, h('b', {}, '교육 내용 출처 '), ABOUT.sources.join(' / ')),
      h('p', {}, h('b', {}, '생성형 AI 고지 '), '배경·캐릭터·아이콘 이미지는 ChatGPT 이미지 생성으로, 배경 음악은 Suno로 제작했으며 제작자가 검수·편집했습니다. 효과음은 자체 합성입니다.'),
      h('p', {}, h('b', {}, '저작권 '), `ⓒ ${ABOUT.year} ${ABOUT.author}. 이 앱의 화면 캡처·일러스트·음원 등 자체 제작 자료의 무단 복제·재배포·전용·상업적 이용을 금지합니다. 이용 조건은 ${ABOUT.platform} 이용약관을 따릅니다.`),
      h('p', { class: 'muted' }, '기록은 이 기기의 브라우저에만 저장되며 서버로 전송되지 않습니다. 개인정보를 수집하지 않습니다.'),
    ),
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); closeModal(); } }, '확인')),
  );
  open(panel);
}

/** 이미지가 없으면(404) 글자 CSS 아이콘으로 대체 — portraitUrl 기준(몬스터·펫) */
function portraitWithFallback(sheet: string, alt: string, fallback: string): HTMLElement {
  const img = h('img', { class: 'ui-icon xl', src: portraitUrl(sheet), alt }) as HTMLImageElement;
  img.addEventListener('error', () => img.replaceWith(h('span', {}, fallback)), { once: true });
  return img;
}

/** 도감: 몬스터 / 배지 / 친구들 / 칭호·장식 / 아이템 — 친구들 제외 4×4 격자 */
export function collectionModal() {
  const save = SaveSystem.get();
  const body = h('div', {});
  const tabs = h('div', { class: 'coll-tabs' });
  const render = (tab: string) => {
    clear(body);
    [...tabs.children].forEach((c) => c.classList.toggle('btn-gold', (c as HTMLElement).dataset.tab === tab));
    [...tabs.children].forEach((c) => c.classList.toggle('btn-gray', (c as HTMLElement).dataset.tab !== tab));
    if (tab === 'monsters') {
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          ENEMIES.map((e) => {
            const seen = save.collection.enemiesSeen.includes(e.id);
            return h(
              'div',
              { class: `coll-item ${seen ? '' : 'locked'}` },
              h('div', { class: `coll-icon ${seen ? '' : 'dim'}` }, portraitWithFallback(e.sheet, e.name, seen ? e.name.slice(0, 1) : '?')),
              h('div', { class: 'n' }, seen ? e.name : '???'),
              h('div', { class: 'coll-desc' }, seen ? e.desc : '아직 만나지 못했어요'),
            );
          }),
        ),
      );
    } else if (tab === 'badges') {
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          BADGES.map((b) => {
            const has = save.collection.badges.includes(b.id);
            return h('div', { class: `coll-item ${has ? '' : 'locked'}` }, h('div', { class: `coll-icon ${has ? '' : 'dim'}` }, uiImg(`badge_${b.id}`, 'xl', b.icon)), h('div', { class: 'n' }, b.name), h('div', { class: 'coll-desc' }, b.desc));
          }),
        ),
      );
    } else if (tab === 'pets') {
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          [...CHARACTERS, ...PETS].map((p) => {
            const open = 'passive' in p ? save.collection.petsUnlocked.includes(p.id) : (save.collection.charactersUnlocked ?? CHARACTERS.map((c) => c.id)).includes(p.id);
            return h('div', { class: `coll-item ${open ? '' : 'locked'}` }, h('img', { class: 'ui-icon xl', src: portraitUrl(p.sheet), alt: p.name }), h('div', { class: 'n' }, open ? p.name : '???'), h('div', { class: 'coll-desc' }, open ? p.desc : [icon('lock'), ` ${p.unlock?.desc ?? ''}`]));
          }),
        ),
      );
    } else if (tab === 'items') {
      body.appendChild(h('div', { class: 'coll-note' }, '몬스터를 물리치면 무작위로 떨어져요'));
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          ITEMS.map((it) => h('div', { class: 'coll-item' }, h('div', { class: 'coll-icon' }, uiImg(`item_${it.id}`, 'xl', it.name.slice(0, 1))), h('div', { class: 'n' }, it.name), h('div', { class: 'coll-desc' }, it.desc))),
        ),
      );
    } else {
      // 칭호·장식
      const coins = save.progress.coins ?? 0;
      body.appendChild(h('div', { class: 'coll-note' }, `지금 코인 ${coins} · 보물 낱말·비밀방·정확도 보상으로 모아요`));
      const titleItems = TITLES.map((t, i) => ({ name: t.name, coins: t.coins, img: undefined as string | undefined, label: String(i + 1) }));
      const decorItems = DECORS.map((d) => ({ name: d.name, coins: d.coins, img: `item_${d.id}`, label: d.icon }));
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          [...titleItems, ...decorItems].map((x) => {
            const has = unlockMet2(coins, x.coins);
            return h(
              'div',
              { class: `coll-item ${has ? '' : 'locked'}` },
              h('div', { class: `coll-icon ${has ? '' : 'dim'}` }, x.img ? uiImg(x.img, 'xl', x.label) : h('span', {}, x.label)),
              h('div', { class: 'n' }, x.name),
              h('div', { class: 'coll-desc' }, has ? '열림' : `코인 ${x.coins}`),
            );
          }),
        ),
      );
    }
  };
  for (const [key, label] of [
    ['monsters', '몬스터'],
    ['badges', '배지'],
    ['pets', '친구들'],
    ['items', '아이템'],
    ['titles', '칭호·장식'],
  ]) {
    tabs.appendChild(h('button', { class: 'btn btn-sm btn-gray', dataset: { tab: key }, onclick: () => { AudioManager.sfx('click'); render(key); } }, label));
  }
  const panel = h('div', { class: 'panel modal modal-xl' }, h('div', { class: 'panel-title sky' }, icon('book'), '모험 도감'), closeBtn(), tabs, body);
  open(panel);
  render('monsters');
}

/** 오늘의 도전 종류 선택: 단어 / 문장 / 긴 글 */
export function dailyPickModal() {
  const kinds: { kind: DailyKind; name: string; desc: string; ic: IconName }[] = [
    { kind: 'word', name: '단어', desc: '짧은 낱말 20개로 빠르게 도전해요', ic: 'bolt' },
    { kind: 'sentence', name: '문장', desc: '문장을 띄어쓰기까지 정확하게 입력해요', ic: 'target' },
    { kind: 'long', name: '긴 글', desc: '약 500자 긴 글에 도전해요', ic: 'book' },
  ];
  const panel = h(
    'div',
    { class: 'panel modal modal-md' },
    h('div', { class: 'panel-title sky' }, icon('clock'), '오늘의 도전'),
    closeBtn(),
    h('div', { class: 'modal-body' }, '어떤 도전을 해볼까요?'),
    h(
      'div',
      { class: 'daily-pick-grid' },
      kinds.map((k) =>
        h(
          'div',
          { class: 'card daily-pick-card', role: 'button', tabindex: '0', onclick: () => { AudioManager.sfx('click'); closeModal(); void navigate('battle', { stageId: 'daily', dailyKind: k.kind }); } },
          icon(k.ic, 'lg'),
          h('div', { class: 'card-name' }, k.name),
          h('div', { class: 'card-desc' }, k.desc),
        ),
      ),
    ),
  );
  open(panel);
}

/** 오늘의 인증서: 개인 기록만 (우리 반/친구 기록 없음) */
export function certificateModal() {
  const save = SaveSystem.get();
  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const name = save.profile.name || '모험가';
  const cpm = save.records.bestCpm;
  const acc = save.records.bestAccuracy;
  const clears = save.progress.clearedStages.length;
  const praise =
    clears === 0
      ? '첫 모험을 떠나면 인증서가 채워져요!'
      : acc >= 95
        ? '정확한 손가락, 진짜 타자 마스터의 자세예요!'
        : acc >= 90
          ? '꼼꼼한 연습이 빛나고 있어요. 멋져요!'
          : '조금씩 성장하는 모습이 보여요. 계속 도전!';
  const cert = h(
    'div',
    { class: 'cert' },
    h('div', { class: 'c-title' }, '오늘의 모험 인증서'),
    h('div', { class: 'c-date' }, dateStr),
    h('div', { class: 'c-name' }, `${name} 모험가`, h('div', { class: 'c-title-tag' }, `칭호 · ${currentTitle(save.progress.coins ?? 0).name}`)),
    h('div', { class: 'c-line' }, `타이핑 어드벤처에서 스테이지 ${clears}개를 클리어하고`, h('br'), '한글 타자 실력을 키웠음을 인증합니다.'),
    h(
      'div',
      { class: 'c-stats' },
      h('div', {}, `${fmt.int(cpm)}`, h('small', {}, '최고 타/분')),
      h('div', {}, `${fmt.pct(acc)}%`, h('small', {}, '최고 정확도')),
      h('div', {}, `${save.records.bestCombo}`, h('small', {}, '최대 콤보')),
      h('div', {}, `${save.collection.badges.length}`, h('small', {}, '획득 배지')),
    ),
    (() => { const d = save.records.daily?.[todayKey()]; return d ? h('div', { class: 'c-line' }, `오늘의 도전: ${fmt.int(d.cpm)}타/분 · 정확도 ${fmt.pct(d.accuracy)}% · 최대 콤보 ${d.maxCombo}`) : h('div', { class: 'c-line muted' }, '오늘의 도전은 아직 안 했어요'); })(),
    h('div', { class: 'c-praise' }, praise),
    canDoBlock(save.profile.canDo ?? ''),
  );
  const panel = h('div', { class: 'panel panel-cream modal modal-md' }, h('div', { class: 'panel-title' }, icon('trophy'), '오늘의 인증서'), closeBtn(), cert, h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-gold', onclick: () => { AudioManager.sfx('click'); closeModal(); } }, '확인')));
  open(panel);
}

export function toast(msg: string) {
  const root = document.getElementById('toast-root')!;
  const t = h('div', { class: 'toast' }, msg);
  root.appendChild(t);
  window.setTimeout(() => t.remove(), 2500);
}
