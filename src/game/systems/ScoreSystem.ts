import type { BattleResult, StageDef, SaveData } from '../types';
import { evaluateBadges, evaluateStreakBadges } from '../data/badges';
import { SaveSystem } from './SaveSystem';
import { unlockEligibleFriends } from '../data/characters';
import { todayKey, currentDailyKind, touchStreak } from './DailySystem';
import { currentTitle, unlockedDecors } from '../data/titles';
import { calcStars, hasAchievement } from './AwardRules';
import { recordBattleLearning } from './LearningSystem';
import { STAGES } from '../data/stages';
import { awardReplay } from './ReplaySystem';
import { evaluateChallenges, challengesDone } from '../data/challenges';

export { TypingStats, DAMAGE, calcDamage, calcWordScore } from './TypingStats';

export { calcStars } from './AwardRules';

/** 결과 확정 + 저장(기록/별/해금/배지/코인) */
export function finalizeAndSave(partial: Omit<BattleResult, 'newBadges' | 'isNewCpm' | 'isNewAccuracy' | 'isNewCombo' | 'isNewScore' | 'stars' | 'newUnlocks'>, stage: StageDef): BattleResult {
  const save: SaveData = SaveSystem.get();
  partial = { ...partial, cleared: hasAchievement(partial) };
  recordBattleLearning(save, partial);
  partial.replayRewards = awardReplay(save, partial);
  // 출석 스트릭: 완료한 판(지역·모험 플러스·오늘의 도전)이 있는 날은 출석. 배지 평가보다 먼저 찍는다.
  if (partial.cleared) touchStreak(save);
  if (stage.mode === 'daily') {
    save.records.daily ??= {};
    // word 는 기존 키 그대로(하위 호환: 인증서·모달이 이 키를 읽음), 문장/긴 글은 종류별로 따로 저장
    const kind = currentDailyKind();
    const key = kind === 'word' ? todayKey() : `${todayKey()}:${kind}`;
    const prev = save.records.daily[key];
    const mine = { cpm: Math.round(partial.cpm), accuracy: Math.round(partial.accuracy * 10) / 10, score: partial.score, maxCombo: partial.maxCombo };
    const dailyNew = partial.cleared && (!prev || mine.accuracy > prev.accuracy || (mine.accuracy === prev.accuracy && mine.cpm > prev.cpm));
    if (dailyNew) save.records.daily[key] = mine;
    if (partial.cleared) {
      save.stats.totalWords += partial.wordsDone;
      save.stats.totalPlaySec += Math.round(partial.elapsedSec);
      if (partial.cpm > save.records.bestCpm) save.records.bestCpm = Math.round(partial.cpm);
      save.records.bestAccuracy = Math.max(save.records.bestAccuracy, mine.accuracy);
      save.records.bestCombo = Math.max(save.records.bestCombo, mine.maxCombo);
    }
    // 오늘의 도전은 지역 배지를 주지 않지만, 출석 스트릭 배지는 여기서도 받는다.
    const streakBadges = partial.cleared ? evaluateStreakBadges(save) : [];
    for (const b of streakBadges) if (!save.collection.badges.includes(b)) save.collection.badges.push(b);
    const newUnlocks = unlockEligibleFriends(save);
    SaveSystem.save();
    return { ...partial, stars: calcStars(stage, partial.cleared, partial.accuracy, partial.elapsedSec, partial.maxCombo), newBadges: streakBadges, isNewCpm: false, isNewAccuracy: false, isNewCombo: false, isNewScore: false, newUnlocks, dailyNew };
  }
  const stars = calcStars(stage, partial.cleared, partial.accuracy, partial.elapsedSec, partial.maxCombo);
  const base = { ...partial, stars };

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
  const newBadges = evaluateBadges(base, save); // 이번 판 코인으로 임계값을 넘으면 같은 결과에서 배지를 받는다.
  // 도전 카드(별보다 엄격한 지역별 목표 3개)와 모험 플러스 이야기 완주는 완료한 판에서만 채운다.
  const newChallenges = evaluateChallenges(base, stage.id, challengesDone(save, stage.id));
  if (newChallenges.length) {
    save.progress.challenges ??= {};
    save.progress.challenges[stage.id] = [...challengesDone(save, stage.id), ...newChallenges];
  }
  if (partial.cleared && partial.remix && typeof partial.remixStory === 'number') {
    save.progress.storiesDone ??= {};
    const done = save.progress.storiesDone[stage.id] ?? [];
    if (!done.includes(partial.remixStory)) save.progress.storiesDone[stage.id] = [...done, partial.remixStory];
  }
  const newTitles: string[] = [];
  if (currentTitle(save.progress.coins).name !== currentTitle(coinsBefore).name) newTitles.push(`칭호 「${currentTitle(save.progress.coins).name}」`);
  for (const d of unlockedDecors(save.progress.coins)) if (d.coins > coinsBefore) newTitles.push(`홈 장식 ${d.icon} ${d.name}`);
  if (partial.cleared && partial.ghost) {
    save.records.ghosts ??= {};
    const prev = save.records.ghosts[stage.id];
    if (!prev || prev.goalDistance !== partial.ghost.goalDistance || prev.rulesVersion !== partial.ghost.rulesVersion || partial.ghost.finishSec < prev.finishSec) save.records.ghosts[stage.id] = partial.ghost;
  }
  if (partial.cleared) {
    const prevStars = save.progress.stageStars[stage.id] ?? 0;
    save.progress.stageStars[stage.id] = Math.max(prevStars, stars);
    if (!save.progress.clearedStages.includes(stage.id)) save.progress.clearedStages.push(stage.id);
    save.progress.unlockedStage = Math.max(save.progress.unlockedStage, Math.min(STAGES.length, stage.index + 1));
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
  const newUnlocks = unlockEligibleFriends(save);
  SaveSystem.save();

  return { ...base, newBadges, newChallenges, isNewCpm, isNewAccuracy, isNewCombo, isNewScore, newUnlocks, newTitles };
}
