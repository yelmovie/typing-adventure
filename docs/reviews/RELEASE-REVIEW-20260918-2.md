# 배포 검토 보고서 — 타이핑 어드벤처 v0.5.0 (2026-09-18 오후, 100점 작업 뒤 재점검)

> 작성일: 2026-09-18 · 브랜치: main · 기준: 오전 보고서 RELEASE-REVIEW-20260918.md(조건부, 74점)에서 감점된 항목을 전부 고친 뒤 같은 방법으로 재실측 · 배포 대상: Vercel(https://typing-adventure-six.vercel.app/)

## 최종 판정

**조건부 배포 가능** — 코드·측정으로 닿는 항목은 전부 PASS. 남은 조건은 사람이 하는 3가지뿐이다.

### 왜 이 판정인가
- FAIL 0건. 오전의 유일한 FAIL(C3 소리 토글 폭)은 48px 로 고쳐 popup-fit sound 4/4 통과.
- NOT TESTED 3건 — F10 생성 미디어 이용권 증빙(사용자 문서), G11 배포 스모크(Vercel 로그인 필요), C19 safe-area 실기. F10 이 F 영역이라 규칙상 최대 조건부.
- A12 `meta.review.needsReview: true` — 교사(사용자)가 낱말·문장을 한 번 읽고 false 로 바꾸는 것이 정상 절차.

### 배포 전 처리할 조건
1. `npx vercel login`(브라우저 로그인) → `npx vercel --prod` → `HOSTED_URL=https://typing-adventure-six.vercel.app node scripts/check-hosted-release.mjs` + `RELEASE_URL=… node scripts/check-release-journey.mjs`.
2. `docs/delivery/MEDIA-LICENSE.md` 의 증빙 파일 열 채우기(생성 당시 요금제·약관 스냅샷).
3. `src/game/data/content.json` `meta.review` — 검토 뒤 `needsReview: false`, reviewer·reviewedAt 기입.

### 배포 후 확인할 것
1. 카카오톡에 링크를 보내 새 공유 이미지(social-preview-v2.jpg)가 뜨는지.
2. 실기(iPad/폴드)에서 상단 버튼·입력창의 safe-area, 인증서 공유.

---

## 오전 대비 바뀐 판정 (근거)

| 항목 | 오전 | 지금 | 근거 |
|---|---|---|---|
| A2 성취기준 | WARNING | PASS(확인됨) | `content.json meta.standards` 4개: [2국03-01]·[2국04-03]·[4국03-05] 교육부 고시 별책 PDF 원문 대조, [6실04-02] 2차 출처(namu.wiki 전문) — 교사 확인 권장 |
| A11 데이터 구조화 | WARNING | PASS(확인됨) | `meta.learningObjectives`(지역별) + `check-content` 검사 |
| A12 검수 메타데이터 | WARNING | PASS(확인됨) | `meta.review` 필드(needsReview true) |
| A16 조작 다양성 | WARNING | PASS(확인됨) | S3 「다음 조각 고르기」(3지선다 읽기, `LetterSystem.choose`, 1·2·3키/터치), S5 P1 ←→ 결정 고르기(`BossSystem.move`, `check-boss`). 순수 입력만인 지역 2/5 |
| B14 새로고침 복원 | WARNING | PASS(확인됨) | `Checkpoint.ts` + 6모드 `serialize/restore`, 정답마다·일시정지 시 저장, 홈 「이어서 하기 · STAGE n (진행 x/y)」/「처음부터」, 2시간 뒤 폐기. `check-checkpoint` 6모드, `check-save-flow` 12/12(문장 3에서 같은 줄·점수·HP 복원 확인) |
| C3 터치 영역 | FAIL | PASS(확인됨) | `.sound-popover .sp-row .btn min-width: max(86px, var(--touch-size))`, popup-fit 112/112 |
| C9 대비 | NOT TESTED | PASS(확인됨) | 8화면 실측(`probe-contrast`): 리본 제목(보라·하늘·초록)을 진한 잉크로, ✕ 4.9:1, 보라 버튼 5.0:1, 단계 번호 opacity 1 → 이미지 위 글자 제외 4.5:1 미만 0건 |
| C14 조사 | WARNING | PASS(확인됨) | `src/game/util/josa.ts`, 펫 문구 "고양이가 …", 번역 73건 |
| C15 이모지 | WARNING | PASS(확인됨) | BattleCopy ✨ 4곳·WaveScene 아이템 라벨 제거 |
| C25 줌 | NOT TESTED | PASS(확인됨) | 1024×640@1.25·1536×864@1.25 홈/설정/셋업/결과 8/8 잘림 0 |
| D3 영상 | WARNING | PASS(확인됨) | finale-v1.mp4 6.09→4.39MB(720p H.264, SSIM 0.963), `check-finale` 720p 기대값 |
| D8 누수 | WARNING(추정) | PASS(확인됨) | S4 전투→결과→다시 도전 5사이클 힙 10.5→11.3MB(Δ 0.4/0.1/0.2/0.1), 텍스처 21 고정 |
| D9 FPS | NOT TESTED | PASS(확인됨) | CPU 4배 스로틀: S1 웨이브4~5 평균 160fps·1% 저점 33.5, S5 러시 평균 355·1% 저점 48.4 |
| D10 저사양 | WARNING(추정) | PASS(확인됨) | D9 실측으로 해소 |
| D11 오프라인 | WARNING | PASS(확인됨) | SW 프리캐시에 폰트 211·아이콘·초상 추가, `BackgroundPrecache.ts`(홈 뒤 3초·유휴·온라인·saveData 아님일 때 `ClassroomReady.prepare`) — production 미리보기: 421/421 52MB 11초, 오프라인 홈 완전·미방문 S2 소개→전투 진입 |
| D13 정적 | WARNING | PASS(확인됨) | `.panel-glass::before backdrop-filter` 제거, 나머지 무한 트윈은 reduced-motion 가드 |
| E2 큰 파일 | WARNING | PASS(확인됨) | screens.css → screens-home-setup(182)·map-intro(179)·battle(381)·result-collection(580) |
| E12 낡은 검사 | WARNING | PASS(확인됨) | 10개 복구: popup-fit(홈 전환 inert 대기)·detail-dialogs·audio-flow·intro-popup-fit·opening·stride-scenes(레이스만, 숲은 09-13 부터 아레나)·replay-layout·boss-release·delivery-final·delivery(장문 6문장·편지 9문장). 이번 실행: layout 1·2·3, result-fit 36/36, popup-fit 112/112, battle 9/9, opening, stride 4/4, save-flow 12/12, entity-motion 96, attack-locales 8/8 |
| F15 해금 재계산 | WARNING | PASS(확인됨) | `unlockedStage = max(clearedStages, stageStars>0) + 1`, 저장값 무시. `check-progress` 변조 케이스 |
| G13 커밋 | WARNING | PASS | 이 보고서와 함께 커밋 |
| S1 12시 낱말 가림(사용자 신고) | — | PASS(확인됨) | 콤보를 상단 HUD 안의 배지로 이동, `check-layout 1` 에 "콤보 사각형이 몬스터 낱말과 교차하지 않음" 단언 추가, 7해상도 |
| 글자마다 움직임(사용자 신고) | — | PASS(확인됨) | 레이스 SYLLABLE_HIT 보폭 반응·열차 어절 jab·편지 룬 jab 제거, 완성 시 대시/공격만. 프로브: 글자 입력 중 대시·공격 프레임 0 |
| S2 달리기 느낌(사용자 신고) | — | PASS(확인됨) | 보폭 1.7×(기본)~2.3×, 기울기 4~9°, 먼지·속도선, 도로 204~276px/s, 완성 시 대시 200ms(TURBO 420ms). stride 4/4 |

## 그 밖의 변경(판정 무관)
- 편지 9문장·전보 5문장을 이어지는 이야기로 재작성, 모험 플러스 이야기 풀 각 3편→5편(한/영).
- 공유 이미지 v2(1200×600, 보유 에셋 합성) + `index.html` OG/Twitter 절대주소, `check-hosted-release` 기대값.
- 교사 가이드 성취기준 페이지 2줄씩 분할(popup-fit 915×412).

## 실행 환경 (실측)
- `npm run typecheck` PASS · `npm run check`(11종 + 결정 고르기) PASS · `npm run check:gameplay` PASS · `node scripts/check-content.mjs` PASS · `node scripts/check-delivery-translations.mjs` 73 PASS
- 브라우저: 위 E12 행 · production preview(4173): delivery-final·delivery·opening-cold·boss-release·unused-assets → `tmp/final-check-20260918/prod-final.log`
- `npm run build` PASS(dist 424파일)

## 확인하지 못한 것
| 항목 | 왜 | 누가 언제 |
|---|---|---|
| G10·G11 | Vercel 자격 증명 없음(`npx vercel whoami` → loggedIn false) | 사용자 로그인 뒤 즉시 |
| F10 | 증빙 문서 없음 | 사용자 |
| C19·G19 실기 | 헤드리스 한계 | 교실 기기 |
