# 첫 화면 인트로 영상

2026-09-10 기존 생성 원본을 로컬에서 최적화하고 배포용 미디어 폴더에 복구했다. 이번 작업에서는 외부 업로드, 새 이미지·영상 생성, 크레딧 사용을 하지 않았다. 현재 작업 비용은 0크레딧이다.

## 원본과 기존 생성 이력

- 원본: `output/imagegen/prologue-video-v1/intro-wan3-8s.mp4`
- 시작·마지막 이미지: 같은 폴더의 `intro-start.png`, `intro-end.png`
- 기존 생성: Higgsfield MCP / Wan 3.0 (`wan3_0`)
- 기존 job ID: `77b1af4a-b976-49db-b746-951176c71793`
- 기존 생성 비용: **28크레딧**, 당시 잔액 120 → 92. 이는 2026-09-09 생성 이력이며 이번 복구 비용이나 현재 계정 잔액이 아니다.
- 프롬프트·생성 메타데이터: 같은 폴더의 `prompts.md`, `generation-higgsfield.json`. 원본 파일과 이력은 보존했다.
- 시작·마지막 이미지를 직접 확인했다. 파란 망토의 아이와 고양이가 있는 마을 장면이며 부엉이 캐릭터는 없다.

## 배포 파일과 최적화

| 항목 | 원본 | 배포 파일 |
| --- | --- | --- |
| 영상 | 25,299,555바이트 | `public/assets/video/intro-v1.mp4`, 3,802,629바이트 |
| 포스터 | PNG, 2,246,035바이트 | `public/assets/video/intro-poster-v1.webp`, 222,622바이트 |

영상은 **84.97%**, 포스터는 **90.09%** 줄였다. 영상은 FFmpeg 8.1.1 / libx264, CRF 23 / preset slow로 인코딩했다. 1920×1080, 30fps, 240프레임, 8.000초, H.264 High / yuv420p, 무음을 유지한다. 인코더가 기록한 H.264 level은 5.0이다. 포스터는 sharp의 WebP quality 85 / effort 6을 사용했으며 원본 크기 1672×941을 유지한다.

MP4 최상위 박스는 `ftyp → moov → free → mdat` 순서다. `moov` 시작 위치는 32바이트, `mdat`는 3,764바이트로 faststart를 확인했다.

재현 명령은 프로젝트 루트에서 실행한다. 아래 실행 파일 이름은 기존 설치 경로의 FFmpeg/ffprobe를 가리킨다.

```powershell
ffmpeg -hide_banner -n -i output/imagegen/prologue-video-v1/intro-wan3-8s.mp4 -map 0:v:0 -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -r 30 -t 8 -threads 4 -movflags +faststart public/assets/video/intro-v1.mp4
node -e "require('sharp')('output/imagegen/prologue-video-v1/intro-start.png').webp({quality:85,effort:6}).toFile('public/assets/video/intro-poster-v1.webp')"
```

## 검증 범위

- 원본과 배포 영상 각각 전체 240프레임 디코딩: 종료 코드 0, 디코더 오류 없음.
- ffprobe: 8.000초 / 1920×1080 / 30fps / H.264 / yuv420p / 오디오 스트림 0 확인.
- 원본과 배포 영상의 전체 240프레임 SSIM: **0.978618**. 이 수치는 원본 대비 압축 차이 지표이며 교육 효과나 영상 완성도의 점수가 아니다.
- 배포 영상 0초, 4초, 7.9667초 프레임과 WebP 포스터를 육안 확인했다. 아이·고양이·마을 구도와 금빛 글자가 성으로 향하는 내용이 유지된다. 표본 프레임 확인을 전체 동작 품질 검수로 간주하지 않는다.
- 원본 SHA-256은 기존 생성 메타데이터와 일치하며 최적화 후에도 같다.
- 독립 Chrome 컨텍스트에서 개발 서버의 영상 URL을 열어 HTTP 200, 1920×1080, 8초 전체 재생 후 `ended=true`, 재생 오류 없음까지 확인했다. 앱 오버레이의 진입·종료 검증과는 별도 검사다.
- 로컬 검사 증거: `tmp/intro-check/files.json`, `chrome.json`, `frame-01.png` ~ `frame-03.png` (Git 제외).
- 이 미디어 복구 작업에서는 제품 소스 수정과 빌드를 하지 않았다. 앱 내 재생 진입·종료·건너뛰기 및 최종 빌드 포함 여부는 통합 검증에서 확인한다.

## SHA-256

| 파일 | SHA-256 |
| --- | --- |
| 원본 `intro-wan3-8s.mp4` | `1f814365da3a08f775086a6b9bffd3aa3f055d7e2abcfc6f6ae560cf8a1bb0b8` |
| 원본 `intro-start.png` | `13bfbc9bfa9b986dbc264ef32a725788155aab5148ac07cee4be46c281fa5a9e` |
| 배포 `intro-v1.mp4` | `1c30856e33ae905561a53d9dd961bb22c219359d56090a42e64af946c96fa0f8` |
| 배포 `intro-poster-v1.webp` | `6b356d21f0b0b7edab01e24b8a91ceb56592869c17832cf6ec39beccfce22768` |
