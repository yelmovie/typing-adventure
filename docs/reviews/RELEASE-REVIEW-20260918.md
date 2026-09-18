# 배포 검토 보고서 — 타이핑 어드벤처 v0.5.0 (스테이지 확장 · 결과 타수 히어로 · UX 3건 반영)

> 작성일: 2026-09-18 · 브랜치: main · 커밋: 8b4176d (HEAD, 커밋 안 된 변경 50파일 포함 상태를 점검) · 배포 대상: Vercel (https://typing-adventure-six.vercel.app/) · 점검 도구: `edu-final-check`

## 최종 판정

**조건부 배포 가능**

### 왜 이 판정인가

- FAIL 1건 — **C3 터치 영역**: 상단 바 소리 팝오버의 켜짐/꺼짐 토글이 1024×768 에서 46px, 915×412 에서 34~37px 폭(높이는 48px). C 영역이고 높이 48px 로 탭은 되며(조작 불가 수준 아님) 09-13 이후 배포본에도 이미 같은 상태라 조건부로 낮춘다. **A·F 영역, B 핵심 경로(B3·B9·B10·B14·B17) FAIL 없음.**
- NOT TESTED 7건 — F10 생성 미디어 상업 이용권 증빙(문서 없음), G10·G11(오늘 빌드는 아직 배포 전), G19 인쇄·폰 공유(헤드리스 한계), C9 대비 비율·C25 브라우저 줌·D9 FPS(미측정). F10 이 A/F 영역이라 규칙상 최대 조건부.
- 오늘 바꾼 6가지(스테이지 길이·낱말 완성 시 공격·결과 타수 히어로·말풍선 위치·자판 가이드 비차단·수업 준비 모달 제거)는 순수 로직 10종 + 게임플레이 3종 + 브라우저 배틀 흐름 9/9 + 레이아웃 1·2·3 + 결과 맞춤 36/36 + 헤드리스 실플레이(S1·S3·S4·S5)로 확인. 점검 중 발견한 오늘 변경의 잔재 1건(황금문 "문장 2개마다" 문구가 3문장 규칙과 불일치)은 아래 「수정 기록」대로 고치고 재타입검사했다.

### 배포 전 처리할 조건

1. **C3** 소리 팝오버 토글 최소 폭 — `src/styles/*.css` 의 `.sound-toggle-row` 버튼 `min-width`(현재 86px 선언이 320px 팝오버 안에서 46/37px 로 눌림). 1024 이하 폭에서 팝오버 폭을 넓히거나 버튼을 2줄로. 수정 후 `node scripts/check-popup-fit.mjs` 의 `*-sound-1024x768/915x412` 4케이스 재확인.
2. **G13 → G10·G11** 커밋 안 된 50파일을 커밋·배포한 뒤, 배포 URL 에서 스모크 테스트(로드 → 첫 입력 → S1 한 판 → 저장 → 새로고침 → 설정 → 915×412 → 콘솔 0).
3. **D11 정책 결정** — 오늘 "수업 준비 · 오프라인" 모달을 없앴으므로 미방문 지역을 미리 받을 수단이 없다. 첫 온라인 방문 뒤 서비스워커가 방문한 자원만 캐시한다(실측: 두 번째 방문부터 홈 완전 오프라인, 미방문 지도·지역은 오프라인 실패). 교실 Wi-Fi 가 불안정하면 (a) 수업 전 각 기기에서 한 번 5지역을 열어 두거나 (b) 홈 진입 뒤 백그라운드 자동 프리캐시를 넣는 쪽을 택한다. 결정만 하면 배포 자체는 막지 않는다.
4. **E12 회귀 스위트 정리(선택)** — 브라우저 검사 스크립트 7개가 09-12/13 개편 이후로 낡아 실패한다(아래 E12). 게임 결함은 아니지만 다음 점검자가 헤맨다. 이미 작업 칩으로 띄운 journey/learning 2개 외 5개(popup-fit 설정 초점 레이스, detail-dialogs, audio-flow, intro-popup-fit, opening, stride-scenes, replay-layout, boss-release, delivery-final 임계값)도 같이.

### 배포 후 확인할 것

1. G11 스모크 테스트(위 2번) + OG 썸네일이 새 배포 URL 에서 열리는지(카톡 미리보기).
2. 실기 태블릿에서 S5 마지막 장문 6문장의 글자 크기·줄바꿈(32자 문장이 좁은 폭에서 2줄로 접히는지)과 결과 화면 타수 히어로의 카운트업.
3. 느린 학생(8초/낱말)이 S1 30마리를 4분 30초 안에 끝내는지 실제 관찰 — 봇 실측은 251초 성공이었다.

---

## 요약

| 영역 | PASS | WARNING | FAIL | NOT TESTED | N/A |
|---|---|---|---|---|---|
| A 교육적 품질 | 12 | 4 | 0 | 0 | 1 |
| B 기능 | 18 | 1 | 0 | 0 | 0 |
| C 태블릿·UI | 20 | 2 | 1 | 2 | 0 |
| D 성능 | 7 | 5 | 0 | 1 | 1 |
| E 코드 품질 | 12 | 2 | 0 | 0 | 0 |
| F 데이터·안전 | 13 | 1 | 0 | 1 | 0 |
| G 배포 | 16 | 1 | 0 | 3 | 0 |
| **합계** | **98** | **16** | **1** | **7** | **2** |

## 실행 환경 (실측)

| 항목 | 값 |
|---|---|
| package manager | npm (lock 파일: package-lock.json 하나) |
| 실행 명령 | `npm run dev`(5180) / `npm run build` / `npm run check` / `npm run check:gameplay` / `npm run check:battle` / `node scripts/check-*.mjs` |
| 배포 URL | https://typing-adventure-six.vercel.app/ (09-14 배포본 = 커밋 616b991, 오늘 변경 미포함) |

| 명령 | 결과 | 소요 |
|---|---|---|
| install | 기존 node_modules 사용(`npm ci` 미실행 — lock 변경 없음) | — |
| lint | **정의 안 됨** → NOT APPLICABLE | — |
| typecheck (`tsc --noEmit`) | PASS | 수초 |
| test (`npm run check` 10종 + `check:gameplay` 3종 + `check:battle` 9케이스) | PASS | 약 3분 |
| build (`npm run build`) | PASS — dist 424파일 51.3MB(겉보기), PWA 프리캐시 48항목 7.9MB | 29.5초 |

브라우저 확인: 함 — Playwright(Chromium/Chrome) 헤드리스로 1280×800·1920×1080·1024×768·915×412 + 세로 375×812·768×1024, 그리고 dev 서버(5180)·production preview(4176) 양쪽. 캡처는 `tmp/final-check-20260918/manual/*.png`, `tmp/verify-20260918/*.png`.

자동 스윕:

| 스크립트 | 검출 | 오탐·제외 | 결과 |
|---|---|---|---|
| check-layout 1·2·3 (전투 4지역+설정 7해상도, 결과 7해상도, 팝업/reduced-motion) | 0 | — | 18/18 PASS |
| check-result-fit (결과 6해상도 × 6상태) | 0 | — | 36/36 PASS |
| check-popup-fit (팝업 14종 × 4해상도 × 2언어) | 12 | 설정 초점 8건 = 하네스가 홈 전환 inert 구간(0.6초) 안에서 모달을 여는 타이밍 레이스(실사용 클릭에선 ✕ 에 초점 감, production 확인) → 오탐 | 100/112, 실질 실패 4건(C3 소리 토글) |
| check-ui-readability(10) · viewport-resize(2) · portrait-panels(140) · save-flow(9) · finale(10) · attack-locales(8) · entity-motion(96) | 0 | — | 전부 PASS |
| check-delivery(production, 4176) | 1 | S3 6문장 루프가 오늘 9문장 변경과 불일치 → 스크립트를 9로 고침(수정 기록) | 홈·SW 제어·419자원 준비·누락 복구·오프라인 지역 1~3 PASS, 4~5 는 루프 중단으로 미실행 |
| measure-opening-cold(3회) · check-unused-assets · check-safe-update(4/4) | 0 | — | PASS |
| check-delivery-final · check-boss-release · check-detail-dialogs · check-audio-flow · check-intro-popup-fit · check-opening · check-stride-scenes · check-replay-layout | — | 09-12/13 개편 이후 낡은 스크립트(자원 수 임계값 426, `char_walk_v1`, 페이지형 팝업, 사라진 '켜기/끄기' 버튼, dev 청크명, 워밍업 백필 규칙) | 스크립트 문제, 게임 회귀 아님 (E12 WARNING) |

---

## A. 교육적 품질

| # | 항목 | 판정 | 근거 (파일·위치) |
|---|---|---|---|
| A1 | 학습목표–활동 일치 | PASS(확인됨) | 지역별 goal(`src/game/data/stages.ts`) ↔ 실제 입력: S1 짧은 낱말, S2 받침·이중모음 낱말, S3 띄어쓰기·부호 문장, S4 시간 압박 문장, S5 낱말+장문. 소개 화면에 `학습 목표 ·` 노출 |
| A2 | 성취기준 연결 | WARNING(추정) | `src/game/data/about.ts:10` 는 코드 없이 "실과 보조 활동·국어 쓰기 보조" 서술만. 특정 성취기준을 주장하지 않아 거짓은 아니나 원문 대조 불가 |
| A3 | 정답 맞히기로 끝나지 않음 | PASS(확인됨) | 타자 자체가 게임 조작이라 학습을 걷어내면 게임이 성립하지 않음. 보상(별·코인·보물 낱말)이 정확 입력에만 붙음(`TypingRun.submit`) |
| A4 | 판단 근거를 생각하게 함 | PASS(확인됨) | 결과 「성장 기록」의 오답 원문 비교·교정 연습(`LearningPanel.ts`, `ErrorComparison.ts`), 다른 예시 2개에 적용 |
| A5 | 오개념 피드백 | PASS(확인됨) | S3 에서 '모→무' 오타 제출: 목표 유지, 판정 팝업 "잠깐, 오타 있어요 · 고쳐서 다시!", 조합 중 틀린 음절 빨간 흔들림(`HudController.shakeChar`). 캡처 `manual/a5-wrong-feedback.png` |
| A6 | 난이도 적절 | PASS(확인됨) | 기초/표준/도전 3단계 + 몰래 적응형(`pickAdjusted`) + 도움 모드. S1 실측: 무입력 50초 사망, 8초/낱말 251초 클리어, 4초 150초, 1.5초 120초 |
| A7 | 보상이 학습을 방해하지 않음 | PASS(확인됨) | 별=정확도·시간/콤보, 코인=보물 낱말 정확 입력, 인증서=5지역 완주. 판정 팝업은 동시에 1개(check-layout 3) |
| A8 | 클릭 반복으로 통과 불가 | PASS(확인됨) | `check-learning-contracts`: 오답 20회+점프 3회로 숲의 문 안 열림, 편지·전보·결정도 동일 |
| A9 | 힌트가 정답 노출 안 함 | PASS(확인됨) | 타자 게임이라 목표 텍스트는 항상 보임(베껴 치기가 활동). 힌트는 다음 키 위치(자판 가이드·다람쥐 펫)만 |
| A10 | 오답 후 튕기지 않음 | PASS(확인됨) | A5 실측: 같은 목표에서 계속 |
| A11 | 성취기준·학습목표 데이터 구조화 + 테스트 | WARNING(확인됨) | `content.json` 단위에 `standards`/`learningObjectives` 없음(필드: id·stage·type·text·difficulty·tags·weight). 학습 태그(받침·이중모음)만 `check-content` 가 검사 |
| A12 | 검수·출처 메타데이터 | WARNING(확인됨) | `needsReview`·검토자 필드 없음. 콘텐츠는 교사(사용자)가 직접 쓴 창작 문장이라 외부 출처는 없음 |
| A13 | 단정 서술 없음 | NOT APPLICABLE | 판타지 소재, 문화·역사 일반화 없음(콘텐츠 213단위 읽음) |
| A14 | 어휘·지시문 학년 적합성 | PASS(확인됨) | 낱말 2~4음절 간식·모험 어휘, 문장 ≤32자(`check-content` 예산), 지시문 한 문장에 행동 하나("문장을 똑같이 입력하고 Enter") |
| A15 | 피드백 어조 | PASS(확인됨) | "틀려도 괜찮아. 한 글자씩 완성하면 돼.", "잠깐, 오타 있어요 · 고쳐서 다시!" — 탓하지 않음 |
| A16 | 조작 방식 다양성 | WARNING(추정) | 5지역 모두 "입력". 변주(방향키 회피·점프 자원·자물쇠·브레이크·결정/러시)는 있으나 규칙상 절반 이상 같은 조작. 타자 게임의 본질이라 감점 1에 그침 |
| A17 | 난이도 상승 구조 | PASS(확인됨) | 낱말(받침 없음)→받침·이중모음→문장→시간 압박 문장→낱말·장문 혼합. 문항 수만 늘리지 않음. 앞서 배운 오답이 뒤 교정 연습에 재사용 |

## B. 기능

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| B1 | 시작 화면 | PASS(확인됨) | 오프닝 영상→건너뛰기→홈, 4해상도 캡처 |
| B2 | 도움말 | PASS(확인됨) | 학생/교사 가이드·타자 팁·별 조건 모달, popup-fit 통과 |
| B3 | 스테이지 이동 | PASS(확인됨) | 지도 5노드, 결과의 「다음 지역」, `check-progress` 해금 |
| B4 | 정답 처리 | PASS(확인됨) | S1·S3·S4·S5 헤드리스 완주, 자동 제출·Enter |
| B5 | 오답 처리 | PASS(확인됨) | A5 + `check-battle-flow` 오답·점프 우회 차단 |
| B6 | 다시 시도 | PASS(확인됨) | 결과 「바로 다시 도전」, 3회 실패 시 도움 모드 안내 |
| B7 | 진행도 | PASS(확인됨) | HUD "몬스터 n/30", "문장 n/9", 브레이크 5칸, 봉인 6개(S5) — 실측 일치 |
| B8 | 보상 | PASS(확인됨) | `check-score-rewards`(한/영 동일 결과, 배지 멱등) |
| B9 | 자동 저장 | PASS(확인됨) | `check-save-flow` 9/9, 결과 후 localStorage 갱신 확인 |
| B10 | 이어하기 | PASS(확인됨) | 홈 「모험 이어하기」→지도(완료 기록 기준) |
| B11 | 초기화 | PASS(확인됨) | 언어별/전체 초기화에 취소·확인(save-flow) |
| B12 | 완료 처리 | PASS(확인됨) | `check-finale` 10/10(영상→인증서) |
| B13 | 뒤로가기 | PASS(추정) | 라우트 없는 단일 페이지(query 만) — 뒤로가기는 페이지 이탈, 저장은 결과 시점에 완료 |
| B14 | 새로고침 후 복원 | WARNING(확인됨) | S3 2문장 완성 뒤 재진입 → 홈(has-save). 완료 지역·별은 보존되나 **전투 중간은 체크포인트 없음** |
| B15 | 비활성 버튼 이유 | PASS(확인됨) | 잠긴 지도 노드 "이전 지역을 완료하면 열려요", 엔딩 다시보기 잠금 아이콘 |
| B16 | 40분 수업 분량 | PASS(추정) | 봇 실측: S1 150~250초, S2 76~130초, S4 5문장 ≈2~3분, S5 P1~P3 ≈4~5분 → 평균 학생 5지역 20~30분 + 소개·결과 |
| B17 | 중복 처리 방지 | PASS(확인됨) | `check-score-rewards` 멱등, 제출 중 `finished` 가드(`*System.submit`) |
| B18 | 피드백 동기화 | PASS(확인됨) | 판정 팝업 동시 1개(check-layout 3), HUD·스냅샷·저장이 `INPUT_CORRECT` 한 사건에서 갱신 |
| B19 | 조작 응답 무결성 | PASS(확인됨) | 일시정지/재개·탭 숨김·Esc·자판 가이드 비차단(battle-flow 9/9 + 오늘 검증). 드래그 없음 → (4) 해당 없음 |

## C. 태블릿·UI

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| C1 | 16:9 가로 | PASS(확인됨) | 1280×800·1920×1080 전 화면 |
| C2 | 1024px 이상 | PASS(확인됨) | 1024×768 캡처, layout 스윕 |
| C3 | 터치 영역 | **FAIL(확인됨)** | 소리 팝오버 켜짐/꺼짐 토글: 1024×768 45.9×48, 915×412 34~37×48 (`check-popup-fit` sound 4케이스, production 도 동일). 그 밖의 조작 요소는 전부 ≥47px |
| C4 | 버튼 겹침 | PASS(확인됨) | 스윕 0건 + 캡처 육안 |
| C5 | 텍스트 잘림 | PASS(확인됨) | readability 10/10, result-fit 36/36 |
| C6 | 화면 밖 요소 | PASS(확인됨) | 스윕 0건, 결과 본문만 내부 스크롤 |
| C7 | 가로·세로 전환 | PASS(확인됨) | 375×812 세로 레이아웃(회전 차단 없음), viewport-resize 회전·키보드 2/2 |
| C8 | 과도한 애니메이션 | PASS(확인됨) | reduced-motion 시 Phaser 트윈·CSS 모두 축소(64곳 가드), check-layout 3 reduced 케이스 |
| C9 | 글자 대비 | NOT TESTED | 대비 비율 미측정(글자 크기만 측정). 어두운 패널 위 밝은 글자 구성이라 위험은 낮음 |
| C10 | 음소거 | PASS(확인됨) | 상단 바 소리 버튼, 설정 BGM/효과음 분리 |
| C11 | 키보드 접근 | PASS(확인됨) | Tab 으로 홈 버튼 초점, outline 4px solid |
| C12 | 디자인 일관성 | PASS(확인됨) | 디자인 토큰(`design-tokens.css`) + 공통 패널/버튼, 4해상도 캡처 |
| C13 | 색상 단독 구분 | PASS(추정) | 오답 = 빨강 + 흔들림 + 문구, 위험 몬스터 = 빨강 + 확대, 별 = 채움 여부 |
| C14 | 한글 조사 | WARNING(확인됨) | 조사 함수 없음. 펫 패시브 문구 "빨간 스카프 고양이이(가) …"(`check-delivery-translations` 케이스) 처럼 이중 표기 |
| C15 | UI 이모지 없음 | WARNING(확인됨) | `BattleCopy.ts:23,24,107,108` ✨, `WaveScene.ts:379` 🪙. 나머지 아이콘은 SVG |
| C16 | 제목 리본 1줄 | PASS(확인됨) | popup-fit·readability 통과(설정/가이드/도감 제목) |
| C17 | 가로 스크롤 없음 | PASS(확인됨) | 4해상도+세로 `scrollWidth - clientWidth` 0 |
| C18 | 모달 크기·닫힘 경로 | PASS(확인됨) | ✕·Esc·배경 탭, 긴 내용은 페이지형, 915×412 설정 캡처 |
| C19 | safe-area | PASS(추정) | 09-14 검수에서 `env(safe-area-inset-*)`·visualViewport 반영 확인, 오늘 변경 없음 |
| C20 | 글자 크기 하한 | PASS(확인됨) | readability: 1200+ 폭 본문 ≥20px·제목 ≥30px |
| C21 | 한글 줄바꿈 | PASS(확인됨) | `word-break: keep-all` 전역, 장문 32자 결과·전투 캡처 |
| C22 | 캔버스↔DOM 정합 | PASS(확인됨) | 말풍선이 스프라이트 실제 머리 위 14px(오늘 알파 스캔 앵커), 몬스터 낱말 머리 위 6px(check-layout 1) |
| C23 | 5초 안에 다음 행동 | PASS(확인됨) | 화면당 primary 1개(전투 시작!/다음 지역), 자판 가이드에 "글자를 치면 사라져요" |
| C24 | prefers-reduced-motion | PASS(확인됨) | CSS + `prefersReducedMotion()` 64곳(트윈 생성 자체를 건너뜀) |
| C25 | 텍스트 확대·줌 | NOT TESTED | 브라우저 125% 줌 미측정 |

## D. 성능

| # | 항목 | 판정 | 측정값 |
|---|---|---|---|
| D1 | 초기 로딩 | PASS(확인됨) | production preview: 조작 가능 0.33초, 영상 첫 프레임 1.3초, 건너뛰기 후 홈 1.6초; 10Mbps/80ms 스로틀 홈 2.9초(3회 2876~2955ms) |
| D2 | 이미지 크기 | PASS(확인됨) | dist 에 1MB 초과 이미지 없음(최대 mon_keyboard_golem.webp 852KB). public 의 og 샘플 5장·finale 포스터 PNG는 delivery-exclusions 로 제외 |
| D3 | 오디오·영상 크기 | WARNING(확인됨) | finale-v1.mp4 6.09MB(>5MB). intro-v1.mp4 3.8MB, bgm_desert 3.6MB |
| D4 | GLB·3D | NOT APPLICABLE | 없음 |
| D5 | 중복 asset | PASS(추정) | check-unused-assets 419자원 SHA 대조 통과, 같은 그림 다른 경로 발견 없음(정적) |
| D6 | 미사용 파일 | PASS(확인됨) | check-unused-assets: 제외 12파일 404·나머지 200 |
| D7 | 불필요 dependency | PASS(확인됨) | 런타임 의존성 phaser 1개 |
| D8 | 메모리 누수 | WARNING(추정) | `addEventListener` 61 vs `removeEventListener` 13(화면 파괴로 함께 사라지는 요소 리스너 다수, document/window 리스너는 제거 확인), MutationObserver 3 vs disconnect 2. 실측 없음 |
| D9 | frame 저하 | NOT TESTED | FPS 미측정(스로틀 CPU 실측 없음) |
| D10 | 저사양 위험 | WARNING(추정) | CSS blur/backdrop 4곳, 무한 트윈 12곳(reduced-motion 시 미생성), DOM+Phaser 동시. 헤드리스 4해상도 실행에서 오류·끊김 관찰 없음 |
| D11 | 오프라인 재방문 | WARNING(확인됨) | SW 등록·제어 PASS. 첫 방문 뒤 오프라인 홈: 시스템 글꼴 대체 + 아이콘 3개 깨짐(SW 제어 전 받은 폰트 17개). 두 번째 방문부터 완전. 미방문 지역은 오프라인 실패(예상). **수동 프리캐시 UI 오늘 제거됨** |
| D12 | 런타임 외부 요청 0 | PASS(확인됨) | 65요청 전부 127.0.0.1:4176 + blob: 3 |
| D13 | 애니메이션 속성(정적) | WARNING(확인됨) | `transition: all` 0, blur/backdrop-filter 4(`src/styles`), `will-change` 0, `repeat: -1` 12(`src/game`). 실측 FPS 없음 |
| D14 | 폰트 | PASS(확인됨) | Jua·NotoSansKR woff2 유니코드 서브셋 셀프호스팅, `public/licenses/*-OFL.txt` 동봉 |

## E. 코드 품질

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| E1 | 중복 코드 | PASS(추정) | 모드별 System 이 `TypingRun` 공통 코어 위에 얹힘, 씬은 `bind()` 헬퍼 공유 |
| E2 | 큰 파일 | WARNING(확인됨) | `src/styles/screens.css` 1321줄. TS 최대 592줄(WaveScene) |
| E3 | 미사용 import | PASS(확인됨) | `noUnusedLocals/Parameters: true` + tsc 통과 |
| E4 | `any` | PASS(확인됨) | 0건 |
| E5 | console 오류 | PASS(확인됨) | 모든 헤드리스 실행에서 pageerror/console.error 0 |
| E6 | 하드코딩 | PASS(확인됨) | 콘텐츠 JSON/data, 밸런스 상수 객체(WAVE·RACE·LETTER·TELE·BOSS). 오늘 남은 1건("문장 2개마다") 수정 |
| E7 | 잘못된 경로 | PASS(확인됨) | 빌드·delivery 419자원 200 |
| E8 | 대소문자 | PASS(확인됨) | production preview 에서 전 자원 SHA 일치 |
| E9 | 환경변수 노출 | PASS(확인됨) | 사용 없음 |
| E10 | lock 충돌 | PASS(확인됨) | package-lock.json 단일 |
| E11 | 빌드 오류 | PASS(확인됨) | 29.5초 성공 |
| E12 | 테스트 실패 | WARNING(확인됨) | 순수 로직·게임플레이·배틀·저장·레이아웃·결과·팝업(실질)·가독성·세로·엔딩·공격/보행 전부 PASS. 그러나 브라우저 스크립트 9개가 09-12/13 개편 이후 낡아 실패(게임 결함 아님) |
| E13 | 이벤트 위생 | PASS(추정) | `Events` 상수 단일 정의, 씬 `bind`/SHUTDOWN 에서 `off`, EventBus.on 13 / off 12 |
| E14 | 파일명 규칙 | PASS(확인됨) | 소스 kebab/Pascal 일관, 에셋 snake_case 일관, 생성기 기본 파일명 없음 |

## F. 데이터·안전

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| F1 | 이름·학번 수집 | PASS(확인됨) | 이름 입력 없음. `profile.name` 은 선택한 캐릭터 이름(하늘·보라·지호·루카) |
| F2 | 개인정보 저장 | PASS(확인됨) | localStorage `typing_adventure_save_v1`: 캐릭터·펫·난이도·진행·기록·설정만 |
| F3 | 외부 전송 | PASS(확인됨) | D12 와 같음, 서버 없음 |
| F4 | 저장 구조 | PASS(확인됨) | `SaveValidation.validateSave` 필드 단위 검증 |
| F5 | 저장키 | PASS(확인됨) | 접두어 `typing_adventure_` |
| F6 | version | PASS(확인됨) | `version: '2'` |
| F7 | migration | PASS(확인됨) | `check-progress` legacy 저장 읽기 |
| F8 | 초기화 | PASS(확인됨) | 취소/확인, 언어별 분리(save-flow) |
| F9 | 외부 링크 | PASS(확인됨) | about.ts 출처를 링크로 만들지 않음 |
| F10 | 저작권 | NOT TESTED | 생성 이미지(Higgsfield)·음원(Suno) 생성 당시 상업 이용권 증빙 문서 없음(09-14 와 동일) |
| F11 | 라이선스 | PASS(확인됨) | 폰트 OFL 동봉, Phaser MIT |
| F12 | 에셋 출처 | PASS(확인됨) | `docs/ASSET-PROMPTS.md`, `AUDIO-PROMPTS.md`, HANDOFF 기록 |
| F13 | 비밀키 | PASS(확인됨) | 키 종류 무관하게 번들·소스에 없음 |
| F14 | 손상 저장값 | PASS(확인됨) | save-flow: 깨진 JSON·중첩 손상 필드 단위 복구 |
| F15 | 해금 재계산 | WARNING(확인됨) | `clearedStages: []` + `unlockedStage: 5` 변조 → 지도 5노드 전부 열림. `SaveValidation.ts:67` 은 올리기만 하고 내리지 않음 |

## G. 배포

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| G1 | 배포 경로 | PASS(확인됨) | Vercel, `vercel.json` build/outputDirectory |
| G2 | base path | PASS(확인됨) | `base: './'` |
| G3 | SPA routing | PASS(확인됨) | 라우트 없음(query 만) |
| G4 | asset path | PASS(확인됨) | 상대 경로, production preview 전 자원 200 |
| G5 | 환경변수 | PASS(확인됨) | 없음 |
| G6 | 404 | PASS(추정) | 정적 단일 페이지, Vercel 기본 404 |
| G7 | OG 이미지 | PASS(확인됨) | `public/icons/social-preview.jpg` 253KB 1200×600, 절대 URL 지정(09-14 배포에서 접근 확인) |
| G8 | 제목·description | PASS(확인됨) | `index.html:7,12,13,26` |
| G9 | favicon | PASS(확인됨) | `icons/icon-192.png` |
| G10 | production build | NOT TESTED | 오늘 변경분은 아직 배포 전(로컬 빌드는 PASS) |
| G11 | 배포 후 smoke | NOT TESTED | 위와 같음 |
| G12 | 로그인 보호 없음 | PASS(확인됨) | 공개 URL |
| G13 | git status | WARNING(확인됨) | 커밋 안 된 50파일(+561/−344): 오늘 요청 작업 전부. 점검은 이 상태를 대상으로 했고, 사용자가 이 상태 점검을 요청했으므로 진행 |
| G14 | README | PASS(확인됨) | 적힌 명령 전부 `scripts` 에 실재 |
| G15 | .gitignore/.vercelignore | PASS(확인됨) | dist·tmp·_unused·assets 원본 제외, delivery-exclusions 로 og/blur 제외 |
| G16 | push 대상 | PASS(확인됨) | 원본 `assets/`·dist·tmp 제외 |
| G17 | origin 분리 문서 | PASS(확인됨) | `docs/delivery/HANDOFF.md:44` |
| G18 | 카톡 썸네일 | PASS(확인됨) | G7 과 동일 파일, 09-14 배포에서 확인 |
| G19 | 인쇄·이미지 저장 | NOT TESTED | 인증서 PC 인쇄 1장·iOS 공유는 헤드리스 불가 |
| G20 | 롤백 대상 | PASS(확인됨) | 현재 배포 = 커밋 616b991 (https://typing-adventure-b2mtb42ix-bongbiyobi-9992s-projects.vercel.app/), 로컬 HEAD 8b4176d |

---

## 개선 권장 (P3 — 판정·점수에 넣지 않음) · 재미·흥미

사용자가 "더 괜찮은 로직, 특히 재미" 제안을 요청해 실측에서 본 것 위주로 적는다. 효과 큰 순.

| 순위 | 제안 | 왜 | 위치 |
|---|---|---|---|
| 1 | **전투 중 실시간 별 예고** — HUD 에 "지금 페이스면 ★★☆ · 정확도 90% 유지 중" | 별 조건이 결과에서만 드러나 전투 중 목표가 흐릿. 정확도·시간 조건은 이미 `AwardRules.calcStars` 로 계산 가능 | `HudController.ts`, `BattleScreen.ts` HUD_TICK |
| 2 | **실패 결과에도 진행률 크게** — "30마리 중 23마리! 다음엔 7마리만 더" | 느린 학생이 시간 초과로 지면 성취가 사라진다(S1 8초/낱말 봇이 23/30 에서 실패). 재도전 동기 = 남은 양 | `ResultScreen.ts` 배너 아래 |
| 3 | **S3 편지 복원의 시각 보상** — 문장 완성마다 편지 조각이 실제로 종이에 붙고, 9문장 뒤 편지 전체가 한 장으로 | 지금은 마지막 문장 1줄만 종이에 보임(`restoredLine` 하나). 9문장으로 늘린 만큼 "복원되는 그림" 이 성취감을 줌 | `LetterScene.ts writeLine` |
| 4 | **S5 장문 문장마다 갑옷 조각 떨어지는 연출** | 봉인 마커 6개만 바뀜. 장문 6문장의 중간 보상이 약함 | `BossScene.renderFinalState`, `BossImpact.ts` |
| 5 | **타수 목표 설정과 홈 그래프** — 결과의 추세 막대를 홈에도 두고 "다음 목표 100타" 달성 시 칭호 | 오늘 넣은 타수 히어로의 성장감을 홈까지 이어 매일 오게 하는 고리 | `HomeScreen.ts`, `titles.ts` |
| 6 | **변화구 낱말(보물·하트·폭탄) 존재감** — 등장 시 효과음·테두리, 폭탄 3초 전 카운트다운 소리 | 12% 확률 변화구가 눈에 잘 안 띄어 리듬 변주가 약함 | `WaveScene`, `AudioManager` |
| 7 | **오늘의 도전 연속 출석(스트릭)** — 개인 달력 도장 | 클래스 비교 없이 개인 습관 형성. 저장 구조에 `records.daily` 가 이미 날짜 키 | `DailySystem`, 홈 |
| 8 | 이모지 ✨🪙 를 SVG 아이콘으로(C15), 조사 함수 도입(C14) | 전자칠판·기기별 렌더 차이 | `BattleCopy.ts`, `WaveScene.ts:379` |

## 문제 목록 (심각도 순)

| 등급 | 영역 | 문제 | 위치 | 재현 | 권장 수정 | 수정 시 위험 |
|---|---|---|---|---|---|---|
| P1→WARNING 수준(조작은 됨) | C3 | 소리 팝오버 켜짐/꺼짐 토글 폭 34~46px | `.sound-toggle-row` 버튼, 팝오버 320px | 1024×768 또는 915×412 → 상단 소리 버튼 → 토글 폭 측정 | 좁은 폭에서 팝오버 폭 확대 또는 토글 2줄, min-width 실효화 | 낮음(팝오버 내부만). 재검증 `check-popup-fit` sound 4케이스 |
| P2 | B14 | 전투 중 새로고침 시 홈으로(중간 진행 소실) | `BattleScreen`/`SaveSystem` | S3 2문장 후 새로고침 | 스테이지 내 체크포인트 저장(문장 인덱스·HP·시간) 또는 "이어서" 선택 | 중간(저장 스키마 확장) |
| P2 | F15 | 해금 플래그 변조 시 지도 전부 열림 | `SaveValidation.ts:67` | localStorage `unlockedStage:5, clearedStages:[]` | `unlockedStage = max(1, clearedStages 기반 계산)` 으로 내려도 재계산 | 낮음. 단 정상 저장에서 cleared 없이 unlocked 만 있는 구버전 호환 확인 |
| P2 | D11 | 첫 방문 오프라인 홈 글꼴·아이콘 3개 누락, 미방문 지역 프리캐시 수단 없음 | SW 프리캐시 목록(`vite.config.ts` globPatterns) | 온라인 1회 → 오프라인 새로고침 | 폰트 서브셋·홈 아이콘을 프리캐시에 추가, 홈 진입 뒤 백그라운드 지역 프리캐시 | 프리캐시 용량 증가(현재 7.9MB) |
| P2 | D3 | finale-v1.mp4 6.09MB | `public/assets/video` | — | 재인코딩(720p, CRF↑) | 화질 |
| P3 | C14·C15·E2 | 조사 이중 표기, 이모지 2종, screens.css 1321줄 | 위 표 | — | 조사 함수·SVG·CSS 분할 | 낮음 |
| 관리 | E12·G13 | 낡은 브라우저 스크립트 9개, 미커밋 50파일 | `scripts/` | — | 커밋·배포·스크립트 갱신 | — |

## 확인하지 못한 것

| 항목 | 왜 못 했나 | 누가 언제 확인 |
|---|---|---|
| F10 생성 미디어 이용권 | 증빙 문서가 저장소에 없음 | 사용자 — 배포 전 Higgsfield/Suno 계정 약관·구매 내역 보관 |
| G10·G11 | 오늘 변경분 미배포 | 사용자 — 커밋·배포 후 스모크 테스트 |
| G19 인쇄·폰 공유 | 헤드리스 불가 | 실기 iPad/Android 에서 인증서 인쇄 미리보기·공유 |
| C9 대비 비율 | 측정 도구 미실행 | 다음 점검 때 axe/contrast 스크립트 |
| C25 브라우저 줌 125% | 미측정 | 다음 점검 |
| D9 FPS | 저사양 CPU 스로틀 미실측 | 실기 태블릿에서 S1 웨이브 6·S5 러시 관찰 |

---

## 수정 기록 (점검 중 발견한 오늘 변경의 잔재만 — 사용자가 이 세션에서 해당 기능 수정을 요청한 범위)

| # | 고친 항목 | 수정 전 | 수정 후 | 재검증 결과 |
|---|---|---|---|---|
| 1 | S3 황금문 안내 문구가 자물쇠 규칙(3문장)과 불일치 | `LetterScene.ts:83` "문장 2개마다 하나씩 열려요" 고정 문자열 | `LETTER.perLock` 를 읽어 "문장 3개마다 하나씩 열려요" / "3 sentences = 1 seal" | `tsc --noEmit` PASS |
| 2 | `scripts/check-delivery.mjs` S3 루프 6문장 | 6 | 9 (`LETTER.sentences`) | `node --check` PASS(전체 재실행은 미수행) |

`git diff --stat` (세션 전체, 점검 전후 포함): 50 files changed, 561 insertions(+), 344 deletions(-) — 이 두 건은 그중 2줄.

수정 후에도 확인 못 한 것:

- check-delivery 전체(오프라인 지역 4~5·S5 모션 캐시) 재실행은 하지 않았다. 배포 전 `DELIVERY_TEST_URL=http://127.0.0.1:4176 node scripts/check-delivery.mjs` 로 한 번 더 돌릴 것.
