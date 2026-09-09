# 이미지 생성 프롬프트 (v2 스테이지용)

완료: 타이틀 로고, UI 아이콘 시트 20종 (2026-09-08 적용). 아래는 전부 **아직 없음**.

규칙: 부엉이·올빼미 절대 금지. 배경은 가로 16:9(기존 1672×941 계열), 시트는 세로 3:4(1145×1374 계열)로 나오면 `npm run assets`가 자동 처리한다. 배경 → `assets/background`, 시트 → `assets/character`.

## 배경

### 1. 네온 시티 (스테이지 2 레이스, 가로 스크롤)
```
Pixel-art fantasy game background, same painterly pixel style as a bright cute RPG: a night-time neon city street seen from the side, wide horizontal panorama for a side-scrolling running scene, glowing blue/purple/pink neon signs written in Korean (readable shop signs like 서점, 학교, 도서관), wet reflective road at the bottom third as a clear running lane, tall buildings with warm windows, distant floating islands and a big central gate with golden light far on the right, left and right edges designed to repeat seamlessly, no characters, no UI, no text overlay, no watermark, 16:9 landscape, very wide composition.
```

### 2. 사막 유적 황금문 (스테이지 3)
```
Pixel-art fantasy game background, same painterly pixel style as a bright cute RPG: a sunset desert ruin with a huge sealed golden gate in the center covered in glowing rune circles and three large ornate locks, an old stone pedestal in the foreground where a letter could be placed, palm trees, sand dunes, distant tower with a star above it, warm orange and deep blue sky, empty flat area in the lower-left for a character to stand, no characters, no UI, no text, no watermark, 16:9 landscape.
```

### 3. 폭주 열차 (스테이지 4)
```
Pixel-art fantasy game background, same painterly pixel style as a bright cute RPG: view from the front deck of a speeding magical steam train rushing over a high mountain railway at dusk, motion-blurred rails and scenery streaking past, a broken bridge visible far ahead with warning red glow, brass control panel and a telegraph machine on the right side, dramatic clouds and sparks, empty space in the lower-left for a character, no characters, no UI, no text, no watermark, 16:9 landscape.
```

### 7. (권장) 밝아진 성채 — 엔딩
```
Same composition as the dark boss citadel, but purified: bright golden-white castle, blue sky, soft clouds, sparkles, warm light, pixel-art fantasy, 16:9, no text.
```

## 스프라이트 시트

### 4. 검은 그림자 추격자 (스테이지 2)
```
Pixel-art chibi monster sprite sheet for a kids' Korean typing RPG, same style as a cute MapleStory-like slime/bat sheet: thick dark outline, soft cel shading, rounded shapes.
Character: "Shadow Chaser" — a round smoky black shadow blob with glowing purple eyes and a wide mischievous grin, wisps trailing behind it, slightly scary but still cute for children.
Layout: exactly 5 columns × 6 rows, 30 evenly spaced cells, each pose centered in its cell, clear empty gap between cells, nothing crossing cell borders.
Row 1: idle facing front, idle facing back, idle facing left, idle facing right, alert pose with small sparkle marks.
Row 2: move facing front, 4 frames, then 1 fast dash frame.
Row 3: move facing back, 4 frames, then 1 dash frame.
Row 4: move facing left, 4 frames, then 1 dash frame.
Row 5: move facing right, 4 frames, then 1 dash frame.
Row 6: grab attack pose 1, grab attack pose 2 (reaching to the right), hurt pose (recoiling), dizzy pose (swirl eyes), vanish pose (dissolving into smoke).
Fully transparent background, no text, no labels, no grid lines, no watermark. Portrait canvas about 3:4 (1145×1374).
```

### 5. 단어 결정 (스테이지 5 페이즈 1)
```
Pixel-art game sprite sheet on a fully transparent background: glowing floating magic crystals for a boss fight, 5 columns × 4 rows, evenly spaced cells with clear gaps.
Row 1: five crystals of different colors (gold, blue, purple, green, pink), intact, gently glowing.
Row 2: the same five crystals cracked.
Row 3: the same five crystals shattering with shards flying.
Row 4: five small burst/sparkle effects matching each color.
Cute chunky pixel style with dark outlines, no text, no labels, no grid lines, no watermark, 3:4 portrait canvas.
```

