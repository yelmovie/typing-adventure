# 타이핑 어드벤처 (Typing Adventure)

플레이: [타이핑 어드벤처](https://typing-adventure-six.vercel.app/) · 최신 납품 기준: [v0.5.0 안내](docs/delivery/HANDOFF.md)

초등학생용 한국어·영어 타자 판타지 모험 웹게임(v0.5.0). 사라진 글자를 되찾기 위해 5개 스테이지를 타이핑으로 돌파한다.
정적 웹앱이며 기록은 브라우저 localStorage 에만 저장된다(서버·로그인·개인정보 수집 없음).

| 스테이지 | 플레이 | 타이핑 |
|---|---|---|
| 1 푸른 숲 | 몬스터 20마리 웨이브 전투 | 짧은 낱말 |
| 2 네온 시티 | 500m·보통90초 추격전, 실제 거리 반응·동일 코스 고스트 | 낱말 연속 |
| 3 사막 유적 | 편지 6문장 복원 → 황금문 자물쇠 3개 | 문장 |
| 4 폭주 열차 | 280m 안에 긴급 전보 3문장 | 문장 + 시간 압박 |
| 5 어둠의 성채 | 결정 파괴 → 속도 러시 → 마지막 문장 (3페이즈) | 종합 |

공통: 글자마다 약공격, 낱말 완성 강공격, 낱말 10콤보 POWER / 20콤보 FEVER(문장 모드는 2·4연속), 변화구 낱말(보물·하트·폭탄),
친구 스킬 4종, 입력 속도에 맞는 난이도, 직업별 공격 연출, 오늘의 도전, 배지·칭호·홈 장식.
처음 한 번만 지역별 1~3개의 몸풀기를 완료하며, 연습한 내용은 언어별로 기억한다. 재도전은 결과 화면에서 바로 시작한다.
오답은 고쳐서 다시 제출하고, 건너뛴 목표는 완료로 세지 않는다. 결과에서 실제 오답의 차이를 비교하고 원문 교정과 다른 예시 두 개에 적용한다.

가로 화면과 세로 화면을 지원한다. 세로에서는 지도·선택·가이드·결과를 읽는 순서로 재배치하고 긴 본문은 스크롤한다. 입력 중 가상 키보드가 화면 높이를 줄여도 입력창을 가용 영역에 배치하며, 화면 회전은 진행을 초기화하지 않는다. 최근 로컬 검수와 실기기 확인 범위는 [반응형 최종점검](docs/reviews/FINAL-CHECK-20260914.md)에 기록했다.

## 실행

```bash
npm ci
npm run dev        # http://localhost:5180
npm run build      # tsc + vite build → dist/
npm run check      # 타이핑 코어와 스테이지별 순수 로직 셀프체크
npm run assets     # assets/ 원본 → public/assets/ 변환 (전체)
npm run assets:motion # 새 한글 공격·캐릭터/펫 보행 시트 패킹과 칸 여백 검사
node scripts/build-assets.mjs v2   # 새로 추가한 배경·시트만
npm run sfx        # 효과음 자체 합성 (wav → ffmpeg 로 ogg)
npm run check:finale # 완주 영상·인증서 브라우저 회귀 검사
npm run check:battle # 전투 부정 경로·일시정지·영문 입력 브라우저 검사
npm run check:learning # 한국어/영어 교정 → 성장 저장 → 모험 플러스
node scripts/check-journey-flow.mjs # 모험 플러스 소개 → 한영 편지/전보 완주 → 인장·지도 복구·저장
npm run check:save # 저장 복구·언어별 기록·도감 장착 브라우저 검사
npm run check:gameplay # 추격 속도·튜토리얼·새 한영 콘텐츠 계약
npm run check:tutorial # 실제 입력·수정·띄어쓰기·콤보·언어별 완료 저장
npm run check:opening # 첫 인트로 재생·종료·건너뛰기·오류·포커스
node scripts/check-audio-flow.mjs # 실제 BGM 시작·재개·장면 전환·음소거 검사
node scripts/check-delivery-translations.mjs # 한국어 보존·복합 영어 문구 회귀 검사
npm run check:delivery # production preview:4176 + 오프라인·배포 자산 검사
node scripts/check-portrait-panels.mjs # 세로 홈·설정·가이드·도감
node scripts/check-result-fit.mjs # 긴 결과·교정·보상 페이지와 실제 클릭 가능 여부
node scripts/check-viewport-resize.mjs # 입력 중 키보드 높이 변화 모델·양방향 회전
node scripts/build-home-assets.mjs # 원본 시트에서 홈 전용 무손실 atlas 재생성
```

개발용 바로가기(저장 데이터 있을 때): `?go=battle&stage=stage_1`, `?go=worldmap`, `?go=intro&stage=stage_3`, `?st=1`(숨김 탭 대응), 콘솔 `window.__battle`.

## 구조

- `src/game/systems/TypingRun.ts` — 모든 모드가 공유하는 타이핑 코어(음절 판정·콤보·FEVER·변화구·펫·적응형)
- `src/game/systems/{Wave,Race,Letter,Telegram,Boss,Daily}System.ts` — 스테이지별 규칙(순수 로직, `TypingMode` 인터페이스)
- `src/game/scenes/*Scene.ts` — Phaser 연출. DOM HUD/입력은 `src/game/ui/screens/BattleScreen.ts` 공통
- `src/game/data/content.json` — 출제 낱말·문장 (태그: 편지/전보/결정/러시/최종/보물/하트/폭탄)
- `src/game/data/content-en.ts` — 영문 낱말·문장·긴 글. 같은 지역/태그 계약을 사용
- `src/game/i18n/` — 첫 화면 언어 선택에 따른 화면 문구·Canvas 번역
- `src/game/systems/{SaveValidation,LearningSystem,ReplaySystem}.ts` — 저장 검증, 수정·새 글 수행 증거, 반복 도전 목표
- `docs/PLAN.md` — 현행 구현 안내와 과거 계획 이력. 상단의 최신 구현·검수 안내부터 확인
- `docs/delivery/HANDOFF.md` — 수업 준비·배포·장애 복구·납품 확인
- `docs/delivery/CLASSROOM-PILOT.md` — 40분 수업 예시·언어별 활동·학생/실기기 관찰표

## 한글 입력

실제 `<input>` 과 브라우저 IME 를 쓴다. compositionend 이후 NFC 정규화 문자열로만 판정하며 조합 중엔 오답 처리하지 않는다.
타수 = 정답 확정 글자의 키 입력 수(예: 학교 = 5타) ÷ 실제 진행 분. 일시정지 시간은 제외한다.

## 언어와 다시 하기

첫 화면의 **한국어 / English**에서 선택한다. 영어에서는 라틴 문자 한 글자를 1타로 세고 대소문자·띄어쓰기·문장부호를 구분한다. Shift 조작은 자판 가이드에 표시하지만 별도 타수로 가산하지 않는다.
진행·최고 기록·학습 기록·친구는 언어별로 보관한다. 새 모험은 현재 언어만 다시 시작하고 설정의 전체 초기화는 두 언어의 기록을 모두 지운다.

첫 지역을 완료하면 홈의 **모험 플러스**에서 해금된 지역의 미션 카드를 골라 소개 화면을 거쳐 시작한다. 숲·도시·성채는 새 낱말 조합, 사막·열차는 연결된 새 이야기로 플레이한다. 정확도 90% 이상으로 목표 10개를 완성하거나 편지·전보 한 지역을 완주하면 정확 인장을 얻는다. 고쳐서 성공하기와 새 조합 완주에도 각각 하루에 인장 하나를 얻으며, 같은 날 같은 목표를 반복해도 중복 지급하지 않는다. 쉬는 날에도 누적 인장은 사라지지 않는다.

홈·지도·지역 소개·결과는 다섯 지역에서 되찾을 빛을 이어서 보여 준다. 지도에 복구한 유물을 표시하는 기준은 실제 지역 완료 기록이다. 해금만 되거나 실패한 지역은 복구한 것으로 표시하지 않는다.
교정 활동은 잘못 입력한 내용을 살펴본 뒤 같은 유형의 다른 예시로 이어진다. 수정과 새 글 성공은 실제 기록이며, 교육효과의 인과적 입증은 별도의 학생 검증이 필요하다. 학습 활동 최근 60회와 출제 경험 최대 500개를 기기 내부에 보관한다.

## 지역별 출제 콘텐츠

한국어 196개·영어 139개의 타이핑 단위를 사용한다. 숲은 소리·간식·모험 친구, 네온 시티는 질주·우주 장비·샛길, 사막은 별빛 지도를 따라가는 편지, 열차는 기관사에게 보내는 긴급 전보, 성채는 글자를 되찾는 성취 문장으로 구성한다. 성채의 마지막 문장은 언어별 12개 후보에서 갑옷·코어·마무리 역할에 맞게 3개를 고른다. 오늘의 도전에는 간식 축제·로켓 택배·별빛 도서관의 짧은 이야기가 들어 있다.

이 기본 수량과 별도로 **모험 플러스 이야기 풀은 각 언어 27문장**이다. 사막은 6문장짜리 이야기 3편, 열차는 3문장짜리 이야기 3편이며, 한 판 안에서는 선택된 이야기의 문장 순서를 유지한다. 같은 앱 실행 중 같은 지역을 다시 시작하면 직전과 다른 이야기 세트를 고른다.

낱말의 ID·난이도·모드·순서 태그는 유지한다. 따라서 이미 저장된 학습 이력도 보존되며, 같은 ID의 문구가 바뀌었다고 새 출제 경험으로 다시 계산하지 않는다. 콘텐츠 무결성과 실제 게임 진행 검사는 재미의 입증과 별개이며, 학생이 다시 플레이하며 느끼는 흥미는 관찰로 확인해야 한다.

`node scripts/check-content.mjs`로 실제 언어 전환, 출제 수량, 받침·복합모음 태그, 길이, 이야기 순서와 가이드 번역을 검사한다.

## 오프라인 수업

설정에서 수업 자료를 다운로드하고 **수업 준비 완료** 상태를 확인한다. 홈 한 번 열기만으로 모든 지역이 준비되지는 않는다.
준비는 배포 자산의 SHA-256과 완료 개수를 확인하며 중단 뒤 재개할 수 있다. 준비한 동일 브라우저에서만 유효하다. 시크릿 창·브라우저 데이터 삭제·저장 공간 정리는 자료와 기록에 영향을 준다.
개발 서버에서는 서비스워커가 활성화되지 않으므로 `npm run build`와 production preview에서 검증한다.

## 에셋·라이선스

`assets/CREDITS.md` 참고. 이미지는 제작자가 ChatGPT 이미지 생성으로, BGM 은 Suno 로 제작. 효과음은 `scripts/gen-sfx.mjs` 자체 합성.
부엉이·올빼미 이미지는 사용하지 않는다.

ⓒ 2026. 자체 제작 자료의 무단 복제·재배포·상업적 이용을 금지합니다.

## 새 콘텐츠나 지역을 추가할 때

1. 낱말은 `src/game/data/content.json`, 영어는 `content-en.ts`에 고유 ID·지역·언어·난이도·학습 태그를 함께 넣는다. 문장 모험은 `remixStories.ts`의 이야기 순서를 유지한다.
2. 보스 마지막 문장은 `boss-content.ts`의 언어별 후보에 넣는다. 같은 최종 단계에서 중복 출제하지 않는 검사도 실행한다.
3. 지역 자체를 추가할 때는 `types/index.ts`의 StageId, `data/stages.ts`, `worldJourney.ts`, `StagePracticeRules.ts`와 저장 검증의 허용 지역 목록을 함께 갱신한다. 기존 ID를 재사용하지 않는다.
4. `npm run check`, `npm run check:gameplay`, `npm run typecheck` 후 브라우저에서 새 콘텐츠로 완료·저장·재방문까지 확인한다. 문장 길이와 지역 순서 검사는 `scripts/check-content.mjs`에 있다.
5. 이미지 원본은 assets/에 보관하고 실제 배포용 최적화 파일만 public/에 둔다. public/ 자산 변경 후 빌드해 새 manifest를 만든다.

`docs/delivery/HANDOFF.md`가 현재 전달 기준이다. 과거 날짜의 결과를 최신 검증으로 대체하지 않는다.
