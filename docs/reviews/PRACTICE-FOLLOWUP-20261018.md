# 긴 글 진행·IME·태블릿 후속 검수 (2026-10-18 KST)

## 시작 상태와 운영 확인

- 시작 로컬: `main`, `e6a841a8dacdeeadc1f0c4e3e610e8d07d8a6a4b`. 추적 파일 수정 없음. 기존 미추적 `public/icons/ai-mart-thumbnail-v2.png`는 그대로 보존했다.
- [PR #1](https://github.com/yelmovie/typing-adventure/pull/1): OPEN / 미병합, head `0f89d46670cbe8b69269b942f34f1ff571734c1b` (`codex/tablet-practice-qa-20261018`). PR의 렌더링 수정과 기존 검수 자료를 그대로 가져와 같은 브랜치에서 보완했다.
- [운영](https://typing-adventure-six.vercel.app/): production READY `dpl_2XzfBFNFBGdMALqEFMqtsTnVDtk7`, `main` / `e6a841a`. Vercel 연결 도구는 404였으므로 기존 로컬 Vercel CLI로 동일 팀·프로젝트의 배포와 커밋 메타데이터를 확인했다.
- 운영 URL의 격리된 새 브라우저 프로필에서도 **1→2구간 오류를 직접 재현**했다. 진행 `2 / 15`, 표시 문장 첫 구간 유지, `data-target` 다음 구간. 운영 JS `index-B8GRhHCY.js`, CSS `index-DQjr6alM.css`.
- 로컬 검증 결과를 공유한 뒤 사용자가 이번 수정의 커밋·푸시와 PR #1 업데이트를 승인했다. 병합·운영 배포는 승인 범위에 포함되지 않는다. **운영 해결 완료가 아니다.**

## 원인과 수정

1. **표시와 정답 불일치:** 제출 코드가 `paint()`보다 먼저 `data-target`을 다음 정답으로 덮어써서, `paint()`의 변경 감지와 글자 노드 교체를 건너뛰었다. PR #1의 두 군데 제거 수정이 정확해서 유지했다. 구간 교체 시 제시문 내부 스크롤도 처음으로 되돌린다. 새로고침 우회는 없다.
2. **IME 종료 후 이전 입력 잔류:** `compositionend` 안에서 즉시 제출·초기화하면 뒤따르는 최종 `input` 이벤트가 이전 문장을 다시 넣을 수 있었다. 조합 중 Enter 요청을 보관하고 조합 종료 뒤 다음 이벤트 루프에서 확정 값을 한 번 제출한다. Enter의 기본 제출/줄바꿈과 반복 keydown을 차단하고, blur 시 대기 제출을 취소한다. 기존 한 번의 Enter 제출 경험과 NFC 정규화는 유지한다.
3. **세로 자판과 입력창 잘림:** 전역 세로 자판의 큰 키·패딩이 연습 자판에도 적용됐고, 화면 키보드가 열려도 세로 배율을 유지해 제목·통계가 입력 영역을 밀어냈다. 연습 화면에 한정해 자판 크기·패딩, 통계 폭, 영문 입력창 높이를 맞춘다. OS 키보드가 열린 세로 화면은 제목·통계를 접고 현재 구간·입력·보내기·나가기를 우선 배치한다. 닫으면 CSS 조건이 해제돼 복원된다.

수정 파일:

- `src/game/ui/screens/TutorialScreen.ts`: PR 렌더링 수정 유지, IME/Enter 중복 방지, 구간 스크롤 초기화.
- `src/styles/adaptive-layout.css`: 연습 화면의 세로 배치 및 화면 키보드 대응만 보완.
- `scripts/check-tablet-practice.mjs`: 1→2→3, 오답→정답, 이전 구간 거부, 강조/포커스/초기화, IME 이벤트 순서, 중간 구간, 완주·재시작·재접속 저장 검사 추가.
- `scripts/check-save-flow.mjs`: 현재 저장 정규화가 이미 추가하던 일기·보석·아이템·도전·어둠 모드 기본값을 테스트 데이터에 명시. 전체 객체 비교는 유지하며 제품 저장 코드는 바꾸지 않았다.
- `package.json`: `npm run check:practice` 진입점 추가. 설치된 Playwright Chromium이 없으면 기존 Chrome을 사용한다.
- 이 문서: 변경·검증·운영 상태 기록.

전투·저장 스키마·보상 계산·공통 Viewport 구현은 변경하지 않았다.

## 재현과 검증 범위

- PR #1만 적용한 상태에서 추가 검사 실패를 확인했다: 최종 IME input 뒤 이전 입력 잔류, 768×1024 세로 자판/입력창 잘림.
- 데스크톱 1920×1080, 태블릿 가로 1024×768 / 1180×820 / 1280×800 / 1024×600, 세로 768×1024 / 820×1180 × KO/EN.
- 각 조합에서 시작, 긴 입력, 다음 구간, 오답, layout viewport 키보드 열기/닫기, visualViewport 키보드 열기/닫기, 중간 구간을 검사한다.
- 1280×800에서 KO 4편 + EN 4편을 실제 폼 제출로 끝까지 완성한다. 모든 구간에서 표시 글자와 판정 대상 일치를 확인하고, 완주 후 다시 쓰기의 1→2구간, 4편 완료 표시와 새로고침 후 저장 유지도 확인한다.
- 합성 IME: 조합 중 Enter는 제출하지 않음, compositionend 뒤 최종 input, compositionend가 먼저 온 legacy 229 Enter, Enter 반복 억제. 일반 영문 Enter도 반복 억제를 검사한다.
- 테스트 프로필만 사용한다. 저장 복원 검사의 새로고침은 테스트 목적이며 제품의 구간 진행에는 새로고침을 사용하지 않는다.

## 실행 결과

개발 서버 및 최종 production 빌드의 로컬 미리보기에서 검증했다. 운영 배포 테스트와 구분한다.

| 명령/검사 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm run check` | 통과: 입력·전투 모드·체크포인트·진행·보상 검사 |
| `npm run check:gameplay` | 통과: 튜토리얼 모델·경주 페이싱·한영 콘텐츠 |
| `npm run check:practice` | 최종 빌드에서 14/14 조합, 126/126 화면 상태 통과. KO/EN 각 4편 완주·저장 통과 |
| `npm run check:tutorial` | 3/3 통과: KO 1280×720, KO 915×412, EN 1280×720 |
| `npm run check:battle` | 10/10 통과: 커서·IME·회피·아이템·정지/재개·결과 보상/저장 |
| `npm run check:save` | 최종 전체 실행 10/12 통과, 화면 대기 시간 초과 2건. 해당 2건 단독 재실행 각각 통과 (아래 참조) |
| `npm run build` | 통과: TypeScript + Vite + PWA 산출물 생성 |
| `git diff --check` | 통과 |

재현 예시 (PowerShell):

```powershell
$env:TEMP = 'D:\isamgpt\24type\tmp'
$env:TMP = $env:TEMP
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
# 별도 터미널
$env:TABLET_TEST_URL = 'http://127.0.0.1:5180'
npm run check:practice
# 한 크기만 선택하려면 TABLET_TEST_SIZE=768x1024
```

최종 빌드의 전체 화면 결과는 `tmp/practice-production-build/results.json`, 보내기·한 줄 입력·재시작 자동 포커스 추가 검사는 `tmp/practice-focus-verified/results.json`에 있다(한영 2/2, 런타임 오류 0). 운영 오류 증빙은 `tmp/production-practice-current.json`, `tmp/production-practice-current.png`, 실행 로그는 `tmp/practice-*.log`에 있다. 초기 실패 결과는 별도 폴더에 보관했다.

초기 개발 서버 검사에서 화면 전환/로딩 대기 시간 초과가 있었고, 기존 튜토리얼 검사는 재실행 시 3/3 통과했다. 저장 검사의 초기 객체 비교 실패는 누락된 기존 기본값 때문에 발생했으며, SaveValidation.ts가 main과 동일함을 확인했다. 실패 이력을 최종 통과 기록으로 덮어쓰지 않았다.

저장 최종 전체 실행(`tmp/save-practice-final/results.json`)은 10/12 통과였다. 남은 2건은 런타임 예외나 데이터 비교 실패가 아닌 UI 대기 시간 초과이며, 전체 실행을 일괄 통과했다고 표기하지 않는다.

- 구문 오류 원본 보관·안전한 새 시작: 최종 빌드 `SAVE_TEST_FILTER='구문 오류'`로 단독 통과. `tmp/save-practice-startup-recheck/results-recheck.json`.
- 전투 중 새로고침·이어하기의 문장/점수/HP 복원: 개발 서버 `SAVE_TEST_FILTER='전투 중 새로고침'`으로 단독 통과. `tmp/save-practice-resume-recheck/results-recheck.json`.
- 나머지 10건은 언어별 진행/학습 복원, 새 모험 취소/초기화, 친구 장착 후 진행 보존, 저장 용량 오류 복구, 중간 저장 삭제/만료 등을 포함한다.

## 남은 제약과 운영 반영

- 위 검사는 Windows의 자동화 Chrome, 화면 크기 변경, 합성 IME 이벤트다. **실제 iPad Safari/Galaxy Chrome의 화면 키보드·한글 IME·회전 검수는 하지 않았다.** 실제 키보드 열림·닫힘과 조합 확정/Enter는 기기에서 별도로 확인해야 한다.
- 기존 브라우저 검사는 전체 실행에서 UI 대기 시간 초과가 있었으므로 자동화의 실행 안정성은 별도 한계로 남긴다. 단독 재검증 통과를 실기기 검수나 항상 안정적인 전체 실행의 증거로 대신하지 않는다.
- 이번 빌드와 PR #1은 운영 미반영 상태다. 승인 범위는 커밋·푸시·PR 업데이트까지이며, 병합·운영 배포는 별도 승인이 필요하다.
- 배포 승인 후에는 실제 운영 URL의 새 프로필에서 긴 글 1→2구간의 표시·판정 일치를 다시 확인해야 한다. 이번 운영 검사는 수정 전 오류 재현이다.