### 6. (권장) 직업 이펙트 시트 — 4장, [EFFECT THEME]만 교체
```
Pixel-art attack effect sprite sheet on a fully transparent background for a kids' fantasy typing RPG, 5 columns × 4 rows, evenly spaced cells with clear gaps, cute chunky pixel style with soft glow, effects all pointing to the right.
Row 1: small hit effect, 5 frames.
Row 2: strong finishing attack, 5 frames.
Row 3: PERFECT special attack, 5 frames.
Row 4: FEVER screen-wide burst, 5 frames.
Theme: [EFFECT THEME]
No characters, no text, no labels, no grid lines, no watermark, 3:4 portrait canvas.
```
- 하늘(전사): `blue sword slash arcs, big cleaving strike, giant golden greatsword slash, wave of sword light`
- 보라(마법사): `pink magic runes, magic bolt, glowing magic circle, area-wide magic explosion`
- 지호(학자): `flying book pages with Korean letters, sealing stamp, glowing scroll circle, storm of letters`
- 루카(궁수): `single arrow with light trail, rapid triple arrows, piercing golden arrow, rain of arrows from the sky`

## 팁
빈 셀이 생기거나 두 포즈가 붙으면 "regenerate keeping exactly 30 separate cells, equal gaps"로 재요청.

---

# 3차 주문서 (2026-09-09, 아직 없음 — 이 5장이 남은 전부)

주문서 캔버스: https://claude.ai/code/artifact/77a529d9-2b61-434e-957e-ee1f6526f5de
1차(1~9번)·2차(10~13번)는 전부 적용 완료. 아래 14~18번만 남았다.

## 14. 모험 지도 배경 v2 (배경 16:9 → `assets/background`)

지금 지도 그림이 스테이지 핀 5개 위치와 안 맞음. 핀은 왼쪽 아래 → 오른쪽 위 지그재그, 위 가운데는 제목 자리라 하늘로 비워야 함.

```
Pixel-art fantasy world map background for a kids' RPG, same painterly pixel style as a bright cute RPG, 16:9 landscape, top-down slightly tilted view of floating islands connected by a single winding golden dirt path.
Layout must follow this exact arrangement: (1) bottom-left: a lush green forest island with an ancient vine-covered stone gate; (2) left-center, a little higher: a small night-time neon city island with glowing blue and pink signs; (3) center: a sunset desert island with ruins and a big sealed golden gate; (4) upper-right: a mountain island with a railway bridge and a small steam train; (5) far top-right: a dark purple castle island under a swirling dark sky. The path goes from (1) to (2) to (3) to (4) to (5) with small flat clearings at each landmark where a character can stand. Keep the top-center sky mostly empty and calm (a title will be placed there). Soft clouds and waterfalls between islands, muted saturation so characters standing on the path stay readable, no characters, no UI, no text, no watermark.
```

## 15. 대장 슬라임 시트 (5×6, 3:4 세로 → `assets/character`)

S1 마지막 웨이브 보스(4음절·HP 2배·느림). 지금은 `mon_green_slime` 을 1.8배로 키워 쓰는 중(`WAVE.bossScaleMul`). 기존 슬라임 시트를 첨부해서 요청할 것.

```
Pixel-art chibi monster sprite sheet for a kids' Korean typing RPG, same style as the attached cute green slime sheet: thick dark outline, soft cel shading, rounded shapes.
Character: "Boss Slime" — a huge king green slime, much bigger and rounder than a normal slime, wearing a small golden crown, thick glossy jelly body, two big determined eyes and a tiny grumpy mouth, faint golden sparkles floating inside its body.
Layout: exactly 5 columns × 6 rows, 30 evenly spaced cells, each pose centered in its cell, clear empty gap between cells, nothing crossing cell borders.
Row 1: idle facing front, idle facing back, idle facing left, idle facing right, roaring pose with the crown glowing.
Row 2: hopping move facing front, 4 frames, then 1 fast charge frame.
Row 3: hopping move facing back, 4 frames, then 1 charge frame.
Row 4: hopping move facing left, 4 frames, then 1 charge frame.
Row 5: hopping move facing right, 4 frames, then 1 charge frame.
Row 6: body-slam attack pose 1 (rearing up), body-slam attack pose 2 (slamming down to the right), hurt pose (squashed with cracks), dizzy pose (swirl eyes, crown tilted), defeated pose (melting into a puddle, crown falling off).
Fully transparent background, no text, no labels, no grid lines, no watermark. Portrait canvas about 3:4 (1145×1374).
```

