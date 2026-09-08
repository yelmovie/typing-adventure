import type { EnemyDef } from '../types';

// v2: 음절 약공격(글자마다 피해 1×배율)이 추가돼 HP를 약 40% 올림 (푸른 숲 210 ≈ 낱말 14~15개)

export const ENEMIES: EnemyDef[] = [
  { id: 'green_slime', name: '초록 슬라임', sheet: 'mon_green_slime', baseHp: 85, scale: 1.0, desc: '연습의 숲에 사는 말랑한 슬라임' },
  { id: 'letter_bat', name: '글자 박쥐', sheet: 'mon_letter_bat', baseHp: 125, scale: 1.0, desc: '글자를 물고 다니는 장난꾸러기 박쥐' },
  { id: 'ink_slime', name: '잉크 슬라임', sheet: 'mon_ink_slime', baseHp: 200, scale: 1.05, desc: '호수의 잉크가 뭉친 슬라임' },
  { id: 'sentence_ghost', name: '문장 유령', sheet: 'mon_sentence_ghost', baseHp: 140, scale: 1.1, desc: '문장을 흩뜨리는 유령' },
  { id: 'keycap_knight', name: '키캡 기사', sheet: 'mon_keycap_knight', baseHp: 180, scale: 1.15, desc: '키보드 왕국의 충직한 기사' },
  { id: 'shadow_chaser', name: '검은 그림자', sheet: 'mon_shadow_chaser', baseHp: 1, scale: 1.3, desc: '네온 시티에서 주인공을 쫓는 어둠의 덩어리' },
  { id: 'keyboard_golem', name: '키보드 골렘', sheet: 'mon_keyboard_golem', baseHp: 1700, scale: 2.0, desc: '모든 글자를 삼킨 최종 보스' },
];

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`unknown enemy ${id}`);
  return e;
}
