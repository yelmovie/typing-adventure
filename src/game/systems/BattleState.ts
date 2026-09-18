import type { ContentUnit, StageDef } from '../types';
import type { FeverLevel, TypingRun } from './TypingRun';
import type { CheckpointState } from './Checkpoint';
export type { CheckpointState } from './Checkpoint';

export interface EnemyState {
  id: string;
  name: string;
  sheet: string;
  hp: number;
  maxHp: number;
  scale: number;
}

export interface BattleSnapshot {
  targetIndex: number;
  targetTotal: number;
  target: ContentUnit | null;
  combo: number;
  maxCombo: number;
  score: number;
  playerHp: number;
  playerMaxHp: number;
  timeLeft: number;
  timeLimit: number;
  accuracy: number;
  cpm: number;
  enemy: EnemyState | null;
  enemyIndex: number;
  enemyTotal: number;
  totalEnemyHp: number;
  dealtDamage: number;
  perfectCount: number;
  wordsDone: number;
  elapsedSec: number;
  feverLevel: FeverLevel;
  feverLeft: number;
  bombLeft: number | null;
  shielded: boolean;
  coins: number;
  nextHint: string | null;
  /** 모드별 부가 정보 (HUD가 있으면 쓰고 없으면 무시) */
  enemyLabel?: string;
  race?: import('./RaceSystem').RaceInfo;
  letter?: import('./LetterSystem').LetterInfo;
  telegram?: import('./TelegramSystem').TelegramInfo;
  boss?: import('./BossSystem').BossInfo;
}

/** BattleScreen 이 모드별 규칙 클래스를 같은 방식으로 다루기 위한 최소 인터페이스 */
export interface TypingMode {
  readonly stage: StageDef;
  readonly run: TypingRun;
  finished: boolean;
  start(): void;
  tick(dt: number): void;
  pause(): void;
  resume(): void;
  commit(value: string): void;
  submit(value: string, usedBackspace: boolean): void;
  /** 점프: 현재 목표 건너뛰기 (남은 횟수 없으면 false) */
  skip(): boolean;
  /** 방향키 이동 (모드가 지원할 때만) */
  move?(dir: 'left' | 'right' | 'up' | 'down', pressed: boolean): void;
  snapshot(): BattleSnapshot;
  wordsSeen(): string[];
  /** 중간 저장: 새로고침 뒤 같은 자리에서 이어가기 위한 상태 (JSON-safe) */
  serialize?(): CheckpointState;
  /** 중간 저장 복원 — 생성 직후, start() 전에 호출한다. 손상된 값은 각 모드가 안전하게 보정한다 */
  restore?(state: CheckpointState): void;
}

