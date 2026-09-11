// 공통 타입 정의 (data/typing_adventure_design_package 기준)

export type Difficulty = 'beginner' | 'normal' | 'challenge';
export type GameLanguage = 'ko' | 'en';
export type StageId = 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'daily';
export type ContentType = 'word' | 'sentence';
/** 변화구 단어: 보물(코인·점수) / 하트(HP·시간 회복) / 폭탄(5초 제한, 실패 시 콤보만 초기화) */
export type WordVariant = 'treasure' | 'heart' | 'bomb';
export type StageMode = 'wave' | 'race' | 'letter' | 'telegram' | 'boss' | 'daily';

export interface ContentUnit {
  id: string;
  stage: StageId;
  type: ContentType;
  text: string;
  difficulty: number;
  tags: string[];
  weight: number;
  variant?: WordVariant;
}

export interface UnlockRule {
  stars?: number; // 별 총합
  badge?: string; // 배지 id
  desc: string;
}
export interface CharacterDef {
  id: string;
  name: string;
  desc: string;
  sheet: string; // atlas key
  unlock?: UnlockRule;
}

export type PetPassive = 'block_wrong' | 'bomb_time' | 'strong_bonus' | 'key_hint';
export type PetActive = 'shield' | 'time_plus' | 'fire_aoe' | 'word_hint';
export interface PetDef {
  id: string;
  name: string;
  desc: string;
  sheet: string;
  passive: PetPassive;
  passiveDesc: string;
  active: PetActive; // FEVER 진입 시 자동 발동
  activeDesc: string;
  unlock?: UnlockRule;
}

export interface EnemyDef {
  id: string;
  name: string;
  sheet: string;
  baseHp: number;
  scale: number;
  desc: string;
}

export interface StageDef {
  id: StageId;
  index: number; // 1..5
  mode: StageMode;
  name: string;
  subtitle: string;
  focus: string;
  goal: string;
  mission: string;
  enemies: string[]; // enemy ids in order
  targets: number;
  timeLimitSec: number;
  bgIntro: string;
  bgBattle: string;
  map: { x: number; y: number; icon: string };
  goalTimeSec: number; // 3성 조건용 목표 시간
  goalCombo: number; // 3성 조건용 콤보
  playable: boolean;
}

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

// ---- 저장 스키마 (06_local_save_schema.json) ----
export interface SaveProfile {
  name: string;
  characterId: string;
  petId: string;
  difficulty: Difficulty;
  /** 인증서 능력 진술: "나는 이제 ___ 할 수 있다" */
  canDo?: string;
}
export interface SaveProgress {
  tutorialCompleted?: boolean;
  /** First-time preparation, archived independently for Korean and English. */
  practicedParts?: Array<'consonants' | 'vowels' | 'sentences' | 'story'>;
  unlockedStage: number;
  stageStars: Record<string, number>;
  clearedStages: string[];
  coins: number;
  /** 스테이지별 실패 횟수 → 3회면 도움 모드 제안 */
  fails: Record<string, number>;
  /** 도움 모드 켠 스테이지 (기초 난이도 규칙 적용) */
  assist: Record<string, boolean>;
}
export interface SaveRecords {
  bestCpm: number;
  bestAccuracy: number;
  bestCombo: number;
  bestScoreByStage: Record<string, number>;
  /** 레이스 고스트(어제의 나): 스테이지별 최고 기록의 1초 간격 거리 샘플 */
  ghosts: Record<string, RaceGhost>;
  /** 오늘의 도전: 날짜(YYYY-MM-DD)별 최고 기록 */
  daily: Record<string, { cpm: number; accuracy: number; score: number; maxCombo: number }>;
  learning?: LearningProgress;
  replay?: { day: string; completed: string[]; stamps: number };
}

export type LearningPattern = 'letters' | 'batchim' | 'vowel' | 'spacing' | 'punctuation';
export interface LearningAttempt {
  targetId: string;
  target: string;
  typed: string;
  outcome: 'correct' | 'wrong' | 'skipped';
  corrected: boolean;
}
export interface LearningFocus {
  mistakes: number;
  corrections: number;
  newSuccesses: number;
  delayedSuccesses: number;
  lastTarget: string;
  lastTyped: string;
  lastErrorAt: string;
  pendingTargets?: string[];
  transferTargets?: string[];
  /** Texts whose original error was compared with the target (not a mastery score). */
  comparedTargets?: string[];
  resolvedAt?: string;
}
export interface LearningSession {
  at: string;
  stageId: StageId;
  source: 'game' | 'practice';
  accuracy: number;
  cpm: number;
  correct: number;
  corrected: number;
  skipped: number;
  newSuccesses: number;
}
export interface LearningProgress {
  patterns: Partial<Record<LearningPattern, LearningFocus>>;
  recent: LearningSession[];
  seen: string[];
}
export interface SaveCollection {
  badges: string[];
  wordsSeen: string[];
  petsUnlocked: string[];
  charactersUnlocked: string[];
  enemiesSeen: string[];
}
export interface SaveSettings {
  language?: GameLanguage;
  bgm: boolean;
  sfx: boolean;
  screenShake: boolean;
  showKeyboardGuide: boolean;
  bgmVolume: number; // 0..1
  sfxVolume: number; // 0..1
  /** 프롤로그를 봤는지 (새 모험 시작 시 1회 표시) */
  prologueSeen: boolean;
}
export interface SaveData {
  languageArchives?: Partial<Record<GameLanguage, SaveSnapshot>>;
  version: string;
  profile: SaveProfile;
  progress: SaveProgress;
  records: SaveRecords;
  collection: SaveCollection;
  settings: SaveSettings;
  stats: {
    totalClears: number;
    totalWords: number;
    totalPlaySec: number;
  };
  updatedAt: string;
}

// ---- 전투 결과 ----
export type SaveSnapshot = Pick<SaveData, 'profile' | 'progress' | 'records' | 'collection' | 'stats'>;
export interface RaceGhost {
  samples: number[];
  finishSec: number;
  goalDistance?: number;
  rulesVersion?: number;
}
export interface BattleResult {
  remix?: boolean;
  replayRewards?: string[];
  stageId: StageId;
  cleared: boolean;
  failReason?: 'time' | 'hp';
  score: number;
  accuracy: number; // 0~100
  cpm: number; // 타/분
  maxCombo: number;
  elapsedSec: number;
  wordsDone: number;
  wordsTotal: number;
  perfectCount: number;
  coins: number;
  /** 레이스: 이번 판 고스트 기록 (더 빠르면 저장) / 어제의 나를 이겼는지 */
  ghost?: RaceGhost;
  beatGhost?: boolean;
  /** 이번 판으로 새로 열린 캐릭터/펫 이름 */
  newUnlocks?: string[];
  /** 오늘의 도전: 오늘 기록 갱신 여부 */
  dailyNew?: boolean;
  /** 이번 판 코인으로 새로 열린 칭호·장식 */
  newTitles?: string[];
  /** 오답 노트: 틀렸던 낱말·문장 */
  mistakes?: string[];
  learningAttempts?: LearningAttempt[];
  attemptedCount?: number;
  skippedCount?: number;
  correctedCount?: number;
  stars: number;
  newBadges: string[];
  isNewCpm: boolean;
  isNewAccuracy: boolean;
  isNewCombo: boolean;
  isNewScore: boolean;
  wordsSeen: string[];
}

export type ScreenName = 'home' | 'setup' | 'tutorial' | 'worldmap' | 'intro' | 'battle' | 'result';
