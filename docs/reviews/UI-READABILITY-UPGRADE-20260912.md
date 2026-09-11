# UI 가독성·팝업 개선 검증 · 2026-09-12

## 적용 범위

최종 점검에서 확인한 홈 더보기 내부 스크롤, 전자칠판 크기의 작은 본문, 긴 도움말 탐색을 개선했다. 기존 팝업의 내용별 높이·페이지 이동·배경 투명도와 캐릭터가 보이는 배치를 유지했다. 실제 사용자 브라우저와 저장 기록을 사용하지 않고 Playwright의 독립 컨텍스트 및 임시 저장만 사용했다.

- `src/game/ui/screens/HomeScreen.ts:115`: 홈의 추가 기능 6개를 작은 2열 메뉴 창으로 옮겼다. 기존 버튼 콜백을 보존하며, 다음 창을 열거나 화면을 바꾸기 전에 메뉴를 닫는다. Escape 뒤 더보기 버튼으로 초점과 `aria-expanded`가 복구된다.
- `src/game/ui/PagedContent.ts:15`, `src/game/ui/ModalController.ts:270`: 학생·교사 도움말에 주제 바로 찾기 선택 상자를 추가했다. 학생 16페이지/8주제, 교사 14페이지의 원문과 이전·다음 이동을 유지했다. 모달 Tab 순환에 `select`를 포함했다.
- `src/styles/design-tokens.css:256`, `src/styles/popups.css:72`: **뷰포트 너비 1200px 이상이고 높이 600px 이상**에서 모달·홈·준비 화면의 실제 본문 최소 20px, 부제 26px, 제목 30px 기준을 적용했다. 전체 게임의 모든 작은 보조 문구를 이 크기로 바꾼 것은 아니다.
- `src/styles/popups.css:83`: 전투 진행, 도착 거리, 추격 간격, 입력 안내를 같은 전자칠판 조건에서 실제 20px 이상으로 표시한다. 타이핑 목표와 입력칸은 기존의 더 큰 크기를 유지했다.
- `src/styles/popup-content.css:21`: 새 교정 비교 화면은 목표/내 오답 2열, 오류 종류 3열, 다음/바로 연습 2열이다. 원인 선택 전 다음 버튼이 공통 `.btn` 스타일 때문에 보이던 문제를 명시적인 `[hidden]` 규칙으로 막았다. 600자 저장의 비교 발췌에서도 긴 오답을 글자 단위로 줄바꿈하여 짧은 화면에 맞춘다.
- `src/game/ui/ModalController.ts:607`: `practiceModal(onClosed?)`가 완료·취소·Escape·배경 클릭으로 닫힐 때 후속 콜백을 한 번 실행한다. 연습 기록 저장, 모달 제거, 초점 복구 후 microtask에서 실행하여 결과 화면이 최신 성장 기록을 다시 그릴 수 있다.
- `src/styles/popup-content.css:6`: 인증서 짧은 화면의 2 design px 글꼴 잉크 넘침을 페이지 하단 여유로 흡수했다. 내용이나 버튼은 숨기지 않았다.

## 실제 글자 크기

CSS 값만 읽지 않고 `getComputedStyle(...).fontSize × (#ui-stage 실제 너비 / 1920)`으로 변환 후 크기를 측정했다. 표의 값은 한국어·영어에서 확인했다.

| 화면 크기 | 도움말·설정 제목 | 도움말 본문 | 홈 저장 안내 | 판정 범위 |
|---|---:|---:|---:|---|
| 1280×720 | 30px | 20px | 16px | 전자칠판 최소 기준 충족 |
| 1920×1080 | 36px | 22px | 18px | 전자칠판 최소 기준 충족 |
| 1024×768 | 22px | 16px | 16px | 개인 태블릿용 조밀한 배치 |
| 915×412 | 약 22px | 약 16px | 약 16px | 짧은 가로 화면용 배치 |

1280×720 스테이지 2 실제 전투에서는 진행도·목표 거리·추격 간격·입력 방법이 20px, 남은 시간 숫자 및 입력칸이 24px, 타이핑 낱말이 42.67px이었다. 한영 모두 검사 요소의 가로 넘침은 0이었다. 펫의 보조 효과 설명은 16px이며, 전자칠판용 모든 문구 20px 보장을 주장하지 않는다. 캐릭터와 펫이 보이는 전투 공간을 유지한 화면도 확인했다.

## 실행 증거

정적 검토가 아닌 실제 Chrome DOM·클릭·키보드·이미지 증거(A등급)이다. 패널이 게임 프레임 안에 들어오는지, 구조적 스크롤과 잘린 텍스트가 없는지, 버튼 및 선택 상자 최소 48px, 가려진 클릭 지점, 모달 초점, 런타임 오류를 검사했다.

