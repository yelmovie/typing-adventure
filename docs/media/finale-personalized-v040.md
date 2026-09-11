# 선택 모험가 완주 연출 — 2026-09-12

인증서 앞 축하 화면에서 선택한 캐릭터와 펫을 주인공으로 함께 표시한다. 닉네임은 제목에 그대로 쓰고, 그 아래에는 선택한 캐릭터의 이름과 펫 이름을 별도로 표시한다. 예를 들어 별명이 ‘별빛친구’인 지호·토끼 조합이면 제목은 ‘별빛친구, 해냈어요!’, 등장인물 표기는 ‘지호 & 토끼’다. 한글과 영어 화면 각각에 맞춘 문구를 제공한다.

기존 8초 `finale-v1.mp4`는 오른쪽 액자에서 유지하며 ‘하늘과 고양이가 보내는 축하 영상’이라는 제목을 붙였다. 이 영상 속 주인공을 사용자가 선택한 모험가로 오인하지 않게 역할을 명시한다. 별도 영상 생성·영상 변경·외부 업로드·크레딧 사용은 하지 않았다. 기존 영상의 생성 기록·권리 확인 상태는 `finale-v1.md`와 `assets/CREDITS.md`를 따른다.

## 기존 이미지 재사용

- 캐릭터 4명: `public/assets/sprites/char_*_home.json/.webp`의 `idle_front` 프레임.
- 펫 4종: `public/assets/sprites/pet_*_home.json/.webp`의 `cheer` 프레임.
- DOM에서 아틀라스의 지정 영역만 표시한다. 새로운 래스터 이미지를 만들거나 원본 프레임을 변형하지 않는다.
- 캐릭터에는 짧고 완만한 축하 동작을 두 번만 적용한다. 일시정지 시 멈추고, 동작 줄이기 설정에서는 정지 상태를 유지한다.
- 아틀라스 요청·디코딩 실패 시 동일 캐릭터·펫의 기존 초상화를 유지한다. 닫힌 화면에 늦게 도착한 이미지를 붙이지 않도록 AbortSignal을 확인한다.

## 보존한 영상 동작

실제 8초 영상, 직접 재생, 일시정지·재개, 인증서 바로 보기, Escape, 두 버튼 간 Tab 순환, 배경 inert, 닫기 후 영상 자원 해제를 유지한다. 자동 재생 차단은 직접 재생으로 복구하고, 요청 실패 또는 15초 이상 대기는 인증서로 넘어간다. 동작 줄이기에서는 사용자가 재생하기 전 MP4 요청을 하지 않는다.

레이아웃은 4개 화면 크기에서 실제 표시 기준 본문 20px, 버튼·등장인물 26px, 제목 30px, 터치 영역 48px를 목표로 구성했다. 검증 기록은 아래에 실제 실행 결과로 추가한다.

## 구현 검증

2026-09-12 소스 서버 5181, 실제 Chrome의 격리된 저장소에서 검사했다. 사용자 브라우저와 실제 저장 기록에는 접근하지 않았다.

- `scripts/check-finale-cast.mjs`: **128/128 PASS**. KO/EN × 캐릭터 4명 × 펫 4종 × 915×412, 1024×768, 1280×800, 1920×1080. 같은 팝업을 열린 채 화면 크기도 바꿨다.
- 24자 한국어 별명과 긴 영어 별명 보존, 캐릭터와 펫의 atlas 식별자, 고정 영상의 설명, 영상 자동 요청 없음(reduced motion), 모든 보이는 문구의 실제 폰트 최소 크기, 텍스트 잘림, 패널/본문 넘침, 캐릭터와 영상 겹침, 48px 버튼과 hit-test, 닫은 뒤 저장 데이터 불변을 확인했다.
- 지호·토끼의 915 화면과 보라·토끼의 1920 화면을 직접 검토했다. 안경·의상·펫이 올바르고 배경의 불필요한 색 잔여가 없다.
- 영상 lifecycle 소스 검사: pause/resume/Tab/Escape와 자원 해제, 다른 모달·화면 전환의 지연 이벤트 무시, 마지막 스테이지 결과→영상→인증서 **3개 PASS**.
- 기존 OpeningPlayer가 공유하는 `.finale-player`에 새 그리드가 적용되지 않도록 `:not(.opening-player)`로 한정했다. 인트로의 전체 화면 영상 크기 및 `object-fit: contain`을 검사에 추가했다. 글자 크기 기준만 공유한다.

