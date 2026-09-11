import type { CharacterDef, GameLanguage, PetDef, SaveProfile, UnlockRule } from '../types';

export const CHARACTERS: CharacterDef[] = [
  { id: 'brown_boy', name: '하늘', desc: '빨간 목도리의 씩씩한 모험가', sheet: 'char_brown_boy' },
  { id: 'pink_girl', name: '보라', desc: '분홍 후드의 명랑한 탐험가', sheet: 'char_pink_girl' },
  { id: 'glasses_boy', name: '지호', desc: '안경 쓴 똑똑한 책벌레', sheet: 'char_glasses_boy' },
  { id: 'blond_explorer', name: '루카', desc: '고글을 쓴 용감한 탐험대장', sheet: 'char_blond_explorer', unlock: { stars: 6, desc: '별 6개 모으면 합류' } },
];

export const PETS: PetDef[] = [
  { id: 'cat', name: '빨간 스카프 고양이', desc: '응원의 야옹!', sheet: 'pet_cat', passive: 'block_wrong', passiveDesc: '첫 오답의 콤보·HP 보호', active: 'shield', activeDesc: '연속 성공 시 5초 방어막' },
  { id: 'rabbit', name: '토끼', desc: '깡충깡충 응원단', sheet: 'pet_rabbit', passive: 'bomb_time', passiveDesc: '폭탄 시간 +2초', active: 'time_plus', activeDesc: '시간 여유 · 읽기 모드는 보호·힌트' },
  { id: 'dragon', name: '아기 드래곤', desc: '작지만 든든한 불꽃', sheet: 'pet_dragon', passive: 'strong_bonus', passiveDesc: '강공격 +10%', active: 'fire_aoe', activeDesc: '화염 도움 · 문장 모드는 다음 힌트', unlock: { badge: 'fever_master', desc: '20콤보 배지를 얻으면 합류' } },
  { id: 'squirrel', name: '숲 마법사 다람쥐', desc: '숲의 지혜를 나눠줘', sheet: 'pet_squirrel', passive: 'key_hint', passiveDesc: '다음 키 크게 표시', active: 'word_hint', activeDesc: '연속 성공 시 다음 입력 힌트', unlock: { badge: 'letter_perfect', desc: '편지 문장 4개 PERFECT면 합류' } },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
const CHARACTER_NAMES_EN: Record<string, string> = {
  brown_boy: 'Haneul', pink_girl: 'Bora', glasses_boy: 'Jiho', blond_explorer: 'Luca',
};
const automaticNames = new Set([...CHARACTERS.map(c => c.name), ...Object.values(CHARACTER_NAMES_EN), 'Luka'].map(name => name.toLocaleLowerCase('en')));

/** Legacy saves used a character's name as the player's default name. */
export function isCharacterDefaultName(name: string): boolean {
  return !name.trim() || automaticNames.has(name.trim().normalize('NFC').toLocaleLowerCase('en'));
}
export function characterName(id: string, language: GameLanguage = 'ko'): string {
  const character = getCharacter(id);
  return language === 'en' ? CHARACTER_NAMES_EN[character.id] ?? character.name : character.name;
}
/** Keep personal nicknames; default names always follow the selected character. */
export function nameForCharacter(name: string, characterId: string): string {
  return isCharacterDefaultName(name) ? characterName(characterId) : name;
}
export function profileDisplayName(profile: Pick<SaveProfile, 'name' | 'characterId'>, language: GameLanguage): string {
  return isCharacterDefaultName(profile.name) ? characterName(profile.characterId, language) : profile.name;
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