등록: `asset-map.mjs SHEETS` 에 `{ id: 'mon_boss_slime', kind: 'monster', file: '...' }`.

## 16. 캐릭터 점프·앉기 포즈 (4×4 한 장, 1:1 정사각 → `assets/character`)

방향키 ↑ 점프 / ↓ 앉기 회피 동작. 지금은 `Player.jump/crouch` 가 트윈으로만 흉내냄. 행=캐릭터, 열=포즈. 기존 캐릭터 시트 4장 첨부.

```
Pixel-art chibi character pose sheet on a fully transparent background for a kids' Korean typing RPG, exactly the same four characters and the same art style as the attached character sheets: thick dark outline, soft cel shading, cute rounded chibi proportions, every pose facing right.
Layout: exactly 4 columns × 4 rows, 16 evenly spaced cells, each pose centered in its cell, clear empty gap between cells, nothing crossing cell borders.
Each ROW is one character and that character must look identical across its whole row:
Row 1: a brown-haired boy in a green adventurer tunic with a small backpack.
Row 2: a pink-haired girl in a pink hooded cloak holding a wand.
Row 3: a black-haired boy with round glasses and a blue scholar robe holding a book.
Row 4: a blond explorer in a wide-brimmed hat with a quiver and a short bow.
Each COLUMN is a pose:
Column 1: crouched low with knees bent, arms back, about to jump.
Column 2: mid-air jump, both legs tucked up, arms out, small dust puff below the feet.
Column 3: ducking down low to pass under something, head lowered, one hand on the ground.
Column 4: landing, knees bent, small dust puff at the feet.
No text, no labels, no grid lines, no watermark, square canvas about 1200×1200.
```

등록: `GRIDS` 에 `{ id: 'char_poses', file: '...', cols: 4, rows: 4 }` (r0 brown_boy / r1 pink_girl / r2 glasses_boy / r3 blond_explorer, c0 준비 / c1 공중 / c2 앉기 / c3 착지).

## 17. 아이템 6종 아이콘 (6×1, 6:1 가로 → `assets/character`)

`WaveScene.onDrop` 이 지금 이모지(🪙💎⭐❤🛡⚡) 텍스트로 그림. 순서는 `data/items.ts` 와 동일.

```
Pixel-art item icon sheet on a fully transparent background for a kids' fantasy RPG, 6 columns × 1 row, 6 icons evenly spaced with clear gaps, each icon centered in its own cell and all drawn at the same size so they read clearly when shrunk down, cute chunky pixel style with thick dark outline and soft glow.
Left to right: a gold coin with a small star stamped on it, a cyan cut gem, a pink five-pointed star, a red heart, a blue round shield with a golden rim, a yellow lightning bolt.
No characters, no text, no labels, no grid lines, no watermark, wide 6:1 canvas.
```

등록: `GRIDS` 에 `{ id: 'fx_items', cols: 6, rows: 1 }` + `DOM_SHEETS` 에 `prefix: 'drop'`(도감 탭 공용).

## 18. 회피 · 획득 · 회복 이펙트 (5×3, 3:4 세로 → `assets/character`)

`WaveScene.onDodge` 의 '회피!' 글자, `onDrop` 의 파티클, `onHeal` 의 +N 텍스트를 대체.

```
Pixel-art effect sprite sheet on a fully transparent background for a kids' fantasy typing RPG, 5 columns × 3 rows, evenly spaced cells with clear gaps, cute chunky pixel style with soft glow. Each row is one 5-frame animation read left to right, starting small, peaking in the middle, fading out at the end.
Row 1 (dodge): a swoosh of blue-white curved speed lines sweeping to the right.
Row 2 (pickup): a ring of golden sparkles bursting outward.
Row 3 (heal): soft green plus signs and small leaves floating upward.
No characters, no text, no labels, no grid lines, no watermark, 3:4 portrait canvas.
```

등록: `GRIDS` 에 `{ id: 'fx_pickup', cols: 5, rows: 3 }` (r0 회피 / r1 획득 / r2 회복).
