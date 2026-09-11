# 납품·운영 인수 안내

## 2026-09-11 팝업·캐릭터 이름·공격 언어 수정 — 현재 미리보기

현재 4176은 **`dist-preview-20260911-character-sync/`**를 제공한다. 모험 준비와 결과판을 내용에 맞춰 줄이고, 전체 팝업을 반투명 소재와 짧은 페이지로 정리했다. 캐릭터를 바꾼 뒤 예전 기본 이름이 남던 문제, 한국어 공격 자료 누락 시 영어 키 그림으로 대체되던 경로, 영어 지호에게 한글 마법 그림이 나오던 경로를 수정했다. 개인 별명과 모험 기록은 보존된다.

```powershell
npm run preview -- --outDir dist-preview-20260911-character-sync --host 127.0.0.1 --port 4176 --strictPort
```

주소: `http://127.0.0.1:4176/?v=0.3.3-character-sync`. manifest **`60fd41175bd2dd15`**, 429자산·53,089,062B, 앱 **`index-Df9KLQou.js`**·**`index-C4Sl2HQL.css`**. 타입 검사·게임 로직 검사·빌드 통과. 모든 manifest 파일의 크기·SHA 및 실제 제공 manifest 일치를 확인했고, production 한영 3단계 실제 완료→결과 탭→지도 2/2도 통과했다.

기존 브라우저에서는 새 주소의 첫 방문에도 이전 서비스 워커의 앱 파일이 표시되는 것을 확인했다. 한 번 더 새로고침한 뒤 위 최신 JS가 실제 DOM에 연결됐음을 확인했다. 저장소 삭제나 기록 초기화는 필요하지 않다. `dist-preview-20260911-popup-fit/`은 이름·공격 수정 전 중간 빌드이므로 최종 전달에 사용하지 않는다.

검증 세부: [통합 검증](../reviews/POPUP-CHARACTER-INTEGRATION-20260911.md), [팝업](../reviews/POPUP-FIT-QA-20260911.md), [이름](../reviews/CHARACTER-IDENTITY-20260911.md), [공격 언어](../reviews/ATTACK-LOCALE-20260911.md).

## 2026-09-11 앞선 결과 화면 비율 수정

앞선 산출물은 **`dist-preview-20260911-result-fit/`**이다. 결과판을 오른쪽으로 옮기고 왼쪽에 캐릭터·펫을 배치했다. 결과·성장·보상 탭과 고정 높이 상세 페이지로 결과 화면의 세로 스크롤을 제거했다. 캐릭터 보행과 기록 안내의 앞선 수정도 포함한다. 최신판은 위 내용 맞춤 높이와 이름·언어 수정까지 포함한다.

```powershell
npm run preview -- --outDir dist-preview-20260911-result-fit --host 127.0.0.1 --port 4176 --strictPort
```

미리보기 주소: `http://127.0.0.1:4176/?v=0.3.3-result-fit`. 앱 버전0.3.3, manifest `e0e3f589378daa60`, 429자산·53,063,626B, 앱 `index-DBSm0bOb.js`·`index-BUscVBLY.css`. 전체 manifest SHA/크기 검증 및 실제 제공 manifest 일치 확인. 소스24/24 화면 검사, production 한영 실제3단계완료→결과탭→지도2/2, 최종완주→영상·인증서1/1 통과. [결과 화면 검증](../reviews/RESULT-FIT-QA-20260911.md).

## 2026-09-11 캐릭터 보행·기록 안내 최종 미리보기

앞선 보행 수정 산출물은 **`dist-preview-20260911-walk-v2-final/`**이다. 네 캐릭터의 보행 32장·대기 4장과 연속 재생 로직, 지호의 옆모습 안경, 쉬운 기록 삭제 안내를 포함한다. 앱 버전은 0.3.3이며 manifest `9398de451eb9db33`, 429자산·53,054,526B, `index-CM8KBxgB.js`·`index-UWIqdSIR.css`가 최종 파일이다. 중간 `dist-preview-20260911-walk-v2/`는 최종 프레임 시간 수정 전이므로 사용하지 않는다.

```powershell
npm run preview -- --outDir dist-preview-20260911-walk-v2-final --host 127.0.0.1 --port 4176 --strictPort
```

검증: 타입 검사·게임 로직 검사·빌드 통과. 엔티티 96/96, 네 캐릭터 실제 1·2단계 8/8, 최종 production 지호 1단계·루카 2단계 2/2, 한영 기록 안내 production 2/2 통과. 최종 manifest의 모든 자산 크기·SHA를 검사하고 실제 제공 manifest와 일치함을 확인했다. 저장 기록을 지우지 않고 새 주소 `http://127.0.0.1:4176/?v=0.3.3-walk-v2`에서 확인한다. [보행 검수](../reviews/WALK-V2-20260911.md), [기록 안내 검수](../reviews/RESTART-COPY-20260911.md), [원본·프롬프트](../media/CHARACTER-WALK-V2-PROMPTS.md).

