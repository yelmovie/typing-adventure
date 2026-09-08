import type { BattleResult, StageDef, SaveData } from '../types';
import { evaluateBadges } from '../data/badges';
import { SaveSystem } from './SaveSystem';
import { CHARACTERS, PETS, unlockMet } from '../data/characters';
import { todayKey, currentDailyKind } from './DailySystem';
import { currentTitle, unlockedDecors } from '../data/titles';

export { TypingStats, DAMAGE, calcDamage, calcWordScore } from './TypingStats';

export function calcStars(stage: StageDef, cleared: boolean, accuracy: number, elapsedSec: number, maxCombo: number): number {
  if (!cleared) return 0;
  let stars = 1;
  if (accuracy >= 90) stars = 2;
  if (accuracy >= 95 && (elapsedSec <= stage.goalTimeSec || maxCombo >= stage.goalCombo)) stars = 3;
  return stars;
}

/** 결과 확정 + 저장(기록/별/해금/배지/코인) */
export function finalizeAndSave(partial: Omit<BattleResult, 'newBadges' | 'isNewCpm' | 'isNewAccuracy' | 'isNewCombo' | 'isNewScore' | 'stars' | 'newUnlocks'>, stage: StageDef): BattleResult {
  const save: SaveData = SaveSystem.get();
  if (stage.mode === 'daily') {
    save.records.daily ??= {};
    // word 는 기존 키 그대로(하위 호환: 인증서·모달이 이 키를 읽음), 문장/긴 글은 종류별로 따로 저장
    const kind = currentDailyKind();
    const key = kind === 'word' ? todayKey() : `${todayKey()}:${kind}`;
    const prev = save.records.daily[key];
    const mine = { cpm: Math.round(partial.cpm), accuracy: Math.round(partial.accuracy * 10) / 10, score: partial.score, maxCombo: partial.maxCombo };
    const dailyNew = partial.cleared && (!prev || mine.cpm > prev.cpm || (mine.cpm === prev.cpm && mine.accuracy > prev.accuracy));
    if (dailyNew) save.records.daily[key] = mine;
    if (partial.cleared) {
      save.stats.totalWords += partial.wordsDone;
      save.stats.totalPlaySec += Math.round(partial.elapsedSec);
      if (partial.cpm > save.records.bestCpm) save.records.bestCpm = Math.round(partial.cpm);
    }
    SaveSystem.save();
    return { ...partial, stars: partial.cleared ? 3 : 0, newBadges: [], isNewCpm: false, isNewAccuracy: false, isNewCombo: false, isNewScore: false, newUnlocks: [], dailyNew };
  }
  const stars = calcStars(stage, partial.cleared, partial.accuracy, partial.elapsedSec, partial.maxCombo);
  const base = { ...partial, stars };
  const newBadges = evaluateBadges(base, save);

  const isNewCpm = partial.cleared && partial.cpm > save.records.bestCpm;
  const isNewAccuracy = partial.cleared && partial.accuracy > save.records.bestAccuracy;
  const isNewCombo = partial.maxCombo > save.records.bestCombo;
  const prevScore = save.records.bestScoreByStage[stage.id] ?? 0;
  const isNewScore = partial.cleared && partial.score > prevScore;

  if (isNewCpm) save.records.bestCpm = Math.round(partial.cpm);
  if (isNewAccuracy) save.records.bestAccuracy = Math.round(partial.accuracy * 10) / 10;
  if (isNewCombo) save.records.bestCombo = partial.maxCombo;
  if (isNewScore) save.records.bestScoreByStage[stage.id] = partial.score;

  const coinsBefore = save.progress.coins ?? 0;
  save.progress.coins = coinsBefore + partial.coins;
  const newTitles: string[] = [];
  if (currentTitle(save.progress.coins).name !== currentTitle(coinsBefore).name) newTitles.push(`칭호 「${currentTitle(save.progress.coins).name}」`);
  for (const d of unlockedDecors(save.progress.coins)) if (d.coins > coinsBefore) newTitles.push(`홈 장식 ${d.icon} ${d.name}`);
  if (partial.cleared && partial.ghost) {
    save.records.ghosts ??= {};
    const prev = save.records.ghosts[stage.id];
    if (!prev || partial.ghost.finishSec < prev.finishSec) save.records.ghosts[stage.id] = partial.ghost;
  }
  if (partial.cleared) {
    const prevStars = save.progress.stageStars[stage.id] ?? 0;
    save.progress.stageStars[stage.id] = Math.max(prevStars, stars);
    if (!save.progress.clearedStages.includes(stage.id)) save.progress.clearedStages.push(stage.id);
    save.progress.unlockedStage = Math.max(save.progress.unlockedStage, Math.min(5, stage.index + 1));
    save.stats.totalClears++;
  }
  save.stats.totalWords += partial.wordsDone;
  save.stats.totalPlaySec += Math.round(partial.elapsedSec);
  for (const w of partial.wordsSeen) if (!save.collection.wordsSeen.includes(w)) save.collection.wordsSeen.push(w);
  for (const e of stage.enemies) if (!save.collection.enemiesSeen.includes(e)) save.collection.enemiesSeen.push(e);
  for (const b of newBadges) if (!save.collection.badges.includes(b)) save.collection.badges.push(b);
  if (!partial.cleared) {
    save.progress.fails ??= {};
    save.progress.fails[stage.id] = (save.progress.fails[stage.id] ?? 0) + 1;
  }
  // 캐릭터·펫 해금
  const newUnlocks: string[] = [];
  save.collection.charactersUnlocked ??= ['brown_boy', 'pink_girl', 'glasses_boy'];
  for (const c of CHARACTERS) {
    if (!save.collection.charactersUnlocked.includes(c.id) && unlockMet(c.unlock, save)) {
      save.collection.charactersUnlocked.push(c.id);
      newUnlocks.push(`캐릭터 ${c.name}`);
    }
  }
  for (const p of PETS) {
    if (!save.collection.petsUnlocked.includes(p.id) && unlockMet(p.unlock, save)) {
      save.collection.petsUnlocked.push(p.id);
      newUnlocks.push(`펫 ${p.name}`);
    }
  }
  SaveSystem.save();

  return { ...base, newBadges, isNewCpm, isNewAccuracy, isNewCombo, isNewScore, newUnlocks, newTitles };
}
