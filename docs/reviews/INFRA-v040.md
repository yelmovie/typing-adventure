# 업데이트·오프라인·초기 로딩 개선 검증 — 2026-09-12

검증 대상은 `tmp/upgrade-infra-build-20260912/`, manifest `4ec5deef989b098f`, 앱 `index-DfSTIbau.js`, CSS `index-bJiTbmN_.css`다. 최종 통합 빌드 및 공개 도메인과 구분한다. 모든 검사는 새 Playwright 문맥/임시 origin을 사용했고 사용자의 탭이나 저장소를 변경하지 않았다.

## 적용

- `vite.config.ts`: SW를 prompt 방식으로 전환. 페이지를 강제로 새로고침하지 않으며, 전체 public 대신 기존 app shell만 precache한다. `/licenses/`를 오프라인 runtime 경로에 포함했다.
- `src/game/ui/UpdateNotice.ts`, `src/styles/update-notice.css`, `src/main.ts`: 홈/지도에만 한영 업데이트 알림을 제공한다. 전투·준비·모달·인트로 재생 중에는 보류한다. 사용자가 적용을 누르면 저장 성공을 확인하고 대기 중 SW를 활성화한다. 저장 실패/복구 대기 중에는 새로고침하지 않는다. 다른 탭의 SW 적용도 현재 게임을 강제로 다시 열지 않는다.
- 최초 SW 등록을 인트로 종료 뒤로 미뤘다. `ClassroomReady.ts`의 명시적 자료 준비는 필요하면 바로 등록한다.
- `scripts/check-learning-flow.mjs`: 설정과 리플레이의 실제 페이지 버튼을 사용한다. 한영 오답 원인 선택→원문 교정→다른 예문 2개→졸업→반복 연습에서 교정 수 부풀림 없음→재도전을 검사한다. 실패 원본을 스크린샷 오류가 덮지 않도록 보강했다.

## 결과

| 검사 | 결과 | 증거 |
|---|---|---|
| 타입 검사 / production build | PASS | `npx tsc --noEmit`; `npx vite build --outDir tmp/upgrade-infra-build-20260912`; 11개 app-shell precache, 약 2.28MiB |
| 실제 A/B SW 대기 및 보류 | PASS | 홈 알림, 다른 전투 탭 비노출, ‘나중에’ 후 재안내 |
| 직접 새 버전 적용 | PASS | 새 HTML 버전 B 실행, profile/progress/settings/records 동일. 적용 탭 navigation 1회, 다른 전투 탭 0회 |
| 저장 공간 실패 | PASS | 임시 quota 오류에서 SW 활성화·새로고침 차단, 기존 페이지/기록 유지 |
| 실제 설정의 오프라인 다운로드 | PASS | 429/429개 SHA-256 검증. 캐시 하나 제거→누락 감지→이어받기 |
| 네트워크 차단 뒤 실행·자료 접근 | PASS | HTTP 캐시 비활성화, 오프라인 홈 실행. 429/429개·53,133,564B 읽기 성공. OFL 라이선스 2개 포함. 외부 요청 및 런타임 오류 없음 |
| 한영 학습 UI 회귀 | PASS | KO/EN 2개 흐름. 첫 교정 corrected=1/newSuccesses=2, 다음 연습 corrected=0 |

증거: `tmp/safe-update-check/results.json`, `notice-ko.png`; `tmp/offline-ready-check/offline.json`, `classroom-ready.png`; `tmp/learning-flow-check/results.json`.

## 오늘의 cold 실측

Chrome 152, 1280×800, 다운로드 10Mbps/업로드 2Mbps/지연 80ms. 다른 에이전트의 브라우저와 빌드를 멈춘 상태에서 새 문맥 3개를 순차 실행했다. 시각은 페이지 내부 RAF 및 requestVideoFrameCallback으로 측정한다. 드라이버 클릭 대기 시간은 로딩 시간에서 분리한다.

| 측정 | 기존 빌드 3회(ms) | 개선 검증 빌드 3회(ms) |
|---|---|---|
| 인트로 조작 가능 | 3216 / 8257 / 3365 | 4725 / 3197 / 3243 |
| 첫 영상 프레임 | 4557 / 8605 / 3947 | 6892 / 4844 / 4873 |
| 건너뛰기→홈 | 11 / 12 / 18 | 21 / 228 / 10 |

조작 가능 최악값은 8.257→4.725초, 첫 영상 최악값은 8.605→6.892초로 줄었다. 첫 영상 중앙값은 4.557→4.873초여서 모든 로딩 지표가 빨라졌다고 주장하지 않는다. 새 빌드 3회 모두 첫 프레임 시점 SW 등록은 false로, precache와 초기 영상의 경쟁을 피한 것은 직접 확인했다. 최종 영상/폰트 최적화와 실제 학교망 측정은 별도 과제이며 첫 영상이 항상 5초 이내라는 기준은 아직 충족하지 못했다.

증거: `tmp/final-audit-perf-20260912/opening-cold.json`, `tmp/safe-update-check/opening-cold.json`. 완료된 리소스 전송량은 in-flight/취소된 미디어 전체 용량을 나타내지 않는다.

## 최초 구버전 이행과 범위

이미 열려 있던 구버전 앱에는 새 알림 코드가 없다. 최초 이행은 **이 게임의 기존 탭을 모두 닫고 다시 열기**가 필요할 수 있다. 사이트 데이터 삭제는 필요 없으며 로컬 기록은 보존한다. 이후 이 코드가 실행된 탭에서는 검증한 알림/직접 적용 흐름을 사용한다. 단순 새로고침 한 번으로 모든 기존 탭이 전환된다고 주장하지 않는다.

실제 학교 다중 기기/공유망, 공개 호스팅, 최종 통합 빌드의 cold 실측, 이번 오프라인 검사에서 전체 다섯 스테이지를 처음부터 완주하는 경로는 NOT TESTED다. 오프라인 자료 429개 및 실행 검증과 게임 전체 완주 검증은 구분한다.

## 재현

```powershell
$env:UPDATE_TEST_DIST='tmp/upgrade-infra-build-20260912'
node scripts/check-safe-update.mjs
$env:OFFLINE_TEST_URL='http://127.0.0.1:4177'
$env:OFFLINE_TEST_DIST='tmp/upgrade-infra-build-20260912'
node scripts/check-offline-ready.mjs
$env:LEARNING_TEST_URL='http://127.0.0.1:4177'
npm run check:learning
$env:DELIVERY_TEST_URL='http://127.0.0.1:4177'
$env:DELIVERY_DIST='tmp/upgrade-infra-build-20260912'
$env:OPENING_TIMING_OUT='tmp/safe-update-check/opening-cold.json'
node scripts/measure-opening-cold.mjs
```

성능 명령은 다른 브라우저/빌드 검사가 끝난 뒤 단독 실행한다. A/B 검사는 게임 production 코드는 그대로 두고 임시 서버에서 HTML 표식과 그 SW revision만 바꿔 두 배포를 구분한다.
