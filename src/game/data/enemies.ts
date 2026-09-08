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
  // 도감용 추가 몬스터(비등장, 그림이 없으면 도감에서 CSS 아이콘으로 표시) — 4×4 도감을 채우기 위한 세계관 엔트리
  { id: 'moss_spirit', name: '이끼 정령', sheet: 'mon_moss_spirit', baseHp: 90, scale: 1.0, desc: '푸른 숲 깊은 곳에 숨어 사는 조용한 정령' },
  { id: 'leaf_fairy', name: '나뭇잎 요정', sheet: 'mon_leaf_fairy', baseHp: 70, scale: 0.9, desc: '바람을 타고 다니는 작은 숲의 요정' },
  { id: 'neon_moth', name: '네온 나방', sheet: 'mon_neon_moth', baseHp: 110, scale: 1.0, desc: '네온 시티의 불빛을 따라다니는 나방' },
  { id: 'pixel_crow', name: '픽셀 까마귀', sheet: 'mon_pixel_crow', baseHp: 130, scale: 1.05, desc: '도시 전광판의 글자를 훔쳐 먹는 까마귀' },
  { id: 'sand_centipede', name: '모래 지네', sheet: 'mon_sand_centipede', baseHp: 150, scale: 1.1, desc: '사막 유적 모래 속을 헤엄치는 지네' },
  { id: 'glass_scorpion', name: '유리 전갈', sheet: 'mon_glass_scorpion', baseHp: 160, scale: 1.1, desc: '햇빛에 반짝이는 유리 껍질의 전갈' },
  { id: 'steam_magpie', name: '증기 까치', sheet: 'mon_steam_magpie', baseHp: 140, scale: 1.05, desc: '열차 굴뚝 연기를 좋아하는 까치' },
  { id: 'signal_ghost', name: '신호기 유령', sheet: 'mon_signal_ghost', baseHp: 170, scale: 1.1, desc: '끊어진 전신줄에 깃든 유령' },
  { id: 'shadow_knight', name: '그림자 기사', sheet: 'mon_shadow_knight', baseHp: 220, scale: 1.2, desc: '어둠의 성채를 지키는 이름 없는 기사' },
];

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`unknown enemy ${id}`);
  return e;
}