| 검증 | 결과 | 증거 |
|---|---|---|
| 915×412 KO/EN 홈·더보기·준비 3단계·설정·학생 주제 8개·인증서 6페이지 | 2/2, 40상태 PASS | `tmp/ui-readability-short-final/results.json` |
| 1024×768 같은 한영 흐름 | 2/2, 40상태 PASS | `tmp/ui-readability-tablet-final/results.json` |
| 1920×1080 같은 한영 흐름 | 2/2, 40상태 PASS | `tmp/ui-readability-desktop-final/results.json` |
| 1280×720 영어 실제 production 4177 흐름 | 1/1, 20상태 PASS | `tmp/ui-readability-preview2/results.json` |
| 최종 통합 production 4180, 1280×720 KO/EN 같은 전체 흐름 | 2/2, 40상태 PASS, 브라우저 정상 종료 | `tmp/ui-readability-production-final/results.json` |
| 1280×720 한국어 source 흐름 | 20상태 PASS, 다음 케이스 전에 성능 측정을 위해 검사 종료 | `tmp/ui-readability-final/results.json` |
| 1280×800 영어 도감 모든 탭·페이지 | 1/1, 16상태 PASS | `tmp/ui-collection-first/results.json` |
| 1280×720/915×412 KO/EN 교사 도움말 전체 14페이지, 교정 비교·정답·실제 입력·완료, 600자 비교·닫기 | 최종 4케이스 80상태 PASS | `tmp/ui-extra-final-v2/results.json` 중 KO1280/EN1280/EN915, KO915 최종 재검은 `tmp/ui-extra-final-v3/results.json` |
| 1280×720 한영 전투 HUD | 필수 안내 20px, 가로 넘침 0 | 위 extra v2의 `*-hud` 2상태 및 PNG |
| 연습 완료/취소 callback | 모달 제거 및 inert 복구 뒤 정확히 1회씩 | extra v2/v3 실행 assertion |
| 더보기 닫기/설정/도감/인증서/새 모험 취소 | 기존 기록 보존, 초기화 취소 전후 raw save 동일 | readability 스크립트 assertion |

검사 명령은 `scripts/check-ui-readability.mjs`이며 `READABILITY_URL`, `READABILITY_SIZE`, `READABILITY_LANGUAGE`, `READABILITY_OUT`으로 대상을 고를 수 있다. 추가 교정·교사·HUD 검사는 `tmp/check-ui-extra-qa.mjs`의 독립 source 컨텍스트에서 수행했다.

최종 production 스모크의 릴리스 식별자는 manifest `1bb5c1ef84256433`, JavaScript `index-CEgEbznu.js`, CSS `index-BKWm7Uaq.css`다. 최종 글꼴·팝업 변경이 포함된 실제 번들에서 한영 40상태, 버튼/선택 상자 48px, 잘림·넘침 0, 런타임 오류 0, 초기화 취소 전후 기록 보존을 확인했다.

1280×720 영어 홈 추가 메뉴의 높이는 약 263.83px으로 내부 스크롤 없이 6개 기능이 한 번에 보였다. 영어 준비 화면은 각 단계가 약 558/486/564px로 내용에 따라 달라졌다. 확대 전자칠판 문구를 유지하면서 화면을 가득 채우는 빈 여백은 다시 넣지 않았다.

## 발견 후 수정한 회귀와 한계

- 첫 교정 비교 검사에서 숨긴 다음 버튼이 표시되고 짧은 화면에 넘침이 생겼다. `[hidden]` 우선순위를 수정한 후 재검했다.
- 600자 한국어 비교에서 공백을 뺀 긴 오답 덩어리가 불필요하게 다음 줄로 밀렸다. 비교 문장만 글자 단위 줄바꿈으로 바꾼 뒤 KO915 20상태가 모두 통과했다.
- 초기 개발 서버 탐색 timeout은 source 서버 교체 후 사라졌다. 앱 기능 실패로 계산하지 않았다.
- 600자 경계 검사는 **비교 발췌 화면**의 경계 검증이다. 600자 전체 원문을 짧은 화면 한 장에서 모두 표시한다는 보장은 하지 않는다. 일반 문장 실제 연습 입력·3개 완료는 별도로 확인했다.
- 교실 거리·실제 전자칠판 장치·학생 관찰 검증은 하지 않았다. 1024×768 및 915×412는 개인 화면용 글꼴 기준이며 전자칠판 20px 기준 적용 대상이 아니다.
- 최신 통합 production의 한영 팝업 스모크는 위 릴리스 식별자로 완료했다. 실제 배포 호스트 점검은 릴리스 담당의 별도 확인 대상이며, 로컬 production 증거만으로 원격 배포 완료를 주장하지 않는다.
