# 음원 생성 프롬프트 (Suno)

공통 규칙
- 전부 **Instrumental**(가사 없음). 수노에서 "Instrumental" 켜고 아래 Style 칸에 프롬프트 붙여넣기.
- 길이 1:30~2:00. **앞뒤가 자연스럽게 이어지도록**(끝을 페이드아웃하지 말고 첫 마디로 되돌아가는 느낌). 게임에서 loop 재생한다.
- 초등학생 대상: 밝고 귀엽고, 무섭거나 시끄럽지 않게. 드럼은 있되 폭발적이지 않게.
- FEVER 때 코드가 재생 속도를 1.15배로 올리니 원곡 템포는 아래 표대로.
- 파일은 **MP3**, 이름 그대로 `public/assets/bgm/` 에 넣으면 끝 (2026-09-08 8곡 전부 들어옴) (코드 수정 없음). 없는 파일은 조용히 무시됨.

## 우선순위 (이 순서로 만들면 됨)

| 순서 | 파일명 | 쓰이는 곳 | BPM |
|---|---|---|---|
| 1 | `bgm_forest.mp3` | 스테이지 1 푸른 숲 전투 (기본 전투곡) | 120 |
| 2 | `bgm_home.mp3` | 타이틀·홈 | 95 |
| 3 | `bgm_map.mp3` | 모험 지도·준비 화면 | 105 |
| 4 | `bgm_city.mp3` | 스테이지 2 네온 시티 레이스 | 140 |
| 5 | `bgm_boss.mp3` | 스테이지 5 어둠의 성채 | 130 |
| 6 | `bgm_desert.mp3` | 스테이지 3 사막 유적 편지 복원 | 90 |
| 7 | `bgm_train.mp3` | 스테이지 4 폭주 열차 전보 | 150 |
| 8 | `bgm_result.mp3` | 결과·엔딩 (짧게 40초, 루프 안 해도 됨) | 110 |

## 프롬프트

### 1. bgm_forest — 푸른 숲 전투
```
Cheerful chiptune-orchestral hybrid for a kids' fantasy RPG battle in a bright green forest, 120 BPM, bouncy pizzicato strings, marimba, light 8-bit lead, soft drums, playful heroic melody, adventurous but never scary, seamless loop, instrumental, no vocals
```

### 2. bgm_home — 타이틀·홈
```
Warm welcoming fantasy title theme for a children's game, 95 BPM, music box and harp intro, gentle flute melody, soft strings swelling with a hopeful major-key chorus, sparkling bells, cozy and magical like a storybook opening, seamless loop, instrumental, no vocals
```

### 3. bgm_map — 모험 지도
```
Light travelling theme for a colorful world map with floating islands, 105 BPM, acoustic guitar and ukulele strumming, whistling-like flute melody, glockenspiel, soft shaker rhythm, curious and relaxed, sense of journey and discovery, seamless loop, instrumental, no vocals
```

### 4. bgm_city — 네온 시티 추격 레이스
```
Upbeat synthwave chase theme for a kids' running game in a neon city at night, 140 BPM, driving synth bass, arpeggiated leads, bright pads, four-on-the-floor electronic drums, energetic and fun with a slightly urgent feeling of being chased, still cheerful not dark, seamless loop, instrumental, no vocals
```

### 5. bgm_boss — 어둠의 성채 최종 보스
```
Epic but kid-friendly final boss theme for a fantasy typing game, 130 BPM, dramatic orchestral brass and choir-like synth pads, pounding taiko-style drums, heroic rising melody in minor key that resolves to a triumphant major hook, tension without horror, seamless loop, instrumental, no vocals
```

### 6. bgm_desert — 사막 유적 편지 복원
```
Mysterious calm exploration theme for ancient desert ruins at sunset, 90 BPM, oud and ethnic flute melody, soft hand percussion, warm strings, gentle wind-like pads, puzzle-solving mood, thoughtful and quiet so a child can concentrate on typing sentences, seamless loop, instrumental, no vocals
```

### 7. bgm_train — 폭주 열차 긴급 전보
```
Fast rhythmic steam train adventure theme, 150 BPM, chugging percussion imitating train wheels, brass stabs, urgent string ostinato, telegraph-like ticking hi-hats, exciting race-against-time feeling, playful not frightening, seamless loop, instrumental, no vocals
```

### 8. bgm_result — 결과·엔딩
```
Short triumphant victory fanfare that settles into a warm relaxed celebration groove, 110 BPM, brass fanfare opening then glockenspiel, strings and light drums, proud and happy, suitable for a children's game clear screen, about 40 seconds, instrumental, no vocals
```

## 효과음 — 완료 (자체 합성)

`scripts/gen-sfx.mjs` 가 15종을 칩튠 스타일로 합성 → `npm run sfx` → wav → ffmpeg 로 `public/assets/audio/sfx_*.ogg`.
외부 음원 없음(라이선스 이슈 0). 소리를 바꾸고 싶으면 스크립트의 SFX 표만 손보면 된다.
콤보가 오를수록 타격음 피치가 올라간다(`AudioManager.comboRate`). 마음에 안 드는 소리만 픽사베이 CC0로 교체하면 됨(같은 파일명으로).

| 파일 | 소리 |
|---|---|
| sfx_tap | 음절 약공격 톡 |
| sfx_hit / sfx_perfect | 강공격 / PERFECT 아르페지오 |
| sfx_miss / sfx_hurt | 오답 / 피격 |
| sfx_combo / sfx_fever | 5콤보 / FEVER 진입 팡파르 |
| sfx_coin / sfx_bomb | 보물 / 폭탄 |
| sfx_defeat / sfx_clear / sfx_star | 처치 / 클리어 / 별 |
| sfx_countdown / sfx_go / sfx_click | 카운트다운 / GO / 버튼 |
