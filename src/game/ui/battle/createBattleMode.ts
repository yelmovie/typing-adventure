import type { ContentUnit, Difficulty, GameLanguage, PetDef, RaceGhost, StageDef } from '../../types';
import type { TypingMode } from '../../systems/BattleState';
import type { Emit } from '../../systems/TypingRun';
import { WaveSystem } from '../../systems/WaveSystem';
import { RaceSystem } from '../../systems/RaceSystem';
import { LetterSystem } from '../../systems/LetterSystem';
import { TelegramSystem } from '../../systems/TelegramSystem';
import { BossSystem } from '../../systems/BossSystem';
import { DailySystem, DAILY, pickDailyLong, pickDailyWords, type DailyKind } from '../../systems/DailySystem';

export interface BattleModeOptions {
  stage: StageDef;
  difficulty: Difficulty;
  pet: PetDef;
  stagePool: ContentUnit[];
  allPool: ContentUnit[];
  language: GameLanguage;
  ghost: RaceGhost | null;
  enemySheet: string;
  dailyKind?: DailyKind;
  dailyKey: string;
  emit: Emit;
}

/** Content selection and construction only; storage, locale, clock and event bus are supplied by the caller. */
export function createBattleMode(options: BattleModeOptions): TypingMode {
  const { stage, difficulty, pet, stagePool, allPool, language, ghost, enemySheet, dailyKey, emit } = options;
  switch (stage.mode) {
    case 'wave': {
      const pool = stagePool.filter(u => u.type === 'word');
      const length = (u: ContentUnit) => [...u.text].filter(c => c.trim()).length;
      const short = pool.filter(u => length(u) <= (language === 'en' ? 4 : 2));
      const long = pool.filter(u => length(u) >= (language === 'en' ? 5 : 3));
      return new WaveSystem(stage, difficulty, pet, { slime: short.length ? short : pool, bat: long.length ? long : pool }, emit);
    }
    case 'race':
      return new RaceSystem(stage, difficulty, pet, stagePool.filter(u => u.type === 'word'), ghost, enemySheet, emit);
    case 'letter': {
      const all = stagePool.filter(u => u.type === 'sentence');
      const letter = all.filter(u => u.tags.includes('편지')).sort(byOrder);
      return new LetterSystem(stage, difficulty, pet, letter.length >= 6 ? letter : all, emit);
    }
    case 'telegram': {
      const all = stagePool.filter(u => u.type === 'sentence');
      const telegram = all.filter(u => u.tags.includes('전보')).sort(byOrder);
      return new TelegramSystem(stage, difficulty, pet, telegram.length >= 3 ? telegram : all.slice(0, 3), emit);
    }
    case 'boss': {
      const tagged = (tag: string) => stagePool.filter(u => u.tags.includes(tag));
      const words = stagePool.filter(u => u.type === 'word');
      const crystals = tagged('결정').length >= 5 ? tagged('결정') : words.slice(0, 5);
      const rush = tagged('러시').length >= 5 ? tagged('러시') : words;
      const final = (tagged('최종').length >= 2 ? tagged('최종') : stagePool.filter(u => u.type === 'sentence')).sort(byOrder);
      return new BossSystem(stage, difficulty, pet, { crystals, rush, final }, enemySheet, emit);
    }
    case 'daily': {
      const kind = options.dailyKind ?? 'word';
      const words = kind === 'word'
        ? pickDailyWords(allPool.filter(u => u.type === 'word'), DAILY.words, dailyKey)
        : kind === 'sentence'
          ? pickDailyWords(allPool.filter(u => u.type === 'sentence' && u.tags.includes('오늘문장')), DAILY.sentences, dailyKey)
          : pickDailyLong(allPool.filter(u => u.type === 'sentence' && u.tags.some(tag => /^장문\d+$/.test(tag))), dailyKey);
      return new DailySystem(stage, difficulty, pet, words, emit, kind);
    }
    default: {
      const unsupported: never = stage.mode;
      throw new Error(`Unsupported stage mode: ${unsupported}`);
    }
  }
}

/** A missing order tag is zero; sorting filtered arrays leaves the source corpus untouched. */
function byOrder(a: ContentUnit, b: ContentUnit): number {
  const order = (unit: ContentUnit) => Number((unit.tags.find(tag => tag.startsWith('순서')) ?? '순서0').slice(2));
  return order(a) - order(b);
}
