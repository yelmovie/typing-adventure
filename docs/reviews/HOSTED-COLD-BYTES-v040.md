# 공개 배포 첫 화면 전송량 계측 — 2026-09-12

대상: `https://typing-adventure-six.vercel.app/`, manifest `1d31f1349e892160`, 앱 `index-CPi_a_N2.js`. 제품은 수정하지 않고 `scripts/measure-opening-cold.mjs`만 보강했다. 새 Chrome 문맥 3개를 순차 사용했고 다른 검사 브라우저/빌드는 멈춘 상태였다. 1280×800, CDP 다운로드 10Mbps·업로드 2Mbps·지연 80ms 조건이다.

## 시점별 관측값

단위는 바이트다. MB 표기는 1,000,000바이트 기준이다.

| 회차 | 첫 조작 가능(ms) | 그때 CDP HTTP 수신 | 첫 영상 프레임(ms) | 그때 CDP HTTP 수신 | 건너뛰기 시점 수신 |
|---|---:|---:|---:|---:|---:|
| 1 | 3,627 | 6,859,160 | 4,576 | 7,223,012 | 7,223,012 |
| 2 | 3,014 | 1,457,639 | 4,134 | 7,222,926 | 7,222,926 |
| 3 | 2,184 | 1,457,669 | 3,323 | 7,222,872 | 7,222,872 |

첫 조작 시점은 미디어 응답이 도착하는 순간과의 순서에 따라 차이가 컸다. 첫 영상 프레임에서는 세 번 모두 약 **7.223MB**가 관측됐다. 여기에는 인트로 약 **3.805MB**와 홈 BGM 약 **1.357MB**가 들어 있다. 따라서 완료된 Resource Timing 항목만 더한 값을 첫 화면 전체 수신량으로 사용하면 진행 중으로 표시된 미디어를 놓친다. 첫 프레임의 CDP 수신량은 5MB를 넘었다고 보고할 수 있다. 첫 조작 시점의 수신량과 구분해야 한다.

이번 추가 측정의 시간이 앞선 공개 배포 측정보다 작다고 기존 결과를 폐기하지 않는다. 기존 3회 첫 영상 6.915/5.374/5.621초도 유효한 관측이며 CDN 및 실행 조건의 변동을 함께 남긴다.

## 집계와 정합성

- 페이지의 `performance.now()` 이정표를 CDP `Performance.NavigationStart`와 합쳐 Network 이벤트의 단조 시계에 맞췄다. 요청의 timestamp/wallTime 및 `performance.timeOrigin`으로 교차 확인한 차이는 +0.074/+0.117/−0.021ms였다.
- `responseReceived.encodedDataLength`의 초기 수신값과 이후 `dataReceived.encodedDataLength`를 합쳤다. 이 초기 값은 **헤더만의 크기가 아니다**. 이미 버퍼에 들어온 본문도 포함될 수 있다.
- 이정표 이전에 끝난 요청은 `loadingFinished.encodedDataLength` 총량을 사용한다. 미완료·취소 요청은 해당 시점까지 CDP에 보고된 수신값을 포함한다.
- 완료된 HTTP 요청은 회차별 59/43/43개 모두 초기 값+이후 chunk 합계와 최종 총량의 차이가 **0바이트**였다. 첫 프레임 약7.223MB는 헤더를 중복 합산해서 생긴 값이 아니다.
- `blob:`/`data:` URL은 네트워크 집계에서 제외했다. 원시 시각/chunk는 보존했고, 헤더 내용이나 응답 본문을 기록하지 않았다.

## 해석 한계

CDP의 압축 수신 카운터는 브라우저에 미리 버퍼링된 바이트를 보여줄 수 있다. CDP 속도 제한 아래 렌더러에 전달된 decoded chunk 양과 다르다. 첫 프레임의 decoded 전달량은 4,456,078 / 4,441,078 / 4,442,578바이트였다. `in-flight` 표시는 아직 `loadingFinished` 이벤트가 없다는 의미이며 실제 네트워크 본문이 아직 다 들어오지 않았다는 뜻은 아니다.

따라서 위 수치를 **실제 학교 라우터에서 10Mbps로 제한한 선로의 정확한 시점별 바이트**라고 부르지 않는다. 이는 같은 페이지 이정표에 매핑한 **CDP가 보고한 HTTP 응답 수신량**이다. 요청 헤더·TLS/IP 오버헤드·worker target의 통신은 포함하지 않는다. 세 번 모두 첫 영상 프레임까지 SW가 등록되지 않았으므로 해당 두 초기 시점에는 SW 다운로드가 빠져서 생긴 누락은 관측되지 않았다. 실제 학교망 실측은 별도다.

원시 및 집계 증거: `tmp/delivery-check/hosted-opening-cold-bytes-v040.json`. 기존 비교: `tmp/delivery-check/hosted-opening-cold-v040.json`.

```powershell
$env:DELIVERY_TEST_URL='https://typing-adventure-six.vercel.app/'
$env:DELIVERY_DIST='dist'
$env:OPENING_TIMING_OUT='tmp/delivery-check/hosted-opening-cold-bytes-v040.json'
node scripts/measure-opening-cold.mjs
```

기본 도구 환경에서 외부 네트워크 접근이 차단된 첫 시도는 사이트에 도달하지 못해 측정에 포함하지 않았다. 허용된 외부 접근으로 수행한 위 3회는 종료 코드 0이며 브라우저를 닫았다.
