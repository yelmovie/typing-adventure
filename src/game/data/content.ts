import type { ContentUnit, StageId, WordVariant } from '../types';
import raw from './content.json';

const ALL: ContentUnit[] = (raw.units as ContentUnit[]).map((u) => ({ ...u, text: u.text.normalize('NFC') }));

export function getContentForStage(stage: StageId): ContentUnit[] {
  return ALL.filter((u) => u.stage === stage);
}

function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 출제 목록 생성: 쉬운(difficulty 낮은) 것부터, 같은 난이도 안에서는 무작위.
 * count 보다 콘텐츠가 적으면 순환 출제.
 */
export function buildTargetList(stage: StageId, count: number): ContentUnit[] {
  const pool = getContentForStage(stage);
  if (pool.length === 0) return [];
  const groups = new Map<number, ContentUnit[]>();
  for (const u of pool) {
    const g = groups.get(u.difficulty) ?? [];
    g.push(u);
    groups.set(u.difficulty, g);
  }
  const ordered: ContentUnit[] = [];
  for (const d of [...groups.keys()].sort((a, b) => a - b)) ordered.push(...shuffle(groups.get(d)!));
  const out: ContentUnit[] = [];
  let i = 0;
  while (out.length < count) {
    out.push(ordered[i % ordered.length]);
    i++;
  }
  return out;
}

/**
 * 몰래 적응형 난이도용: 기준 단위의 난이도에 offset(-1/0/+1)을 더한 난이도의 다른 단위를 고른다.
 * 그 난이도에 콘텐츠가 없으면 기준 단위를 그대로 돌려준다. (UI 비노출)
 */
export function pickAdjusted(stage: StageId, base: ContentUnit, offset: number, avoidIds: Set<string>, rnd: () => number = Math.random): ContentUnit {
  if (offset === 0) return base;
  const want = base.difficulty + offset;
  const cand = getContentForStage(stage).filter((u) => u.difficulty === want && u.type === base.type && !avoidIds.has(u.id));
  if (cand.length === 0) return base;
  return cand[Math.floor(rnd() * cand.length)];
}

const VARIANT_TAG: Record<string, WordVariant> = { 보물: 'treasure', 하트: 'heart', 폭탄: 'bomb' };
export const VARIANT_RATE = 0.12;

/** 변화구 단어 부여: 태그(보물/하트/폭탄)가 있으면 강제, 없으면 12% 확률. 폭탄은 낱말에만. */
export function applyVariant(u: ContentUnit, rnd: () => number = Math.random): ContentUnit {
  const forced = u.tags.map((t) => VARIANT_TAG[t]).find(Boolean);
  if (forced) return { ...u, variant: forced };
  if (rnd() >= VARIANT_RATE) return u;
  const roll = rnd();
  const variant: WordVariant = roll < 0.4 ? 'treasure' : roll < 0.7 ? 'heart' : 'bomb';
  if (variant === 'bomb' && u.type !== 'word') return { ...u, variant: 'treasure' };
  return { ...u, variant };
}

export function allContent(): ContentUnit[] {
  return ALL;
}
