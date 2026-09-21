# 에셋 출처

| 파일 | 출처 | 라이선스 | 확보일 |
|---|---|---|---|
| assets/background/*.png, assets/character/*.png, assets/ui/*.png | 사용자가 ChatGPT 이미지 생성으로 직접 제작 | 프로젝트 자체 제작 (생성형 AI) | 2026-09-08 |
| public/assets/audio/sfx_*.ogg (15종) | `scripts/gen-sfx.mjs` 로 자체 합성 (외부 음원 없음). 원본 wav는 `assets/_unused/sfx-wav/` | 프로젝트 자체 제작 | 2026-09-08 |
| public/assets/bgm/bgm_*.mp3 (8곡) | 사용자가 Suno 로 직접 제작, 프롬프트 `docs/AUDIO-PROMPTS.md` | Suno 유료 플랜 상업 이용 (NOT CHECKED: 구독 등급 확인 필요) | 2026-09-08 |
| assets/character/badge-icons-v2.png, item-skill-icons-v2.png, map-markers-v2.png, effect-*-v2.png, stage*-v2.png, assets/background/*-v2.png (배지·아이템·지도 핀·이펙트·삽화 2차 이미지) | 사용자가 ChatGPT 이미지 생성으로 직접 제작 | 프로젝트 자체 제작 (생성형 AI) | 2026-09-08 |
| public/icons/icon-192.png, icon-512.png (PWA 아이콘) | `assets/ui/logo-typing-adventure.png` 에서 sharp 로 생성 | 프로젝트 자체 제작 | 2026-09-08 |
| public/fonts/Jua-400-*.woff2 (87 슬라이스) | Google Fonts — Jua (Woowahan Brothers) | SIL Open Font License 1.1 | 2026-09-08 |
| public/fonts/NotoSansKR-400-*.woff2 (124 슬라이스, 가변 폰트 400~700) | Google Fonts — Noto Sans KR (Google) | SIL Open Font License 1.1 | 2026-09-08 |
| public/assets/video/finale-v1.mp4, finale-poster-v1.webp | 사용자 요청으로 Higgsfield Wan 3.0에서 생성. 생성 기록 `docs/media/finale-v1.md`; 기존 결과를 로컬 웹용 압축 | 생성 출처 확인. 납품 범위의 서비스 이용권 증빙은 운영자 확인 필요 | 2026-09-10 |
| assets/ui/social-preview-source-v040.png, public/icons/social-preview.jpg (2026-09-18 부터 _unused/icons/social-preview-v040.jpg 로 보관) | 사용자 선택 새 시안 1번을 Codex 내장 image_gen으로 제작. 원본 1774×887, JPG 1200×600. 원문 프롬프트 `docs/media/social-preview-v040.md` | 프로젝트 자체 제작 (생성형 AI) | 2026-09-12 |

| assets/character/character-attack-ko-v1.png, character-walk-v1.png, pet-walk-v1.png 및 public/assets/sprites/ 대응 아틀라스 | 사용자 요청으로 Codex 내장 image_gen에서 기존 자체 제작 초상화를 참조해 생성. docs/media/motion-v2.md | 프로젝트 자체 제작 (생성형 AI) | 2026-09-10 |
| assets/_unused/icons/social-preview-v2.jpg | 새 생성 없이 보유 에셋 합성한 과거 공유 이미지. 합성 기록 `docs/media/social-preview-20260918.md` | 프로젝트 자체 제작 (기존 생성 이미지 재구성) | 2026-09-18 |
| assets/character/keyboard-golem-defeat-v1.png 및 public/assets/sprites/mon_keyboard_golem_defeat.* | Codex 내장 image_gen으로 기존 `mon_keyboard_golem` 아틀라스를 참조해 생성한 최종 보스 붕괴 6프레임. 생성 기록 `docs/media/boss-defeat-v1.md` | 프로젝트 자체 제작 (생성형 AI) | 2026-09-21 |
| scripts/assets/social-preview-v3-source.png, public/icons/social-preview-v4.jpg | Codex 내장 image_gen 원본에 프로젝트 로고를 합성해 1200×600으로 제작한 공유 이미지. 제목 없는 이전 캐시를 피하려고 v4 URL 사용. | 프로젝트 자체 제작 (생성형 AI + 자체 에셋 합성) | 2026-09-21 |
| scripts/assets/ai-mart-thumbnail-final.png, public/icons/ai-mart-thumbnail.jpg | 사용자 제공 프롬프트로 Codex 내장 image_gen에서 생성·보정하고 프로젝트 로고·과목 배지를 합성. 배포본은 1024×1024 JPEG. 원문 프롬프트 `docs/media/ai-mart-thumbnail-20260921.md` | 프로젝트 자체 제작 (생성형 AI + 자체 에셋 합성) | 2026-09-21 |

## 캐릭터 보행 시트 v2

네 캐릭터 보행 v2 원본 4장(`assets/character/character-walk-*-v2.png`) 및 옆모습 대기 1장(`character-idle-side-v2.png`)은 사용자 요청으로 2026-09-11 Codex 내장 image_gen에서 기존 자체 제작 초상화·시트를 참조해 생성했다. 프로젝트 자체 제작(생성형 AI). 최종 경로·프롬프트는 `docs/media/CHARACTER-WALK-V2-PROMPTS.md`, 투명화·패킹 재현은 `npm run assets:walk`. 게임 사용 파일은 `public/assets/sprites/char_walk_v2.webp` 및 `.json`이다.

## 배포에 포함한 폰트 고지

공식 Google Fonts 저장소에서 2026-09-10에 받은 원문을 그대로 포함했다.

- Jua: `public/licenses/Jua-OFL.txt` — https://github.com/google/fonts/blob/main/ofl/jua/OFL.txt
- Noto Sans KR: `public/licenses/NotoSansKR-OFL.txt` — https://github.com/google/fonts/blob/main/ofl/notosanskr/OFL.txt

이미지·영상의 생성 기록은 출처 기록이며 서비스 사용권 증빙을 대신하지 않는다. Suno 생성 당시 구독 등급·상업 이용 가능 여부, Higgsfield 생성 당시 약관과 납품 범위를 최종 인수 담당자가 확인해야 한다. 확인되지 않은 항목을 확인 완료로 표시하지 않는다.
