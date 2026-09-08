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
// 좌표는 home-menu(x1360~1820,y470~804)·home-tip(bottom 중앙)·player-card(x40~490,y40~160)와 겹치지 않는
// 화면 좌하단 빈 구역(x150~650,y550~980)에 모아둔다
export const DECORS: DecorDef[] = [
  { id: 'lantern', coins: 50, name: '반딧불 등불', icon: '등', x: 180, y: 920 },
  { id: 'flag', coins: 150, name: '모험가 깃발', icon: '기', x: 320, y: 850 },
  { id: 'star', coins: 300, name: '별빛 조각', icon: '별', x: 460, y: 920 },
  { id: 'crown', coins: 500, name: '글자 왕관', icon: '왕', x: 600, y: 850 },
  { id: 'banner', coins: 650, name: '수호 깃발', icon: '수', x: 220, y: 750 },
  { id: 'shield_decor', coins: 800, name: '용맹의 방패', icon: '방', x: 400, y: 700 },
  { id: 'gem_decor', coins: 950, name: '빛나는 보석', icon: '보', x: 560, y: 750 },
  { id: 'trophy_decor', coins: 1100, name: '모험 트로피', icon: '트', x: 250, y: 600 },
  { id: 'moon_decor', coins: 1300, name: '초승달 장식', icon: '달', x: 500, y: 600 },
  { id: 'phoenix_decor', coins: 1500, name: '불사조 깃털', icon: '불', x: 380, y: 550 },
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
