# 한글 공격·캐릭터·펫 동작 이미지 — 2026-09-10

사용자 요청으로 내장 `image_gen`에서 기존 캐릭터·펫 초상화를 참조해 생성했다. 영상 생성 서비스 호출이나 외부 파일 업로드는 수행하지 않았다.

| 원본 | 사용처 | 프레임 |
|---|---|---:|
| `assets/character/character-attack-ko-v1.png` | 한국어 4캐릭터 타이핑 공격, 가·나·다 키 타일 | 16 |
| `assets/character/character-walk-v1.png` | 한국어·영어 4캐릭터 좌우 걷기/달리기 | 16 |
| `assets/character/pet-walk-v1.png` | 고양이·토끼·용·다람쥐 동행 | 16 |

원본은 편집하지 않고 `npm run assets:motion`으로 각 시트를 320px 셀의4×4 WebP 아틀라스와 JSON으로 패킹한다. 결과는 `public/assets/sprites/char_attack_ko_v1.*`, `char_walk_v1.*`, `pet_walk_v1.*`이다. 영문 모드의 기존 영문 공격 이미지는 유지한다. 앞/뒤 걷기와 기타 포즈는 기존 시트를 사용한다.

최초 투명 요청 결과는 실제 알파가 아닌 체크무늬 배경이었다. 같은 그림을 단색 마젠타 배경으로 다시 생성하고, 에셋 패킹에서 지정 크로마 배경을 제거했다. 새 시트의 접지·회수 동작과 실제 화면을 검사하며, 셀 경계를 침범한 그림은 여백 보정본으로 교체한다. 패킹은 각 셀의8px 안전 여백이 없으면 실패한다. 발 원점·기준 몸 높이 메타데이터를 넣어 기존 idle과 크기를 맞추고, 펫 스킬/응원 뒤에도 달리기를 이어 간다.

프롬프트는 `motion-v2-prompts.json`, `motion-v2-walk-correction.txt`, `motion-v2-gutter-correction.txt`에 보존한다. 캐릭터·펫 정체성 참조는 `public/assets/portraits/`의 기존8개 이미지다. 생성 이미지의 새 생명체·로고·외부 IP는 추가하지 않았다.

이미지 출처 기록과 게임 재생 검증은 구분한다. 스프라이트 프레임·언어 전환·접지·효과 종료 검사는 `../delivery/MOTION-QA-20260910.md`에, 보스 전투 실제 입력 결과는 관련 리뷰에 기록한다.
