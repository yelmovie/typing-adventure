# 타이핑 어드벤처 (Typing Adventure)

초등학생용 한글 타자 판타지 모험 웹게임. 사라진 글자를 되찾기 위해 5개 스테이지를 타이핑으로 돌파한다.
정적 웹앱이며 기록은 브라우저 localStorage 에만 저장된다(서버·로그인·개인정보 수집 없음).

| 스테이지 | 플레이 | 타이핑 |
|---|---|---|
| 1 푸른 숲 | 몬스터 20마리 웨이브 전투 | 짧은 낱말 |
| 2 네온 시티 | 추격 레이스 (속도 = 타자 속도), 어제의 나 고스트 | 낱말 연속 |
| 3 사막 유적 | 편지 6문장 복원 → 황금문 자물쇠 3개 | 문장 |
| 4 폭주 열차 | 280m 안에 긴급 전보 3문장 | 문장 + 시간 압박 |
| 5 어둠의 성채 | 결정 파괴 → 속도 러시 → 마지막 문장 (3페이즈) | 종합 |

공통: 음절마다 약공격, 낱말 완성 강공격, 콤보 10 POWER / 20 FEVER, 변화구 낱말(보물·하트·폭탄),
펫 스킬 4종, 몰래 적응형 난이도, 직업별 공격 연출, 오늘의 도전(날짜 시드 20낱말), 배지 15종, 칭호·홈 장식.

## 실행

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # tsc + vite build → dist/
npm run check      # 순수 로직 셀프체크 6종 (esbuild 번들 → node)
npm run assets     # assets/ 원본 → public/assets/ 변환 (전체)
node scripts/build-assets.mjs v2   # 새로 추가한 배경·시트만
npm run sfx        # 효과음 자체 합성 (wav → ffmpeg 로 ogg)
```

개발용 바로가기(저장 데이터 있을 때): `?go=battle&stage=stage_1`, `?go=worldmap`, `?go=intro&stage=stage_3`, `?st=1`(숨김 탭 대응), 콘솔 `window.__battle`.

## 구조

- `src/game/systems/TypingRun.ts` — 모든 모드가 공유하는 타이핑 코어(음절 판정·콤보·FEVER·변화구·펫·적응형)
- `src/game/systems/{Wave,Race,Letter,Telegram,Boss,Daily}System.ts` — 스테이지별 규칙(순수 로직, `TypingMode` 인터페이스)
- `src/game/scenes/*Scene.ts` — Phaser 연출. DOM HUD/입력은 `src/game/ui/screens/BattleScreen.ts` 공통
- `src/game/data/content.json` — 출제 낱말·문장 (태그: 편지/전보/결정/러시/최종/보물/하트/폭탄)
- `docs/PLAN.md` — 작업 계획·인수인계 (이어서 작업할 때 6장부터)

## 한글 입력

실제 `<input>` 과 브라우저 IME 를 쓴다. compositionend 이후 NFC 정규화 문자열로만 판정하며 조합 중엔 오답 처리하지 않는다.
타수 = 정답 확정 글자의 키 입력 수(예: 학교 = 5타) ÷ 경과 분.

## 에셋·라이선스

`assets/CREDITS.md` 참고. 이미지는 제작자가 ChatGPT 이미지 생성으로, BGM 은 Suno 로 제작. 효과음은 `scripts/gen-sfx.mjs` 자체 합성.
부엉이·올빼미 이미지는 사용하지 않는다.

ⓒ 2026. 자체 제작 자료의 무단 복제·재배포·상업적 이용을 금지합니다.
