import { h, clear, uiImg, icon } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { AudioManager } from '../../systems/AudioManager';
import { navigate, currentScreen } from '../../Game';
import { BADGES } from '../../data/badges';
import { TITLES, DECORS, unlockMet2 } from '../../data/titles';
import { ENEMIES } from '../../data/enemies';
import { PETS, CHARACTERS, portraitUrl } from '../../data/characters';
import { ITEMS } from '../../data/items';
import { getLanguage } from '../../i18n/Locale';
import { chunkItems, pagedContent } from '../PagedContent';
import { open, closeBtn } from './ModalHost';
import { toast } from './BasicModals';

/** 이미지가 없으면(404) 글자 CSS 아이콘으로 대체 — portraitUrl 기준(몬스터·펫) */
function portraitWithFallback(sheet: string, alt: string, fallback: string): HTMLElement {
  const img = h('img', { class: 'ui-icon xl', src: portraitUrl(sheet), alt }) as HTMLImageElement;
  img.addEventListener('error', () => img.replaceWith(h('span', {}, fallback)), { once: true });
  return img;
}

/** 도감: 고정된 제목·탭 아래에서 카드 목록만 스크롤한다. */
export function collectionModal() {
  const save = SaveSystem.get();
  const pageByTab: Record<string, number> = {};
  const cardsPerPage = () => window.innerWidth >= 1500 && window.innerHeight >= 800 ? 6 : window.innerWidth >= 1100 && window.innerHeight >= 650 ? 4 : 2;
  let activeTab = 'monsters', pageSize = cardsPerPage();
  let equipmentChanged = false;
  const refreshEquipment = () => {
    const screen = currentScreen();
    if (equipmentChanged && (screen === 'home' || screen === 'worldmap')) void navigate(screen);
  };
  const body = h('div', { class: 'collection-body detail-modal-body', role: 'region', tabindex: '0', 'aria-label': getLanguage() === 'en' ? 'Collection entries' : '도감 목록' });
  const tabs = h('div', { class: 'coll-tabs' });
  const render = (tab: string) => {
    clear(body);
    body.scrollTop = 0;
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
            const isPet = 'passive' in p;
            const selected = isPet ? save.profile.petId === p.id : save.profile.characterId === p.id;
            return h('div', { class: `coll-item ${open ? '' : 'locked'}`, dataset: { equipment: p.id }, tabindex: '-1' }, h('img', { class: 'ui-icon xl', src: portraitUrl(p.sheet), alt: p.name }), h('div', { class: 'n' }, open ? p.name : '???'), h('div', { class: 'coll-desc' }, open ? p.desc : [icon('lock'), ` ${p.unlock?.desc ?? ''}`]),
              open ? h('button', { class: 'btn btn-sm btn-sky coll-equip', disabled: selected, onclick: () => {
                SaveSystem.setProfile(save.profile.name, isPet ? save.profile.characterId : p.id, isPet ? p.id : save.profile.petId, save.profile.difficulty);
                equipmentChanged = true;
                paginate('pets'); toast(`${p.name}와 함께해요!`);
                body.querySelector<HTMLElement>(`[data-equipment="${p.id}"]`)?.focus({ preventScroll: true });
              } }, selected ? '함께하는 중' : '함께하기') : null);
          }),
        ),
      );
    } else if (tab === 'items') {
      body.appendChild(h('div', { class: 'coll-note' }, '몬스터를 물리치면 무작위로 떨어져요'));
      body.appendChild(
        h(
          'div',
          { class: 'coll-grid' },
          ITEMS.map((it) => h(
            'div',
            { class: 'coll-item' },
            h('div', { class: 'coll-icon' }, it.img ? uiImg(it.img, 'xl', it.name.slice(0, 1)) : h('span', { class: `css-icon ci-${it.cssIcon}` })),
            h('div', { class: 'n' }, it.name),
            h('div', { class: 'coll-desc' }, it.desc),
          )),
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
  const paginate = (tab: string) => {
    activeTab = tab;
    render(tab);
    const grid = body.querySelector('.coll-grid');
    if (!grid) return;
    const cards = [...grid.children] as HTMLElement[];
    const perPage = cardsPerPage();
    pageSize = perPage;
    const pages = chunkItems(cards, perPage).map(group => ({ title: '', content: h('div', {
      class: 'coll-grid popup-card-grid', style: `--popup-card-columns: ${perPage === 6 ? 3 : 2}`,
    }, group) }));
    grid.replaceWith(pagedContent(pages, { className: 'collection-pages', initialPage: pageByTab[tab] ?? 0, onPage: index => { pageByTab[tab] = index; } }).element);
  };
  for (const [key, label] of [
    ['monsters', '몬스터'],
    ['badges', '배지'],
    ['pets', '친구들'],
    ['items', '아이템'],
    ['titles', '칭호·장식'],
  ]) {
    tabs.appendChild(h('button', { class: 'btn btn-sm btn-gray', dataset: { tab: key }, onclick: () => { AudioManager.sfx('click'); paginate(key); } }, label));
  }
  const panel = h('div', { class: 'panel modal modal-xl collection-modal detail-modal popup-paged', 'aria-labelledby': 'collection-title' },
    h('div', { class: 'detail-modal-header' }, h('h2', { class: 'panel-title sky', id: 'collection-title' }, icon('book'), '모험 도감'), closeBtn(refreshEquipment)), tabs, body);
  const resize = () => { if (panel.isConnected && cardsPerPage() !== pageSize) paginate(activeTab); };
  window.addEventListener('resize', resize);
  open(panel, refreshEquipment, () => window.removeEventListener('resize', resize));
  paginate('monsters');
}
