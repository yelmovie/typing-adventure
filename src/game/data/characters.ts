import type { CharacterDef, PetDef, UnlockRule } from '../types';

export const CHARACTERS: CharacterDef[] = [
  { id: 'brown_boy', name: '하늘', desc: '빨간 목도리의 씩씩한 모험가', sheet: 'char_brown_boy' },
  { id: 'pink_girl', name: '보라', desc: '분홍 후드의 명랑한 탐험가', sheet: 'char_pink_girl' },
  { id: 'glasses_boy', name: '지호', desc: '안경 쓴 똑똑한 책벌레', sheet: 'char_glasses_boy' },
  { id: 'blond_explorer', name: '루카', desc: '고글을 쓴 용감한 탐험대장', sheet: 'char_blond_explorer', unlock: { stars: 6, desc: '별 6개 모으면 합류' } },
];

export const PETS: PetDef[] = [
  { id: 'cat', name: '빨간 스카프 고양이', desc: '응원의 야옹!', sheet: 'pet_cat', passive: 'block_wrong', passiveDesc: '오답 1회 막아줌', active: 'shield', activeDesc: 'FEVER 때 5초 방어막' },
  { id: 'rabbit', name: '토끼', desc: '깡충깡충 응원단', sheet: 'pet_rabbit', passive: 'bomb_time', passiveDesc: '폭탄 시간 +2초', active: 'time_plus', activeDesc: 'FEVER 때 시간 +5초' },
  { id: 'dragon', name: '아기 드래곤', desc: '작지만 든든한 불꽃', sheet: 'pet_dragon', passive: 'strong_bonus', passiveDesc: '강공격 +10%', active: 'fire_aoe', activeDesc: 'FEVER 때 화염 광역', unlock: { badge: 'fever_master', desc: 'FEVER 배지를 얻으면 합류' } },
  { id: 'squirrel', name: '숲 마법사 다람쥐', desc: '숲의 지혜를 나눠줘', sheet: 'pet_squirrel', passive: 'key_hint', passiveDesc: '다음 키 크게 표시', active: 'word_hint', activeDesc: 'FEVER 때 다음 낱말 힌트', unlock: { badge: 'letter_perfect', desc: '편지 문장 4개 PERFECT면 합류' } },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
export function getPet(id: string): PetDef {
  return PETS.find((p) => p.id === id) ?? PETS[0];
}
/** 잠금 조건 충족 여부 */
export function unlockMet(rule: UnlockRule | undefined, save: { progress: { stageStars: Record<string, number> }; collection: { badges: string[] } }): boolean {
  if (!rule) return true;
  const stars = Object.values(save.progress.stageStars).reduce((a, b) => a + b, 0);
  if (rule.stars != null && stars < rule.stars) return false;
  if (rule.badge && !save.collection.badges.includes(rule.badge)) return false;
  return true;
}
export const portraitUrl = (sheet: string) => `./assets/portraits/${sheet}.webp`;
