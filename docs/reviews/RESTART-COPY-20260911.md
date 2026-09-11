# 새 모험 안내 문구와 기록 보존 검증

2026-09-11. 사용자가 “새 모험”을 눌렀을 때 기록을 지운다는 뜻인지 알기 어렵다고 지적한 부분을 다뤘다. 캐릭터 이미지·움직임 수정은 이 기록의 범위가 아니다. 최종 빌드에서는 이 안내와 기록 보존 흐름만 재검증했다.

## 실제 동작과 바뀐 안내

`SaveSystem.restartAdventure()`는 현재 선택한 언어의 이름·진행·별·코인·해금·도감·타자 기록을 새 상태로 만들고, 설정과 다른 언어의 기록은 보존한다. 기존 기능도 현재 언어의 기록을 지우는 동작이었다.

- 홈 버튼을 **기록 지우고 시작 / Erase & start over**로 바꿨다.
- 한국어 제목은 **한국어 기록을 지울까?**, 본문은 1단계부터 다시 시작한다는 것과 사라지는 기록·남는 영어 기록·되돌릴 수 없다는 것을 구체적으로 알린다. 영어에서는 영어 기록을 지우고 한국어 기록을 남긴다고 설명한다.
- 선택 버튼은 **지우고 시작 / 기록 남기기**다. 지우기는 빨간색이고, 처음 키보드 초점은 **기록 남기기**에 놓인다.
- `confirmModal`에 선택적 `destructive` 옵션을 추가했다. 옵션을 지정하지 않은 기존 확인창의 버튼과 동작은 유지한다.

## 확인 결과

개인 저장소와 분리된 Playwright 브라우저 컨텍스트에 합성 한영 기록을 넣어 실제 버튼으로 검사했다. 사용자 브라우저의 저장 기록은 건드리지 않았다.

| 검사 | 결과 | 근거 |
|---|---|---|
| 현재 언어 새 시작: 한국어·영어 | **2/2 PASS** | `tmp/restart-copy-source/results-recheck.json` |
| 처음 Enter, Escape, 기록 남기기 | 두 언어에서 저장 원문 그대로 유지. 취소 후 홈의 원래 버튼으로 초점 복원 | `scripts/check-save-flow.mjs` |
| 지우고 시작 | 현재 언어의 이름·진행·별·코인·최고 타수·배지·학습 기록 초기화, 설정과 다른 언어의 프로필·진행·학습 기록 보존, 다른 언어로 실제 전환해 복원 확인 | 같은 검사 |
| 1280×720·915×412, 한국어·영어 | **4개 화면 직접 검토**. 설명과 두 버튼이 화면 안에 있고, 잘림·가로 넘침 없음. 버튼 중앙이 실제 클릭 가능한지 검사 | `tmp/restart-copy-source/ko-1280-restart.png`, `ko-915-restart.png`, `en-1280-restart.png`, `en-915-restart.png` |
| 설정의 기존 전체 초기화 | **1/1 PASS**. 아니요로 보존, 예로 양쪽 언어 초기화 확인 | `tmp/restart-copy-settings-regression/results-recheck.json` |
| 브라우저 예외 | 위 세 흐름 모두 없음 | 위 결과 파일 |

위 검사 주소는 소스 개발 서버 `http://127.0.0.1:5180`이다. 초등학생의 실제 문구 이해도 시험을 진행한 것은 아니다.

## 최종 production 재검증

`dist-preview-20260911-walk-v2-final/`을 제공하는 `http://127.0.0.1:4176`에서 새 격리 컨텍스트로 같은 현재 언어 새 모험 검사를 실행했다. 출력의 앱 파일은 `index-CM8KBxgB.js`다.

- **한국어·영어 2/2 PASS**. 최초 Enter·Escape·기록 남기기의 저장 보존, 지우기 후 현재 언어 초기화·다른 언어와 설정 보존, 다른 언어로 전환해 복원까지 재확인했다.
- 두 언어에서 각각 1280×720·915×412 화면 경계와 버튼 클릭 가능 여부를 검사했다. 그중 915×412 한영 스크린샷 두 장을 직접 다시 확인했고 설명과 버튼의 잘림이 없다.
- 브라우저 예외는 없었다. 설정의 전체 초기화 회귀는 위 소스 검사 결과이며 이번 production 필터에 포함하지 않았다.
- 근거: `tmp/restart-copy-production-final/results-recheck.json` 및 같은 폴더의 `ko-1280-restart.png`, `ko-915-restart.png`, `en-1280-restart.png`, `en-915-restart.png`.

사용자 브라우저의 저장소나 열린 탭은 조작하지 않았다. 기존 열린 탭의 서비스 워커 갱신 여부는 이 격리 검사와 별개다.

## 재실행

```powershell
$env:SAVE_TEST_FILTER='현재 언어 새 모험'
$env:SAVE_TEST_OUT='tmp/restart-copy-source'
node scripts/check-save-flow.mjs

$env:SAVE_TEST_FILTER='전체 초기화'
$env:SAVE_TEST_OUT='tmp/restart-copy-settings-regression'
node scripts/check-save-flow.mjs
```

```powershell
$env:SAVE_TEST_URL='http://127.0.0.1:4176'
$env:SAVE_TEST_FILTER='현재 언어 새 모험'
$env:SAVE_TEST_OUT='tmp/restart-copy-production-final'
node scripts/check-save-flow.mjs
```
