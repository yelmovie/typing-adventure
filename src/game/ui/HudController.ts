import { h, fmt, icon, uiImg } from '../util/dom';
import type { BattleSnapshot } from '../systems/BattleSystem';
import { diffChars } from '../util/hangul';
import type { WordVariant } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { soundButton } from './TopBar';
import { settingsModal } from './ModalController';

const VARIANT_LABEL: Record<WordVariant, string> = { treasure: '보물 낱말', heart: '하트 낱말', bomb: '폭탄 낱말' };
const FEVER_TXT = ['COMBO', 'POWER', 'FEVER', 'FINAL FEVER'];

/** 전투 HUD DOM 요소 묶음. 값 갱신만 담당. */
export class HudController {
  readonly top: HTMLElement;
  /** 소리 팝오버 버튼 wrap (top 패널 오른쪽 끝) — 설정 모달에서 켠/끈 뒤 아이콘 동기화용 */
  readonly soundEl: HTMLElement;
  readonly left: HTMLElement;
  readonly enemyPanel: HTMLElement;
  readonly combo: HTMLElement;
  readonly targetEl: HTMLElement;
  readonly variantEl: HTMLElement;
  readonly hintEl: HTMLElement;
  readonly skipBtn: HTMLElement;
  private skipCount: HTMLElement;
  readonly track: HTMLElement;
  readonly tele: HTMLElement;
  private teleDist: HTMLElement;
  private teleSpeed: HTMLElement;
  private teleXfer: HTMLElement;
  private teleXferTxt: HTMLElement;
  private teleBrakes: HTMLElement;
  private trackYou: HTMLElement;
  private trackGhost: HTMLElement;
  private trackChaser: HTMLElement;
  private trackDist: HTMLElement;

  private wordCur: HTMLElement;
  private wordTot: HTMLElement;
  private progressFill: HTMLElement;
  private timeVal: HTMLElement;
  private scoreVal: HTMLElement;
  private accVal: HTMLElement;
  private cpmVal: HTMLElement;
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private shieldEl: HTMLElement;
  private enemyName: HTMLElement;
  private enemyImg: HTMLImageElement;
  private enemyCount: HTMLElement;
  private enemyFill: HTMLElement;
  private enemyHpText: HTMLElement;
  private comboNum: HTMLElement;
  private comboTxt: HTMLElement;
  private feverBar: HTMLElement;
  private feverFill: HTMLElement;
  private lastCombo = 0;
  private lastTargetKey = '';