증거:

- `tmp/finale-cast-personalized-final/results.json`
- `tmp/finale-cast-personalized-final/ko-glasses_boy-rabbit-915.png`
- `tmp/finale-cast-personalized-final/ko-pink_girl-rabbit-1920.png`
- `tmp/finale-pause-isolated/results.json`
- `tmp/finale-source-transitions-final/results.json`

개발 서버와 같은 Chrome 프로세스를 여러 케이스가 재사용하던 검사에서 미디어 대기·스크린샷 timeout이 발생했다. 케이스별 Chrome 프로세스를 새로 여는 방식으로 검사 간 자원을 분리했으며, 같은 pause/전환 케이스는 정상 통과했다. 실제 배포 빌드의 나머지 영상·인트로 회귀 결과는 완료 후 아래에 기록한다.

Opening 소스 회귀 **6/6 PASS** (`tmp/opening-personalized-isolated-final/results.json`). 실제 8초 자동 재생·종료, pause/resume/skip, 튜토리얼 왕복 후 강제 재상영 없음과 다시보기, 915×412 동작 줄이기, 자동 재생 거부 후 건너뛰기, 요청 실패 후 홈·연습 접근, 영어 문구·Tab 순환을 확인했다. 영상 프레임이 전체 플레이어 영역을 유지하고 `contain`으로 표시되는 것도 각 진입에서 확인했다. 915 화면 캡처를 직접 검토했다.

## 통합 배포 빌드 확인

- 대상: `http://127.0.0.1:4180/`, `tmp/release-v040-final`, 제공된 manifest version `1bb5c1ef84256433`.
- Finale production **8/8 PASS**, 종료 코드 0 (`tmp/finale-production-v040-final/results.json`). 실제 1920×1080/8초 무음 영상, pause/resume/Tab/Escape, 1024 동작 줄이기·직접 재생, 자동 재생 거부 복구, MP4 요청 실패, 15초 대기 만료, 아틀라스 요청 실패 시 같은 캐릭터·펫 초상화 표시를 확인했다.
- 위 production8과 소스 모듈 접근이 필요한 전환2를 합쳐 서로 다른 lifecycle 시나리오 **10개 PASS**다. 소스에서 먼저 수행한 pause 단독 검사는 중복 합산하지 않는다.
- deliberate request-failure 주입이 service worker cache에 가로막히지 않게 미디어 검사 context는 `serviceWorkers: 'block'`을 썼다. 실제 PWA·오프라인 검증은 프로젝트의 별도 오프라인 감사 결과를 따른다.
- 배포 화면 `tmp/finale-production-v040-final/finale-desktop.png`를 직접 검토했다. 선택 캐릭터·펫과 실제 재생 중인 축하 영상이 분리되고 배경 및 문구가 올바르게 표시된다.

Opening 통합 production **6/6 PASS**, 종료 코드 0 (`tmp/opening-production-v040-final/results.json`). 소스에서 검증한 여섯 흐름을 4180 배포 빌드에서도 모두 재확인했다. 제품 미디어 파일은 128조합 통과 이후 동결한 상태이며, 이후 변경은 검사 하네스와 이 문서뿐이다.

최종 묶음은 캐스트 128 상태, 서로 다른 Finale lifecycle 10 시나리오(소스 전환2 + production8), Opening production6 시나리오다. 테스트 브라우저는 모두 닫았다. 공개 도메인의 OG 절대주소와 외부 공유 미리보기만 배포 담당자의 최종 URL 확정 단계에 남는다. 기존 Suno/Higgsfield 사용권 확인 대기 상태는 변경하지 않았다.
