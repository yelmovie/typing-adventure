import { h, fmt, icon, uiImg } from '../util/dom';
import type { BattleSnapshot } from '../systems/BattleState';
import { diffChars } from '../util/hangul';
import type { WordVariant } from '../types';
import { AudioManager } from '../systems/AudioManager';
import { soundButton } from './TopBar';
import { settingsModal } from './ModalController';
import { getLanguage } from '../i18n/Locale';
import { BOSS } from '../systems/BossSystem';

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
  private trackGoal: HTMLElement;
  private trackGap: HTMLElement;

  private wordCur: HTMLElement;
  private wordTot: HTMLElement;
  private progressNote: HTMLElement;
  private progressKind: 'targets' | 'words' | 'distance' | 'phase';
  private progressFill: HTMLElement;
  private timeVal: HTMLElement;
  private scoreVal: HTMLElement;
  private accVal: HTMLElement;
  private cpmVal: HTMLElement;
  private hpFill: HTMLElement;
  private hpTrailFill: HTMLElement;
  private hpText: HTMLElement;
  private shieldEl: HTMLElement;
  private enemyName: HTMLElement;
  private enemyImg: HTMLImageElement;
  private enemyCount: HTMLElement;
  private enemyFill: HTMLElement;
  private enemyTrailFill: HTMLElement;
  private enemyHpText: HTMLElement;
  private comboNum: HTMLElement;
  private comboTxt: HTMLElement;
  private feverBar: HTMLElement;
  private feverFill: HTMLElement;
  private lastCombo = 0;
  private lastTargetKey = '';
  private lastHp?: number;
  private lastEnemyHp?: number;
  private displayedScore?: number;
  private scoreTarget?: number;
  private hpTrailTimer = 0;
  private enemyTrailTimer = 0;
  private damageTimer = 0;
  private scoreFrame = 0;

  constructor(opts: { stageIndex: number; stageName: string; playerName: string; level: number; portrait: string; petName: string; petPortrait: string; petSkill: string; countLabel?: string; progressKind?: 'targets' | 'words' | 'distance' | 'phase'; bestCpm?: number; race?: boolean; timeLabel?: string; hideEnemy?: boolean; telegram?: boolean; title?: string; petActive?: string; comboInTop?: boolean; onHome?: () => void }) {
    this.progressKind = opts.progressKind ?? 'words';
    this.wordCur = h('span', { class: 'cur' }, '0');
    this.wordTot = h('span', {}, '0');
    this.progressNote = h('span', { class: 'bt-progress-note' }, '진행도');
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
        h('div', { class: 'row' }, h('span', {}, `${opts.countLabel ?? '낱말'} `, this.wordCur, ' / ', this.wordTot), this.progressNote),
        h('div', { class: 'gauge' }, this.progressFill),
      ),
      h(
        'div',
        { class: 'bt-stats' },
        h('div', { class: 'stat-box' }, h('div', { class: 'lbl' }, icon('clock'), ` ${opts.timeLabel ?? '남은 시간'}`), this.timeVal),
        h('div', { class: 'stat-box' }, h('div', { class: 'lbl' }, icon('trophy'), ' 점수'), this.scoreVal),
        h('div', { class: 'stat-box' }, h('div', { class: 'lbl' }, icon('target'), ' 정확도'), this.accVal),
        h('div', { class: 'stat-box' }, h('div', { class: 'lbl' }, icon('bolt'), ' 현재 타수', opts.bestCpm ? h('span', { class: 'best' }, ` · 최고 ${opts.bestCpm}`) : null), this.cpmVal),
        h('button', { class: 'icon-btn', title: '홈으로', onclick: () => { AudioManager.sfx('click'); opts.onHome?.(); } }, icon('home')),
        this.soundEl,
        h('button', { class: 'icon-btn', title: '설정', onclick: () => { AudioManager.sfx('click'); settingsModal(); } }, icon('settings')),
      ),
    );

    this.hpFill = h('div', { class: 'gauge-fill gauge-value', style: { width: '100%' } });
    this.hpTrailFill = h('div', { class: 'gauge-fill gauge-trail hp-trail', style: { width: '100%' }, 'aria-hidden': 'true' });
    this.hpText = h('span', {}, '100 / 100');
    this.shieldEl = h('span', { class: 'pl-shield' }, '방어막');
    this.left = h(
      'div',
      { class: 'panel panel-glass battle-left' },
      h('div', { class: 'pl-head' }, h('img', { class: 'pl-portrait', src: opts.portrait, alt: '' }), h('div', {}, h('div', { class: 'pl-name', 'data-no-translate': 'true' }, opts.playerName), h('div', { class: 'pl-level' }, `Lv.${opts.level} ${opts.title ?? '모험가'}`))),
      h('div', { class: 'pl-hp-label' }, h('span', {}, icon('heart'), ' HP ', this.shieldEl), this.hpText),
      h('div', { class: 'gauge gauge-layered' }, this.hpTrailFill, this.hpFill),
      h('div', { class: 'pl-pet' }, h('img', { src: opts.petPortrait, alt: '' }), h('div', {}, h('div', { class: 'pl-pet-name' }, `${opts.petName}`), h('div', { class: 'pl-pet-skill', title: opts.petSkill }, opts.petActive ? uiImg(`item_${opts.petActive}`) : null, ' ', opts.petSkill))),
    );

    this.enemyName = h('span', { class: 'en-name' }, '');
    this.enemyImg = h('img', { src: '', alt: '' }) as HTMLImageElement;
    this.enemyCount = h('span', { class: 'en-count' }, '');
    this.enemyFill = h('div', { class: 'gauge-fill red gauge-value', style: { width: '100%' } });
    this.enemyTrailFill = h('div', { class: 'gauge-fill gauge-trail enemy-trail', style: { width: '100%' }, 'aria-hidden': 'true' });
    this.enemyHpText = h('div', { class: 'gauge-label' }, '');
    this.enemyPanel = h(
      'div',
      { class: `panel panel-glass battle-enemy-hp empty ${opts.hideEnemy ? 'hidden' : ''}` },
      h('div', { class: 'en-head' }, this.enemyImg, this.enemyName, this.enemyCount),
      h('div', { class: 'gauge gauge-lg gauge-layered' }, this.enemyTrailFill, this.enemyFill, this.enemyHpText),
    );

    this.comboNum = h('div', { class: 'combo-num' }, '0');
    this.comboTxt = h('div', { class: 'combo-txt' }, 'COMBO');
    this.feverFill = h('div', { class: 'fever-fill' });
    this.feverBar = h('div', { class: 'fever-bar' }, this.feverFill);
    this.combo = h('div', { class: 'combo-box' }, this.comboNum, this.comboTxt, this.feverBar);
    // 푸른 숲(wave)은 몬스터가 12시 방향에서 내려와 낱말이 화면 중앙 띠를 지난다.
    // 콤보를 무대 위에 띄우지 않고 상단 HUD 바(진행도와 스탯 사이)에 배지로 넣어 낱말을 가리지 않게 한다.
    if (opts.comboInTop) this.top.querySelector('.bt-stats')?.before(this.combo);

    this.trackYou = h('div', { class: 'tk-mark you' }, 'YOU');
    this.trackGhost = h('div', { class: 'tk-mark ghost' }, '어제');
    this.trackChaser = h('div', { class: 'tk-mark chaser' }, '추격');
    this.trackDist = h('span', { class: 'tk-dist' }, '0 m');
    this.trackGoal = h('span', {}, 'GOAL');
    this.trackGap = h('div', { class: 'tk-gap', 'data-no-translate': 'true' });
    this.track = h('div', { class: `panel panel-glass race-track ${opts.race ? '' : 'hidden'}` }, h('div', { class: 'tk-row' }, this.trackGoal, this.trackDist), h('div', { class: 'tk-bar' }, this.trackChaser, this.trackGhost, this.trackYou, h('span', { class: 'tk-goal' }, icon('flag'))), this.trackGap);
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
    const current = this.progressKind === 'distance' && s.race ? Math.floor(s.race.player) : this.progressKind === 'phase' && s.boss ? s.boss.phase : this.progressKind === 'targets' ? s.targetIndex : s.wordsDone;
    this.wordCur.textContent = String(current);
    this.wordTot.textContent = this.progressKind === 'distance' && s.race ? `${s.race.goal} m` : String(s.targetTotal);
    let prog = s.totalEnemyHp > 0 ? (s.dealtDamage / s.totalEnemyHp) * 100 : 0;
    if (s.boss) {
      const b = s.boss;
      const fraction = b.phase === 1 ? b.crystals.filter((c) => c.broken).length / Math.max(1, b.crystals.length) : b.phase === 2 ? 1 + (b.maxHp - b.hp) / (b.maxHp - BOSS.phase3At) : 2 + (BOSS.phase3At - b.hp) / BOSS.phase3At;
      prog = fraction / 3 * 100;
    }
    this.progressNote.textContent = 'wave' in s ? (getLanguage() === 'en' ? `${s.wordsDone} typed correctly` : `입력 성공 ${s.wordsDone}회`) : getLanguage() === 'en' ? 'Progress' : '진행도';
    this.progressFill.style.width = `${Math.min(100, prog)}%`;
    this.timeVal.textContent = fmt.time(s.timeLeft);
    this.timeVal.classList.toggle('warn', s.timeLimit > 0 && s.timeLeft <= 15);
    this.animateScore(s.score);
    this.accVal.replaceChildren(fmt.pct(s.accuracy), h('small', {}, '%'));
    this.cpmVal.replaceChildren(fmt.int(s.cpm), h('small', {}, ' 타/분'));
    const hpPct = (s.playerHp / s.playerMaxHp) * 100;
    this.updateHealthBar(s.playerHp, s.playerMaxHp);
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
      this.updateEnemyHealthBar(s.enemy.hp, s.enemy.maxHp);
      this.enemyHpText.textContent = `${s.enemy.hp} / ${s.enemy.maxHp}`;
      if (s.boss) {
        const b = s.boss, en = getLanguage() === 'en';
        this.enemyCount.dataset.noTranslate = 'true';
        this.enemyHpText.dataset.noTranslate = 'true';
        this.enemyFill.classList.toggle('boss-shield', b.phase === 1);
        if (b.phase === 1) {
          const left = b.crystals.filter(c => !c.broken).length;
          this.enemyFill.style.width = `${left / Math.max(1, b.crystals.length) * 100}%`;
          this.enemyHpText.textContent = en ? `Crystals ${left}/${b.crystals.length}` : `남은 결정 ${left}/${b.crystals.length}`;
          this.enemyCount.textContent = en ? '1/3 · Break the shield' : '1/3 · 보호막 깨기';
        } else if (b.phase === 2) {
          this.enemyCount.textContent = en ? '2/3 · Counterattack' : '2/3 · 낱말 반격';
        } else {
          const role = b.finalRole === 'core' ? (en ? 'Core' : '코어') : b.finalRole === 'finale' ? (en ? 'Final strike' : '마지막 일격') : (en ? 'Armor' : '갑옷');
          this.enemyCount.textContent = `${role} · ${b.finalStep}/${b.finalTotal}`;
        }
      }
    }
    this.setCombo(s.combo, s.feverLevel, s.feverLeft);
    this.renderVariant(s);
    this.hintEl.textContent = s.nextHint ? `${getLanguage() === 'en' ? 'Next target' : '다음 입력'}: ${s.nextHint}` : '';
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
      this.trackGoal.textContent = `GOAL ${r.goal}m`;
      this.trackDist.textContent = `${Math.round(r.player)} m${r.turboLeft > 0 ? ' · TURBO' : ''}`;
      const en = getLanguage() === 'en';
      const status = r.catchRecoveryLeft > 0 ? (en ? 'Recovering' : '다시 달려요') : r.threat > 0.65 ? (en ? 'Close behind!' : '바로 뒤예요!') : r.speed > r.chaserSpeed ? (en ? 'Pulling ahead' : '거리를 벌려요') : (en ? 'Closing in' : '따라오고 있어요');
      this.trackGap.textContent = en ? `${Math.ceil(r.gap)}m behind · ${status}` : `${Math.ceil(r.gap)}m 뒤 · ${status}`;
      this.track.classList.toggle('danger', r.threat > 0.65);
    }
  }

  /** 보상 이동 연출의 도착점. 실제 보상 계산과는 무관한 표시 전용 훅이다. */
  rewardTarget(kind: 'coin' | 'heart') {
    return kind === 'heart' ? this.hpText : this.scoreVal;
  }

  /** 화면이 바뀔 때 지연 연출과 RAF가 다음 판에 남지 않게 정리한다. */
  dispose() {
    window.clearTimeout(this.hpTrailTimer);
    window.clearTimeout(this.enemyTrailTimer);
    window.clearTimeout(this.damageTimer);
    cancelAnimationFrame(this.scoreFrame);
  }

  private updateHealthBar(hp: number, maxHp: number) {
    const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
    const previous = this.lastHp;
    this.hpFill.style.width = `${pct}%`;
    if (previous == null || hp > previous) {
      window.clearTimeout(this.hpTrailTimer);
      this.hpTrailFill.style.width = `${pct}%`;
    } else if (hp < previous) {
      this.left.classList.remove('took-damage');
      void this.left.offsetWidth;
      this.left.classList.add('took-damage');
      window.clearTimeout(this.damageTimer);
      this.damageTimer = window.setTimeout(() => this.left.classList.remove('took-damage'), 520);
      window.clearTimeout(this.hpTrailTimer);
      this.hpTrailTimer = window.setTimeout(() => { this.hpTrailFill.style.width = `${pct}%`; }, 360);
    }
    this.left.classList.toggle('danger', pct <= 30);
    this.lastHp = hp;
  }

  private updateEnemyHealthBar(hp: number, maxHp: number) {
    const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
    const previous = this.lastEnemyHp;
    this.enemyFill.style.width = `${pct}%`;
    if (previous == null || hp > previous) {
      window.clearTimeout(this.enemyTrailTimer);
      this.enemyTrailFill.style.width = `${pct}%`;
    } else if (hp < previous) {
      window.clearTimeout(this.enemyTrailTimer);
      this.enemyTrailTimer = window.setTimeout(() => { this.enemyTrailFill.style.width = `${pct}%`; }, 260);
    }
    this.lastEnemyHp = hp;
  }

  private animateScore(score: number) {
    if (this.scoreTarget === score && this.scoreFrame) return;
    const previous = this.displayedScore;
    cancelAnimationFrame(this.scoreFrame);
    this.scoreFrame = 0;
    this.scoreTarget = score;
    if (previous == null || previous === score || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.displayedScore = score;
      this.scoreVal.textContent = fmt.int(score);
      return;
    }
    const started = performance.now();
    const duration = Math.min(320, 140 + Math.abs(score - previous) * 2);
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      this.displayedScore = Math.round(previous + (score - previous) * eased);
      this.scoreVal.textContent = fmt.int(this.displayedScore);
      if (p < 1) this.scoreFrame = requestAnimationFrame(step);
      else { this.displayedScore = score; this.scoreFrame = 0; }
    };
    this.scoreFrame = requestAnimationFrame(step);
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