  constructor(opts: { stageIndex: number; stageName: string; playerName: string; level: number; portrait: string; petName: string; petPortrait: string; petSkill: string; countLabel?: string; bestCpm?: number; race?: boolean; timeLabel?: string; hideEnemy?: boolean; telegram?: boolean; title?: string; petActive?: string; onHome?: () => void }) {
    this.wordCur = h('span', { class: 'cur' }, '0');
    this.wordTot = h('span', {}, '0');
    this.progressFill = h('div', { class: 'gauge-fill sky', style: { width: '0%' } });
    this.timeVal = h('div', { class: 'val' }, '0:00');
    this.scoreVal = h('div', { class: 'val' }, '0');
    this.accVal = h('div', { class: 'val' }, '100', h('small', {}, '%'));
    this.cpmVal = h('div', { class: 'val' }, '0', h('small', {}, ' 타/분'));
    this.soundEl = soundButton();
    this.top = h(
      'div',
      { class: 'panel panel-glass battle-top' },
      h('div', { class: 'bt-stage' }, h('span', { class: 's1' }, `STAGE ${opts.stageIndex}`), h('span', { class: 's2' }, opts.stageName)),
      h(
        'div',
        { class: 'bt-progress' },
        h('div', { class: 'row' }, h('span', {}, `${opts.countLabel ?? '낱말'} `, this.wordCur, ' / ', this.wordTot), h('span', {}, '진행도')),
        h('div', { class: 'gauge' }, this.progressFill),
      ),
      h(
        'div',
        { class: 'bt-stats' },
        h('div', { class: 'stat-box' }, h('div', { class: 'lbl' }, icon('clock'), ` ${opts.timeLabel ?? '남은 시간'}`), this.timeVal),
        h('div', { class: 'stat-box' }, h('div', { class: 'lbl' }, icon('trophy'), ' 점수'), this.scoreVal),
        h('div', { class: 'stat-box' }, h('div', { class: 'lbl' }, icon('target'), ' 정확도'), this.accVal),
        h('div', { class: 'stat-box' }, h('div', { class: 'lbl' }, icon('bolt'), ' 타수', opts.bestCpm ? h('span', { class: 'best' }, ` 최고 ${opts.bestCpm}`) : null), this.cpmVal),
        h('button', { class: 'icon-btn', title: '홈으로', onclick: () => { AudioManager.sfx('click'); opts.onHome?.(); } }, icon('home')),
        this.soundEl,
        h('button', { class: 'icon-btn', title: '설정', onclick: () => { AudioManager.sfx('click'); settingsModal(); } }, icon('settings')),
      ),
    );

    this.hpFill = h('div', { class: 'gauge-fill', style: { width: '100%' } });
    this.hpText = h('span', {}, '100 / 100');
    this.shieldEl = h('span', { class: 'pl-shield' }, '방어막');
    this.left = h(
      'div',
      { class: 'panel panel-glass battle-left' },
      h('div', { class: 'pl-head' }, h('img', { class: 'pl-portrait', src: opts.portrait, alt: '' }), h('div', {}, h('div', { class: 'pl-name' }, opts.playerName), h('div', { class: 'pl-level' }, `Lv.${opts.level} ${opts.title ?? '모험가'}`))),
      h('div', { class: 'pl-hp-label' }, h('span', {}, icon('heart'), ' HP ', this.shieldEl), this.hpText),
      h('div', { class: 'gauge' }, this.hpFill),
      h('div', { class: 'pl-pet' }, h('img', { src: opts.petPortrait, alt: '' }), h('div', {}, h('div', { class: 'pl-pet-name' }, `${opts.petName}`), h('div', { class: 'pl-pet-skill', title: opts.petSkill }, opts.petActive ? uiImg(`item_${opts.petActive}`) : null, ' ', opts.petSkill))),
    );

    this.enemyName = h('span', { class: 'en-name' }, '');
    this.enemyImg = h('img', { src: '', alt: '' }) as HTMLImageElement;
    this.enemyCount = h('span', { class: 'en-count' }, '');
    this.enemyFill = h('div', { class: 'gauge-fill red', style: { width: '100%' } });
    this.enemyHpText = h('div', { class: 'gauge-label' }, '');
    this.enemyPanel = h(
      'div',
      { class: `panel panel-glass battle-enemy-hp empty ${opts.hideEnemy ? 'hidden' : ''}` },
      h('div', { class: 'en-head' }, this.enemyImg, this.enemyName, this.enemyCount),
      h('div', { class: 'gauge gauge-lg' }, this.enemyFill, this.enemyHpText),
    );

    this.comboNum = h('div', { class: 'combo-num' }, '0');
    this.comboTxt = h('div', { class: 'combo-txt' }, 'COMBO');
    this.feverFill = h('div', { class: 'fever-fill' });
    this.feverBar = h('div', { class: 'fever-bar' }, this.feverFill);
    this.combo = h('div', { class: 'combo-box' }, this.comboNum, this.comboTxt, this.feverBar);

    this.trackYou = h('div', { class: 'tk-mark you' }, 'YOU');
    this.trackGhost = h('div', { class: 'tk-mark ghost' }, '어제');
    this.trackChaser = h('div', { class: 'tk-mark chaser' }, '추격');
    this.trackDist = h('span', { class: 'tk-dist' }, '0 m');
    this.track = h('div', { class: `panel panel-glass race-track ${opts.race ? '' : 'hidden'}` }, h('div', { class: 'tk-row' }, h('span', {}, icon('flag'), ' GOAL 1000m'), this.trackDist), h('div', { class: 'tk-bar' }, this.trackChaser, this.trackGhost, this.trackYou, h('span', { class: 'tk-goal' }, icon('flag'))));
    this.teleDist = h('span', { class: 'td-dist' }, '280 m');
    this.teleSpeed = h('div', { class: 'gauge-fill red', style: { width: '100%' } });
    this.teleXfer = h('div', { class: 'gauge-fill sky', style: { width: '0%' } });
    this.teleXferTxt = h('div', { class: 'gauge-label' }, '전송률 0%');
    this.teleBrakes = h('div', { class: 'td-brakes' });
    this.tele = h('div', { class: `panel panel-glass tele-panel ${opts.telegram ? '' : 'hidden'}` },
      h('div', { class: 'td-row' }, h('span', {}, '위험 지점까지'), this.teleDist),
      h('div', { class: 'td-row small' }, h('span', {}, '열차 속도'), h('div', { class: 'gauge' }, this.teleSpeed)),
      h('div', { class: 'td-row small' }, h('span', {}, '전송률'), h('div', { class: 'gauge gauge-lg' }, this.teleXfer, this.teleXferTxt)),
      h('div', { class: 'td-row small' }, h('span', {}, '브레이크'), this.teleBrakes),
    );
    this.targetEl = h('div', { class: 'bb-target' });
    this.variantEl = h('div', { class: 'bb-variant' });
    this.hintEl = h('div', { class: 'bb-hint' });
    this.skipCount = h('span', { class: 'skip-count' }, '3');
    this.skipBtn = h('button', { class: 'btn btn-sm btn-purple bb-skip', title: '어려운 낱말 건너뛰기 (Tab)', type: 'button' }, '점프 ', this.skipCount);
  }

