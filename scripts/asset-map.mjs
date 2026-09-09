// 원본 생성 이미지(assets/) → 게임 에셋 ID 매핑.
// 원본 파일은 절대 수정하지 않고, 이 매핑을 기준으로 public/assets/ 에 가공본을 만든다.

const CH = 'ChatGPT Image 2026년 9월 8일 오후 ';

export const BACKGROUNDS = [
  { id: 'bg_main_gate', file: `${CH}12_57_37 (1).png`, usage: 'home' },
  { id: 'bg_adventure_room', file: `${CH}12_57_37 (2).png`, usage: 'setup' },
  { id: 'bg_world_map', file: 'adventure-map-v2.png', usage: 'world_map' }, // v2: 스테이지 핀 5개 위치(좌하→우상 지그재그)에 맞춰 재생성
  { id: 'bg_practice_forest', file: `${CH}12_57_37 (4).png`, usage: 'stage_intro (stage_1)' },
  { id: 'bg_forest_battle', file: `${CH}12_57_37 (5).png`, usage: 'battle (stage_1)' }, // v2 에서 bg_neon_city 로 교체 // v2 에서 bg_desert_gate 로 교체 // v2 에서 bg_train 으로 교체
  { id: 'bg_library', file: `${CH}12_57_37 (9).png`, usage: 'collection / certificate' },
  { id: 'bg_final_boss', file: `${CH}12_57_37 (10).png`, usage: 'stage_5' },
  // v2 (2026-09-08 밤 추가)
  { id: 'bg_neon_city', file: 'stage2-neon-city-v2.png', usage: 'stage_2 race' },
  { id: 'bg_desert_gate', file: 'stage3-desert-golden-gate-v2.png', usage: 'stage_3 letter' },
  { id: 'bg_train', file: 'stage4-runaway-train-v2.png', usage: 'stage_4 telegram' },
  { id: 'bg_bright_castle', file: 'ending-purified-citadel-v2.png', usage: 'stage_5 ending' },
  { id: 'bg_story_prologue', file: 'prologue-story-v2.png', usage: 'story modal prologue' },
  { id: 'bg_story_ending', file: 'ending-story-v2.png', usage: 'story modal ending' },
];

// 5x6 스프라이트 시트 공통 프레임 규칙
//  row0: idle_front, idle_back, idle_left, idle_right, cheer
//  row1: walk_front_0..3, run_front
//  row2: walk_back_0..3, run_back
//  row3: walk_left_0..3, run_left
//  row4: walk_right_0..3, run_right
//  row5: attack_0, attack_1, hit, dash, victory   (몬스터: attack_0, attack_1, hit, dizzy, defeated)
export const SHEETS = [
  { id: 'char_brown_boy', kind: 'character', file: `${CH}12_58_11 (1).png` },
  { id: 'char_pink_girl', kind: 'character', file: `${CH}12_58_11 (2).png` },
  { id: 'char_glasses_boy', kind: 'character', file: `${CH}12_58_11 (3).png` },
  { id: 'char_blond_explorer', kind: 'character', file: `${CH}12_58_11 (4).png` },
  { id: 'pet_cat', kind: 'pet', file: `${CH}12_58_11 (5).png` },
  { id: 'pet_rabbit', kind: 'pet', file: `${CH}12_58_11 (6).png` },
  { id: 'pet_dragon', kind: 'pet', file: `${CH}12_58_11 (7).png` },
  { id: 'pet_squirrel', kind: 'pet', file: `${CH}12_58_11 (8).png` },
  { id: 'mon_green_slime', kind: 'monster', file: `${CH}12_58_11 (9).png` },
  { id: 'mon_letter_bat', kind: 'monster', file: `${CH}12_57_56 (1).png` },
  { id: 'mon_ink_slime', kind: 'monster', file: `${CH}12_57_56 (2).png` },
  { id: 'mon_sentence_ghost', kind: 'monster', file: `${CH}12_57_56 (3).png` },
  { id: 'mon_keycap_knight', kind: 'monster', file: `${CH}12_57_56 (4).png` },
  { id: 'mon_keyboard_golem', kind: 'monster', file: `${CH}12_58_11 (10).png` },
  { id: 'mon_shadow_chaser', kind: 'monster', file: 'stage2-shadow-chaser-v2.png' },
  { id: 'mon_boss_slime', kind: 'monster', file: 'boss-slime-sheet-v2.png' }, // S1 마지막 웨이브 대장(왕관 쓴 큰 슬라임)
];

