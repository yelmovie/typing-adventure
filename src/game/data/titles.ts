// 코인으로 자동으로 열리는 칭호와 홈 장식 (상점 없음: 코인 총합이 문턱을 넘으면 열린다)
export interface TitleDef {
  coins: number;
  name: string;
}
export const TITLES: TitleDef[] = [
  { coins: 0, name: '새싹 모험가' },
  { coins: 30, name: '낱말 수집가' },
  { coins: 80, name: '문장 탐험가' },
  { coins: 150, name: '별빛 타자' },
  { coins: 300, name: '글자의 수호자' },
  { coins: 500, name: '전설의 타이피스트' },
];

export interface DecorDef {
  id: string;
  coins: number;
  name: string;
  icon: string; // 홈 화면에 놓이는 표시
  x: number; // 홈 화면 좌표(1920 기준)
  y: number;
}
export const DECORS: DecorDef[] = [
  { id: 'lantern', coins: 50, name: '반딧불 등불', icon: '🏮', x: 1500, y: 700 },
  { id: 'flag', coins: 150, name: '모험가 깃발', icon: '🚩', x: 1640, y: 640 },
  { id: 'star', coins: 300, name: '별빛 조각', icon: '🌟', x: 1560, y: 560 },
  { id: 'crown', coins: 500, name: '글자 왕관', icon: '👑', x: 1600, y: 480 },
];

/** 코인 총합으로 현재 칭호 */
export function currentTitle(coins: number): TitleDef {
  let t = TITLES[0];
  for (const x of TITLES) if (coins >= x.coins) t = x;
  return t;
}
/** 다음 칭호 (없으면 null) */
export function nextTitle(coins: number): TitleDef | null {
  return TITLES.find((x) => x.coins > coins) ?? null;
}
export function unlockedDecors(coins: number): DecorDef[] {
  return DECORS.filter((d) => coins >= d.coins);
}

export const unlockMet2 = (coins: number, need: number) => coins >= need;