  update(s: BattleSnapshot) {
    this.wordCur.textContent = String(s.wordsDone);
    this.wordTot.textContent = String(s.targetTotal);
    const prog = s.totalEnemyHp > 0 ? (s.dealtDamage / s.totalEnemyHp) * 100 : 0;
    this.progressFill.style.width = `${Math.min(100, prog)}%`;
    this.timeVal.textContent = fmt.time(s.timeLeft);
    this.timeVal.classList.toggle('warn', s.timeLimit > 0 && s.timeLeft <= 15);
    this.scoreVal.textContent = fmt.int(s.score);
    this.accVal.replaceChildren(fmt.pct(s.accuracy), h('small', {}, '%'));
    this.cpmVal.replaceChildren(fmt.int(s.cpm), h('small', {}, ' 타/분'));
    const hpPct = (s.playerHp / s.playerMaxHp) * 100;
    this.hpFill.style.width = `${hpPct}%`;
    this.hpFill.classList.toggle('hp-mid', hpPct <= 60 && hpPct > 30);
    this.hpFill.classList.toggle('hp-low', hpPct <= 30);
    this.hpText.textContent = `${s.playerHp} / ${s.playerMaxHp}`;
    this.shieldEl.classList.toggle('on', s.shielded);
    this.enemyPanel.classList.toggle('empty', !s.enemy);
    if (s.enemy) {
      this.enemyName.textContent = s.enemy.name;
      const src = `./assets/portraits/${s.enemy.sheet}.webp`;
      if (this.enemyImg.getAttribute('src') !== src) this.enemyImg.src = src;
      this.enemyCount.textContent = s.enemyLabel ?? `${s.enemyIndex + 1} / ${s.enemyTotal} 마리`;
      this.enemyFill.style.width = `${(s.enemy.hp / s.enemy.maxHp) * 100}%`;
      this.enemyHpText.textContent = `${s.enemy.hp} / ${s.enemy.maxHp}`;
    }
    this.setCombo(s.combo, s.feverLevel, s.feverLeft);
    this.renderVariant(s);
    this.hintEl.textContent = s.nextHint ? `다음 낱말: ${s.nextHint}` : '';
    if (s.telegram) {
      const t = s.telegram;
      this.teleDist.textContent = `${Math.ceil(t.dist)} m`;
      this.tele.classList.toggle('danger', t.dist < 60 && !t.stopped);
      this.teleSpeed.style.width = `${Math.round((t.speed / 2) * 100)}%`;
      this.teleXfer.style.width = `${Math.round(t.transfer * 100)}%`;
      this.teleXferTxt.textContent = `전송률 ${Math.round(t.transfer * 100)}% (${t.wordsDone}/${t.wordsTotal} 어절)`;
      this.teleBrakes.replaceChildren(...Array.from({ length: t.brakeTotal }, (_, i) => h('span', { class: `td-brake ${i < t.brake ? 'on' : ''}` }, '●')));
      this.tele.classList.toggle('outage', t.outage);
    }
    if (s.race) {
      const r = s.race;
      const pct = (m: number) => `${Math.max(0, Math.min(100, (m / r.goal) * 100))}%`;
      this.trackYou.style.left = pct(r.player);
      this.trackChaser.style.left = pct(r.chaser);
      this.trackGhost.style.left = pct(r.ghost ?? -1);
      this.trackGhost.hidden = r.ghost == null;
      this.trackDist.textContent = `${Math.round(r.player)} m · ${r.speed.toFixed(1)} m/s${r.turboLeft > 0 ? ' TURBO' : r.slowLeft > 0 ? ' 감속' : ''}`;
      this.track.classList.toggle('danger', r.player - r.chaser < 15);
    }
  }

