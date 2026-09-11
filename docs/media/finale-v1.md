# 인증서 앞 완주 영상

- 파일: `public/assets/video/finale-v1.mp4`
- 대기 이미지: `public/assets/video/finale-poster-v1.webp`
- 생성: Higgsfield Wan 3.0, 시작·마지막 이미지 지정, 1편
- 형식: 8초, 1920×1080, 30fps, H.264/yuv420p, 무음
- 내용: 하늘과 고양이가 황금 별을 들어 올리며 완주를 축하한다.
- 비용: 28크레딧, 생성 전 92 → 생성 후 64
- 생성 프롬프트·입력·해시·원본 정보: `output/imagegen/finale-video-v1/generation-higgsfield.json`

## 진입과 종료

마지막 스테이지 완주 결과의 `완주 영상 · 인증서` 버튼에서 영상을 재생한다.
`stage_5`를 완료한 저장 데이터라면 홈의 `인증서` 버튼에서도 같은 흐름을 사용한다.
아직 완주하지 않았으면 기존 오늘의 인증서를 바로 표시한다.

영상은 끝나면 인증서로 넘어간다. 일시정지·이어서 재생·바로 인증서 보기와 Escape를 지원한다.
동작 줄이기 설정에서는 대기 이미지로 시작하며, 사용자가 직접 재생할 수 있다.
자동 재생 차단 시 직접 재생을 안내한다. 파일 오류 또는 15초간 재생 준비/버퍼링이 이어지면 인증서를 표시한다.
다른 모달이나 화면으로 이동하면 영상과 이벤트를 해제하며, 늦게 도착한 영상 종료 이벤트는 무시한다.
홈 초기 로딩에서는 MP4를 요청하지 않는다.

## 검증

- `npm run build`: 통과, 배포 빌드에 영상과 대기 이미지 포함 확인.
- `npm run check:finale`: 9개 브라우저 시나리오 통과.
- 이번 환경에서는 설치된 Chrome을 사용했다: PowerShell에서 `$env:FINALE_BROWSER_CHANNEL='chrome'; npm run check:finale`.
- 실제 8초 재생 종료, 키보드/버튼, 태블릿, 재생 차단/실패/대기, 모달 교체/화면 이동, 완주 결과 진입을 검증한다.
- 생성 당시 원격 결과와 로컬 원본의 해시 일치. 웹 파일은 아래 최적화로 원본과 해시가 다르다.
- 브라우저 스크린샷과 테스트 결과: `tmp/finale-check/` (Git 제외).

## 파일 용량

2026-09-10 기존 생성 원본을 로컬 FFmpeg/libx264로 압축했다. 원본 35,860,060바이트는 `output/imagegen/finale-video-v1/finale-wan3-8s.mp4`에 보존한다.
웹 파일은 약 6.1MB로 약 83% 줄였으며 moov를 mdat 앞에 배치한 faststart 형식이다. 1920×1080·30fps·8초·무음을 유지한다.
원본과 240프레임 전체를 비교한 SSIM은 0.978633이다. 초기 하드웨어 인코더 시도보다 화질이 좋은 libx264 CRF 23 / slow 결과를 최종 선택했다.
포스터는 PNG 원본을 보존하고 WebP를 사용한다. 원본 PNG와 미사용 OG 샘플은 생성된 dist에서 제외한다.

재현 명령: `ffmpeg -i finale-wan3-8s.mp4 -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart finale-v1.mp4`.

외부 업로드·추가 영상 생성·크레딧 사용은 없다. 실제 파일 크기·faststart·오프라인 재생은 `node scripts/check-delivery.mjs`로 확인한다. 사이트 배포는 실행하지 않았다.
