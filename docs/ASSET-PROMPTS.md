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