// 균등 격자 시트 (cols×rows) → 프레임 이름 c{col}_r{row}
export const GRIDS = [
  { id: 'fx_crystals', file: 'stage5-word-crystals-v2.png', cols: 5, rows: 4 },
  { id: 'fx_gate', file: 'stage1-ancient-gate-v2.png', cols: 1, rows: 3 }, // r0 닫힘, r1 반쯤, r2 활짝
  { id: 'fx_train_props', file: 'stage4-train-ui-props-v2.png', cols: 2, rows: 3 },
  // 직업 이펙트 5×4: r0 약공격, r1 강공격, r2 PERFECT, r3 FEVER (각 5프레임)
  { id: 'fx_warrior', file: 'effect-sky-warrior-v2.png', cols: 5, rows: 4 },
  { id: 'fx_mage', file: 'effect-bora-mage-v2.png', cols: 5, rows: 4 },
  { id: 'fx_scholar', file: 'effect-jiho-scholar-v2.png', cols: 5, rows: 4 },
  { id: 'fx_archer', file: 'effect-luka-archer-v2.png', cols: 5, rows: 4 },
  { id: 'ui_badges', file: 'badge-icons-v2.png', cols: 5, rows: 3 },
  { id: 'ui_item_skills', file: 'item-skill-icons-v2.png', cols: 4, rows: 3 },
  { id: 'ui_map_markers', file: 'map-markers-v2.png', cols: 5, rows: 1 },
  // 3차 (2026-09-09)
  // 캐릭터 점프·앉기 4×4: 행 = brown_boy / pink_girl / glasses_boy / blond_explorer, 열 = 준비·공중·앉기·착지
  { id: 'char_poses', file: 'character-action-poses-v2.png', cols: 4, rows: 4 },
  // 게임 화면용 아이템 6종(items.ts 순서: coin·gem·star·heart·shield·bolt)
  { id: 'fx_items', file: 'item-game-icons-v2.png', cols: 6, rows: 1 },
  // 이펙트 5프레임 × 3종: r0 회피 / r1 획득 / r2 회복
  { id: 'fx_pickup', file: 'fx-dodge-pickup-heal-v2.png', cols: 5, rows: 3 },
];

export const ROW_NAMES = [
  ['idle_front', 'idle_back', 'idle_left', 'idle_right', 'cheer'],
  ['walk_front_0', 'walk_front_1', 'walk_front_2', 'walk_front_3', 'run_front'],
  ['walk_back_0', 'walk_back_1', 'walk_back_2', 'walk_back_3', 'run_back'],
  ['walk_left_0', 'walk_left_1', 'walk_left_2', 'walk_left_3', 'run_left'],
  ['walk_right_0', 'walk_right_1', 'walk_right_2', 'walk_right_3', 'run_right'],
  ['attack_0', 'attack_1', 'hit', 'dash', 'victory'],
];

// UI 이미지 (assets/ui) → public/assets/ui
export const UI_LOGO = { id: 'logo', file: 'logo-typing-adventure.png' };
// 8열 × 3행 아이콘 시트(1536×768, 셀 192px). 왼쪽 위부터 순서대로.
export const UI_ICON_SHEET = {
  file: 'ui-icon-sheet.png',
  cols: 8,
  rows: 3,
  names: [
    'home', 'settings', 'sound_on', 'sound_off', 'book', 'trophy', 'star_on', 'star_off',
    'lock', 'unlock', 'heart', 'bolt', 'clock', 'target', 'pin', 'flag',
    'coin', 'key_back', 'key_enter', 'key_up',
  ],
};

// DOM(HTML)에서 쓰는 아이콘 시트 → 셀마다 개별 webp (public/assets/ui/{prefix}_{name}.webp, 96px)
// autoRows: 행 간격이 불규칙한 시트는 알파 띠(높이 minRow 이상)로 행을 찾는다
export const DOM_SHEETS = [
  { file: 'badge-icons-v2.png', prefix: 'badge', cols: 5, rows: 3, autoRows: true, minRow: 150,
    names: ['first_clear', 'accuracy_100', 'combo_10', 'fever_master', 'speed_150', 'three_stars', 'perfect_5', 'forest_hero', 'lake_hero', 'ghost_beat', 'desert_hero', 'letter_perfect', 'train_hero', 'train_calm', 'ending'] },
  { file: 'item-skill-icons-v2.png', prefix: 'item', cols: 4, rows: 3, autoRows: true, minRow: 150,
    names: ['lantern', 'flag', 'star', 'crown', 'treasure', 'heart', 'bomb', '', 'shield', 'time_plus', 'fire_aoe', 'word_hint'] },
  { file: 'map-markers-v2.png', prefix: 'map', cols: 5, rows: 1, autoRows: false,
    names: ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'] },
  // 도감 아이템 탭 공용 (data/items.ts 의 id 와 같은 이름)
  { file: 'item-game-icons-v2.png', prefix: 'drop', cols: 6, rows: 1, autoRows: false,
    names: ['coin', 'gem', 'star', 'heart', 'shield', 'bolt'] },
];
