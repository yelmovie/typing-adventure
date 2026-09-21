import Phaser from 'phaser';

/** Phaser ↔ DOM UI 연결용 이벤트 버스 (02_trd.json event_bus 기준) */
export const Events = {
  BATTLE_START: 'BATTLE_START',
  TARGET_CHANGED: 'TARGET_CHANGED',
  INPUT_CORRECT: 'INPUT_CORRECT',
  INPUT_WRONG: 'INPUT_WRONG',
  COMBO_CHANGED: 'COMBO_CHANGED',
  PLAYER_HIT: 'PLAYER_HIT',
  ENEMY_HIT: 'ENEMY_HIT',
  ENEMY_DEFEATED: 'ENEMY_DEFEATED',
  ENEMY_SPAWN: 'ENEMY_SPAWN',
  STAGE_CLEAR: 'STAGE_CLEAR',
  STAGE_FAILED: 'STAGE_FAILED',
  SAVE_UPDATED: 'SAVE_UPDATED',
  HUD_TICK: 'HUD_TICK',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  PREVIEW_CHANGED: 'PREVIEW_CHANGED',
  MAP_FOCUS: 'MAP_FOCUS',
  BATTLE_PAUSE: 'BATTLE_PAUSE',
  // v2 공통 시스템
  SYLLABLE_HIT: 'SYLLABLE_HIT', // 음절 확정이 목표와 맞음 → 약공격
  SYLLABLE_MISS: 'SYLLABLE_MISS', // 틀린 음절 확정 (판정 아님, 표시만)
  FEVER_CHANGED: 'FEVER_CHANGED', // { level: 0|1|2|3 }
  PET_ACTIVE: 'PET_ACTIVE', // POWER/FEVER 진입 시 펫 액티브 { active, pet }
  PET_PASSIVE: 'PET_PASSIVE', // 펫 패시브가 실제로 작동한 순간 { passive, pet }
  IDLE_DRAIN: 'IDLE_DRAIN', // 무입력으로 HP 감소 { hpLoss, hp }
  SKIP: 'SKIP', // 점프로 낱말 건너뜀 { left, target }
  WAVE_SWEEP: 'WAVE_SWEEP', // 5콤보마다 화면의 적 전부 소탕 { combo, count }
  ITEM_DROP: 'ITEM_DROP', // 처치한 몬스터가 떨어뜨린 아이템 { uid, item, score }
  ITEM_COLLECTED: 'ITEM_COLLECTED', // 인벤토리에 쌓인 사용형 아이템 { item, inventory }
  ITEM_USED: 'ITEM_USED', // F1/버튼으로 사용한 아이템 { item, inventory }
  ITEM_APPLIED: 'ITEM_APPLIED', // 아이템 효과 발동(방패·번개 등) { item }
  BOMB_EXPLODE: 'BOMB_EXPLODE', // 폭탄 단어 시간 초과
  VARIANT_BONUS: 'VARIANT_BONUS', // 보물/하트 획득 { variant, ... }
  HP_HEAL: 'HP_HEAL', // 콤보 회복·PERFECT 회복 { amount, hp }
  PLAYER_MOVE: 'PLAYER_MOVE', // 방향키 입력 { dir, pressed } — 씬이 연출만
  DODGE: 'DODGE', // 점프/앉기로 몬스터 접촉 회피 { uid, kind }
  RALLY: 'RALLY', // 기운내기 — HP 가 바닥날 뻔했을 때 판당 1회 적 정지 + 회복 { hp, heal, stunSec }
  // 소개 화면에서 캐릭터·펫·몬스터가 자리를 잡았다. DOM 말풍선이 이 좌표에 붙는다
  // { anchors: [{ who, x, y }] } — x 는 가운데, y 는 머리 끝(디자인 1920×1080 좌표)
  INTRO_ANCHORS: 'INTRO_ANCHORS',
  // 스테이지 1 웨이브
  WAVE_SPAWN: 'WAVE_SPAWN',
  WAVE_TICK: 'WAVE_TICK',
  WAVE_HIT: 'WAVE_HIT',
  WAVE_BOSS_HIT: 'WAVE_BOSS_HIT',
  WAVE_DEFEAT: 'WAVE_DEFEAT',
  WAVE_TOUCH: 'WAVE_TOUCH',
  WAVE_PUSH: 'WAVE_PUSH',
  WAVE_GATE: 'WAVE_GATE',
  GEM_COLLECTED: 'GEM_COLLECTED',
  GEM_USED: 'GEM_USED',
  // 스테이지 2 레이스
  RACE_TICK: 'RACE_TICK',
  RACE_CAUGHT: 'RACE_CAUGHT',
  RACE_TURBO: 'RACE_TURBO',
  RACE_FINISH: 'RACE_FINISH',
  // 스테이지 3 편지
  LETTER_RUNE: 'LETTER_RUNE',
  LETTER_CRACK: 'LETTER_CRACK',
  LETTER_RESTORE: 'LETTER_RESTORE',
  LETTER_GLOW: 'LETTER_GLOW',
  LETTER_LINE: 'LETTER_LINE',
  LETTER_LOCK: 'LETTER_LOCK',
  LETTER_IDLE: 'LETTER_IDLE',
  LETTER_SECRET: 'LETTER_SECRET',
  LETTER_GATE: 'LETTER_GATE',
  LETTER_CHOICE: 'LETTER_CHOICE', // 다음 조각 고르기 시작 { choices, index, total, choose(i) }
  LETTER_CHOICE_OK: 'LETTER_CHOICE_OK', // 정답 조각 { index, text }
  LETTER_CHOICE_WRONG: 'LETTER_CHOICE_WRONG', // 오답 조각 { index, text, hint, mistakes }
  // 스테이지 4 전보
  TELE_TICK: 'TELE_TICK',
  TELE_WORD: 'TELE_WORD',
  TELE_OUTAGE: 'TELE_OUTAGE',
  TELE_BRAKE: 'TELE_BRAKE',
  TELE_STOP: 'TELE_STOP',
  TELE_CRASH: 'TELE_CRASH',
  // 스테이지 5 보스
  BOSS_TICK: 'BOSS_TICK',
  BOSS_PHASE: 'BOSS_PHASE',
  BOSS_CRYSTAL_HIT: 'BOSS_CRYSTAL_HIT',
  BOSS_CRYSTAL_BREAK: 'BOSS_CRYSTAL_BREAK',
  BOSS_QUEUE: 'BOSS_QUEUE',
  BOSS_HIT: 'BOSS_HIT',
  BOSS_DARK: 'BOSS_DARK',
  BOSS_ARMOR: 'BOSS_ARMOR',
  BOSS_CORE: 'BOSS_CORE',
  BOSS_FINAL: 'BOSS_FINAL',
} as const;

export const EventBus = new Phaser.Events.EventEmitter();