## 앞선 2026-09-11 대화창 수정 이력

이전 **`dist-preview-20260911/`**은 인증서·모험 도감 높이/스크롤 및 로컬 자료 실패 안내를 보완했다. 당시 manifest는`de6cfafa42a6871e`,427자산·52,407,580B이며 `index-DP-IdI8_.js`·`index-UWIqdSIR.css`를 사용한다. [수정 범위·검증](../reviews/DIALOG-RECOVERY-20260911.md)을 확인한다. 아래2026-09-10 검사 기록은 당시 산출물의 이력이며 새 전체 게임 검증으로 재표기하지 않는다.

```powershell
npm run preview -- --outDir dist-preview-20260911 --host 127.0.0.1 --port 4176 --strictPort
```

PC나 개발 세션을 종료해 로컬 서버가 멈추면 이 명령을 다시 실행한다. localhost 자료 실패는 인터넷 회선 장애와 같지 않으며, 저장 기록을 삭제할 필요가 없다.

## 재현 가능한 배포

2026-09-10 현재 **v0.3.3** 로컬 최종 산출물은 **dist-v033/**이다. Windows에서 이전 dist의 일부 파일 정리가 거부되어 새 출력 경로로 빌드했다. 소스의 기본 출력은 dist이며 `--outDir`을 지정하면 자산 목록·해시·정리도 그 실제 출력 폴더를 따른다. 현재 4176 미리보기는 다음 명령으로 실행 중이다. 미리보기는 별도 터미널에서 유지하고 검사는 다른 터미널에서 실행한다.

```powershell
npm run build -- --outDir dist-v033
npm run preview -- --outDir dist-v033 --host 127.0.0.1 --port 4176 --strictPort
$env:DELIVERY_DIST='dist-v033'
$env:DELIVERY_OUT='tmp/delivery-v033-map-final'
$env:DELIVERY_SKIP_PERF='1'
node scripts/check-delivery-map-update.mjs
```

현재 버전을 전달할 때는 **dist-v033/**의 내용 전체를 사용한다. 배포 자산은 **426개·52,252,570B**, manifest 버전은 `f83c3b3d29a23e12`, 서비스워커 자료 캐시는 `typing-classroom-mtuiopu9`다. 앱 파일은 `index-KYq6l0ws.js`와 `index-D6zjn_Fr.css`다. 위 전체 자료 용량은 첫 방문 전송량이 아니다.

아래 기본 절차를 깨끗한 인수 환경에서 실행하면 기본 dist/가 생성된다.

1. 전달받은 소스와 package-lock.json을 함께 보관하고 `npm ci`를 실행한다.
2. `npm run check`, `npm run build`를 실행한다. 소스용 영상 회귀는 별도 터미널에서 `npm run dev`를 켠 뒤 `npm run check:finale`로 실행한다. Chrome을 쓰는 Windows에서는 `FINALE_BROWSER_CHANNEL=chrome` 환경 변수를 지정한다.
3. `npm run preview -- --host 127.0.0.1 --port 4176` 실행 후 `DELIVERY_DIST=dist`, 별도 `DELIVERY_OUT`, `DELIVERY_SKIP_PERF=1`을 지정하고 `node scripts/check-delivery.mjs`로 자산 해시·완주 영상·수업 준비·오프라인 지역 진입과 S3/S5 완주를 확인한다. 출력 경로를 변경했다면 preview와 DELIVERY_DIST를 같은 폴더로 맞춘다. PowerShell 환경 변수는 위 `$env:` 형식으로 설정한다.
4. 정적 호스팅에는 **dist/**만 배포한다. 원본 assets/, output/, tmp/, 생성 프롬프트·도구 출력·개발 자료는 사이트 공개 폴더가 아니다. Vercel에는 .vercelignore가 이 경계를 적용한다.
5. 실제 주소에서 첫 방문, HTTPS, 재방문, 한국어 IME, 태블릿, 영상, 수업 준비를 다시 확인한다. 로컬 preview 측정은 실제 배포 검증을 대신하지 않는다.

홈은 기존 스프라이트에서 실제 사용하는 대기·응원 포즈(모험가 2개, 친구 3개)를 추출한 별도 `_home` atlas를 사용한다. 전체 전투 시트는 다음 화면에 들어갈 때 받는다. 홈 atlas는 `node scripts/build-home-assets.mjs`로 다시 만들며, 원본 시트는 바꾸지 않고 포즈 크기·위치·보이는 RGBA 픽셀을 검증한다.

공유 이미지의 og:image/twitter:image는 현재 상대 경로다. 업체의 최종 도메인이 정해지면 절대 주소와 canonical/og:url을 지정하고 실제 공유 미리보기를 확인한다. 정해지지 않은 도메인을 임의 기입하지 않는다.

## 교실 사용 전

- 물리 키보드를 연결하고 브라우저를 가로 화면으로 연다.
- 온라인 상태에서 설정의 수업 자료 준비를 실행한다. 표시되는 전체 용량을 확보한다.
- 완료 개수와 준비 완료 상태를 확인한다. 처음 설치한 브라우저는 한 번 새로고침한다.
- 인터넷을 끊고 새 지역과 완주 영상까지 확인한다. 앱 업데이트 후 준비 상태를 다시 검사한다.
- 한 학생의 기록을 다른 학생에게 이어 주지 않도록 공용 기기의 브라우저 프로필 또는 운영 절차를 분리한다.

## 장애 대응

자료가 없거나 로딩에 실패하면 현재 화면을 유지하고 재시도를 안내한다. 오프라인 준비에서 중단된 파일은 다음 시도에 누락분을 이어 받는다.
브라우저 저장소가 차거나 차단되면 기록이 저장되지 않을 수 있다. 앱의 저장 상태 안내를 확인하고 다른 기기나 브라우저로 옮길 때 기존 기록이 자동 이전되지 않음을 안내한다.
서비스워커 캐시에는 배포 버전별 자산을 저장한다. localStorage의 학습 기록과 CacheStorage의 수업 자료는 별개다. 브라우저 전체 데이터 삭제는 두 가지를 모두 지울 수 있다.

## 미디어·권리 확인

폰트의 공식 OFL 원문은 배포의 licenses/에 포함된다. 생성 이미지·영상·음악 출처는 assets/CREDITS.md와 docs/media를 참조한다.
Suno 생성 당시의 유료 플랜/상업 이용 증빙과 영상 서비스의 납품 범위 확인은 담당자가 제공해야 한다. 파일이 재생된다는 이유로 법적 사용권이 검증된 것으로 보지 않는다.

## 검증 범위와 남은 현장 검증

자동 검사는 실제 Chrome의 격리된 새 저장소로 수행하며 학생 정보는 사용하지 않는다. 이전 버전 결과는 별도 폴더에 보존한다.

| 검사 완료 시점 | 산출물 | 직접 확인한 결과 |
|---|---|---|
| 2026-09-10 04:51 KST | `dist-release-v033-final/` · manifest `6fa2166cbdee11ad` | [전체 기능14/14](../../tmp/delivery-v033-final/results.json): 자료 준비/복구, 오프라인5지역 진입, S3/S5 실제 완주·저장, 새 atlas 캐시, 영상/인증서 |
| 2026-09-10 04:56 KST | **최종 `dist-v033/`** · manifest `f83c3b3d29a23e12` | [지도 후속4/4](../../tmp/delivery-v033-map-final/map-update-results.json): 최종426 SHA·전체 준비/검증, 새 JS/CSS의 offline 응답, 지도4/5 실제 왕복과 핀 전체 높이·클릭 |

마지막 변경은 지도 CSS와 완료 표제의 `journey.complete` 기준 통일이다. 해당 영향을 후속 검사로 확인했으며, 최종 폴더에서 전체14건을 다시 실행한 것으로 표현하지 않는다. 검사 이력과 남은 NT는 [품질 근거 감사](../reviews/QUALITY-EVIDENCE-20260910.md)를 따른다.

초기 성능은 기능 검사 브라우저를 닫은 뒤 별도로 측정했다. 최종 빌드의 [cold3회 기록](../../tmp/delivery-v033-map-final/opening-cold.json)은 10Mbps·지연80ms·1280×800 조건에서 첫 영상 프레임 **3.384/2.672/2.600초**(중앙값2.672초)다. **첫 1회가 3초 목표를 넘어 WARNING**을 남겼고 추가 반복으로 제외하지 않았다. 건너뛰기 클릭 후 홈은15/11/10ms, 완료된 요청의 전송량은 매회1,402,724B였다. 전송 중·중단된 미디어는 이 완료 전송량에 포함되지 않을 수 있다. 실제 배포 호스트·실기기·P95 검증은 별도이며 [최종 통합 보고서](../reviews/QUALITY-UPGRADE-v033.md)를 함께 확인한다.
학습효과, 장시간 교실 Wi-Fi 부하, 실제 태블릿 키보드/IME, 전자칠판 뒷자리 시인성, 업체 도메인의 공유 카드·캐시 업데이트는 각각 현장 확인이 필요하다. 수행하지 않은 검증을 만점 근거로 사용하지 않는다.
