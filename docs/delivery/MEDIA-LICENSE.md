# 생성 미디어 이용권 증빙표 (F10)

작성일 2026-09-18 · 대상: 타이핑 어드벤처 v0.5.0 에 실제로 배포되는 생성 미디어 전부.
출처 기록은 `assets/CREDITS.md`, 프롬프트는 `docs/ASSET-PROMPTS.md`·`docs/AUDIO-PROMPTS.md`·`docs/media/*.md` 에 있다.
**출처 기록은 이용권 증빙이 아니다.** 아래 "증빙 파일" 칸을 담당 교사가 채우기 전까지 F10 은 NOT TESTED 로 둔다.

## 증빙표

| # | 미디어 그룹 | 배포 파일 (원본) | 생성 도구 | 생성·적용일 | 약관·라이선스 (링크) | 증빙 파일 (교사 기입) |
|---|---|---|---|---|---|---|
| 1 | 배경 이미지 27장 | `public/assets/backgrounds/*.webp` (`assets/background/*.png`) | ChatGPT 이미지 생성 (OpenAI) — 사용자 직접 생성 | 1차 2026-09-08, v2 2026-09-09 | OpenAI 이용약관 https://openai.com/policies/terms-of-use · 사용 정책 https://openai.com/policies/usage-policies | |
| 2 | 캐릭터·펫·몬스터 시트 | `public/assets/sprites/char_*`, `pet_*`, `mon_*` (`assets/character/*.png`) | ChatGPT 이미지 생성 (OpenAI) | 2026-09-08 (대장 슬라임·그림자 v2 09-09) | 1번과 동일 | |
| 3 | 동작 시트 (공격·보행 v1/v2·포즈) | `sprites/char_attack_ko_v1`, `char_walk_v1`, `char_walk_v2`, `char_poses`, 펫 보행 | Codex 내장 image_gen (OpenAI) — `docs/media/motion-v2.md`, `docs/media/CHARACTER-WALK-V2-PROMPTS.md` | 2026-09-10 · 09-11 | 1번과 동일 | |
| 4 | 이펙트·소품 시트 | `sprites/fx_*` (직업 이펙트 4종·결정·문·열차 소품·아이템·회피/회복) | ChatGPT 이미지 생성 (OpenAI) | 2026-09-09 | 1번과 동일 | |
| 5 | UI 아이콘·배지·아이템·지도 핀·로고 | `public/assets/ui/*.webp`, `public/icons/icon-*.png`(로고에서 sharp 변환) | ChatGPT 이미지 생성 (OpenAI) | 2026-09-08 · 09-09 | 1번과 동일 | |
| 6 | 초상화 | `public/assets/portraits/*.webp` | 2번 시트에서 잘라냄 (추가 생성 없음) | 2026-09-08 | 2번 증빙으로 갈음 | (2번과 동일) |
| 7 | 오프닝 영상 | `public/assets/video/intro-v1.mp4`, `intro-poster-v1.webp` | Higgsfield (Wan 3.0) — `docs/media/intro-v1.md` | 2026-09-10 | Higgsfield 이용약관 https://higgsfield.ai/terms (생성 당시 판본 확인) | |
| 8 | 엔딩 영상 | `public/assets/video/finale-v1.mp4`, `finale-poster-v1.*` | Higgsfield (Wan 3.0) — `docs/media/finale-v1.md` | 2026-09-10 | 7번과 동일 | |
| 9 | 배경음악 8곡 | `public/assets/bgm/bgm_*.mp3` | Suno — 프롬프트 `docs/AUDIO-PROMPTS.md` | 2026-09-08 | Suno 이용약관 https://suno.com/terms (상업 이용은 유료 플랜 조건 확인) | |
| 10 | 효과음 15종 | `public/assets/audio/sfx_*.ogg` | `scripts/gen-sfx.mjs` 자체 합성 (외부 음원 없음) | 2026-09-08 | 해당 없음 — 프로젝트 자체 제작 | 불필요 |
| 11 | 소셜 미리보기·OG 시안 | `public/icons/social-preview*.jpg`, `public/assets/og/*.png` | Codex 내장 image_gen (OpenAI) + 보유 에셋 합성 — `docs/media/social-preview-*.md` | 2026-09-09 · 09-12 · 09-18 | 1번과 동일 | |
| 12 | 폰트 | `public/fonts/Jua-*.woff2`, `NotoSansKR-*.woff2` | Google Fonts (Woowahan Brothers / Google) | 2026-09-08 · 09-10 | SIL Open Font License 1.1 — `public/licenses/Jua-OFL.txt`, `NotoSansKR-OFL.txt` | 동봉 완료 (OFL 원문) |

생성 도구 칸이 "ChatGPT" 인 항목은 모두 같은 OpenAI 계정으로 만들었으므로 증빙 1벌(계정 플랜 + 약관 스냅샷)로 1·2·4·5·6·11번을 함께 덮을 수 있다. Higgsfield(7·8)와 Suno(9)는 각각 따로 필요하다.

## 무엇을 남겨야 하는가

1. **생성 당시 계정 플랜** — 결제 내역 또는 구독 화면 캡처. 생성일(위 표의 날짜)이 구독 기간 안에 들어가야 한다. 무료 플랜으로 만든 결과물은 서비스마다 상업 이용 조건이 다르므로 따로 표시한다.
2. **약관 스냅샷** — 생성 당시(또는 가장 가까운 시점)의 이용약관을 PDF 로 저장하고, "상업적 이용·소유권" 조항의 쪽수를 메모한다. 약관은 바뀌므로 링크만으로는 부족하다.
3. **생성 기록** — 프롬프트, 생성 ID 또는 히스토리 화면 캡처, 다운로드한 원본 파일. 배경·시트는 `assets/` 원본, 영상은 `docs/media/*.md` 의 해시가 그 역할을 한다.
4. **보관 위치** — 저장소에는 넣지 않고 학교 공유 드라이브에 `타이핑어드벤처/미디어증빙/<서비스>/` 로 두고, 위 표의 "증빙 파일" 칸에 파일 이름과 위치를 적는다. 개인 결제 정보(카드 번호 등)는 가린다.

## 확인 절차

- 담당 교사가 표의 빈 칸을 채우고 날짜·서명을 남긴 뒤 `docs/reviews/` 다음 점검 보고서의 F10 을 PASS 로 바꾼다.
- 증빙이 없는 그룹은 배포를 막지는 않지만, 유료 납품·외부 공개 전에는 채워야 한다(`docs/delivery/HANDOFF.md` 의 미확인 항목과 같은 뜻).
- 새 미디어를 추가하면 이 표와 `assets/CREDITS.md` 에 같이 한 줄을 늘린다.