  setCombo(c: number, fever = 0, feverLeft = 0) {
    if (c !== this.lastCombo) {
      this.comboNum.textContent = String(c);
      this.comboNum.classList.remove('bump');
      void this.comboNum.offsetWidth;
      this.comboNum.classList.add('bump');
      this.lastCombo = c;
    }
    this.combo.classList.toggle('show', c >= 2 || fever >= 2);
    this.combo.classList.toggle('hot', c >= 5 && fever === 0);
    this.combo.classList.toggle('fire', fever === 1);
    this.combo.classList.toggle('fever', fever >= 2);
    this.comboTxt.textContent = fever > 0 ? FEVER_TXT[fever] : FEVER_TXT[0];
    this.feverBar.classList.toggle('on', fever >= 2);
    if (fever >= 2) this.feverFill.style.width = `${Math.min(100, (feverLeft / (fever === 3 ? 10 : 8)) * 100)}%`;
  }

  /** 변화구 라벨 + 폭탄 카운트다운 */
  private renderVariant(s: BattleSnapshot) {
    const v = s.target?.variant;
    const key = `${s.target?.id ?? ''}:${v ?? ''}`;
    if (key !== this.lastTargetKey) {
      this.lastTargetKey = key;
      this.variantEl.className = `bb-variant ${v ?? ''}`;
      this.variantEl.replaceChildren(...(v ? [uiImg(`item_${v}`), ` ${VARIANT_LABEL[v]}`] : []));
    }
    if (v === 'bomb' && s.bombLeft != null) {
      this.variantEl.replaceChildren(uiImg('item_bomb'), ` ${VARIANT_LABEL.bomb} ${s.bombLeft.toFixed(1)}초`);
      this.variantEl.classList.toggle('urgent', s.bombLeft <= 2);
    }
  }

  /** 목표 낱말을 입력 상태에 따라 색으로 표시 */
  renderTarget(target: string, current: string) {
    const parts = diffChars(target, current);
    const len = [...target].length;
    this.targetEl.classList.toggle('long', len > 8);
    this.targetEl.classList.toggle('xlong', len > 16);
    this.targetEl.replaceChildren(...parts.map((p) => h('span', { class: p.state === 'todo' ? '' : p.state }, p.ch)));
  }

  setSkips(n: number) {
    this.skipCount.textContent = String(n);
    this.skipBtn.classList.toggle('disabled', n <= 0);
  }

  /** 틀린 음절 확정: 그 글자가 빨갛게 흔들림 */
  shakeChar(index: number) {
    const el = this.targetEl.children[index] as HTMLElement | undefined;
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('bad', 'shake');
  }
}
