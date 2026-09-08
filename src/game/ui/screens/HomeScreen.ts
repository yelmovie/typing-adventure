import { Screen } from '../Screen';
import { h, icon, uiImg } from '../../util/dom';
import { SaveSystem } from '../../systems/SaveSystem';
import { navigate } from '../../Game';
import { getCharacter, getPet, portraitUrl } from '../../data/characters';
import { DIFFICULTY_LABEL } from '../../data/stages';
import { settingsModal, collectionModal, certificateModal, confirmModal } from '../ModalController';
import { AudioManager } from '../../systems/AudioManager';
import { currentTitle, nextTitle, unlockedDecors } from '../../data/titles';
import { ABOUT } from '../../data/about';

export class HomeScreen extends Screen {
  constructor() {
    super('home');
  }

  protected render() {
    const save = SaveSystem.get();
    const has = SaveSystem.hasSave();
    const ch = getCharacter(save.profile.characterId);
    const pet = getPet(save.profile.petId);

    this.el.append(
      h(
        'div',
        { class: 'home-logo' },
        h('img', { class: 'logo-img', src: './assets/ui/logo.webp', alt: '타이핑 어드벤처', draggable: 'false' }),
        h('div', { class: 'logo-sub' }, 'TYPING ADVENTURE'),
        h('div', { class: 'logo-tag' }, '한글 타자로 몬스터를 물리치는 판타지 모험'),
      ),
    );

    if (has) {
      const stars = Object.values(save.progress.stageStars).reduce((a, b) => a + b, 0);
      this.el.append(
        h(
          'div',
          { class: 'panel panel-glass player-card' },
          h('img', { src: portraitUrl(ch.sheet), alt: ch.name }),
          h(
            'div',
            {},
            h('div', { class: 'pc-name' }, `${save.profile.name} · Lv.${SaveSystem.level()}`),
            h('div', { class: 'pc-title' }, `🏷 ${currentTitle(save.progress.coins ?? 0).name}`, h('span', { class: 'muted' }, (() => { const n = nextTitle(save.progress.coins ?? 0); return n ? ` · 다음 칭호까지 ${n.coins - (save.progress.coins ?? 0)}코인` : ' · 최고 칭호!'; })())),
            h('div', { class: 'pc-sub' }, `${ch.name} · ${pet.name} · `, h('b', {}, DIFFICULTY_LABEL[save.profile.difficulty].name)),
            h('div', { class: 'pc-sub' }, icon('star_on'), ` ${stars} · `, icon('coin'), ` ${save.progress.coins ?? 0} · 최고 `, h('b', {}, `${save.records.bestCpm}타/분`)),
          ),
        ),
      );
    }

    // 코인으로 열린 홈 장식
    if (has) {
      for (const d of unlockedDecors(save.progress.coins ?? 0)) {
        this.el.append(h('div', { class: 'home-decor anim-float', title: d.name, style: { left: `${d.x}px`, top: `${d.y}px` } }, uiImg(`item_${d.id}`, 'decor', d.icon)));
      }
    }
    const menu = h(
      'div',
      { class: 'home-menu' },
      this.btn('▶', '모험 시작', 'btn-primary btn-lg', async () => {
        if (has) {
          const ok = await confirmModal('새 모험', '새로운 모험을 시작하면 지금까지의 기록이 초기화돼요.\n계속할까요? (이어하기는 기존 기록을 유지해요)');
          if (!ok) return;
          SaveSystem.reset();
        }
        void navigate('setup');
      }),
      this.btn('⏩', '이어하기', `btn-sky btn-lg ${has ? '' : 'disabled'}`, () => {
        if (!has) return;
        void navigate('worldmap');
      }),
      this.btn('📅', '오늘의 도전', `btn-sky ${has ? '' : 'disabled'}`, () => { if (has) void navigate('battle', { stageId: 'daily' }); }),
      this.btn(icon('book'), '도감', 'btn-purple', () => collectionModal()),
      this.btn(icon('trophy'), '오늘의 인증서', 'btn-gold', () => certificateModal()),
      this.btn(icon('settings'), '설정', 'btn-gray', () => settingsModal({ onReset: () => this.show({}) })),
    );
    this.el.append(menu);
    this.el.append(h('div', { class: 'home-tip' }, has ? `${save.profile.name} 모험가, 다시 만나서 반가워요!` : '모험 시작을 눌러 이름과 캐릭터를 정해 보세요'));
    this.el.append(h('div', { class: 'home-version' }, `${ABOUT.version} · 기록은 이 기기에만 저장돼요 · ⓒ ${ABOUT.year} ${ABOUT.author}`));
  }

  private btn(ic: string | HTMLElement, label: string, cls: string, onClick: () => void) {
    const b = h('button', { class: `btn ${cls}` }, h('span', { class: 'btn-icon' }, ic), label);
    b.addEventListener('click', () => {
      AudioManager.unlock();
      AudioManager.sfx('click');
      onClick();
    });
    return b;
  }
}
