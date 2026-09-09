# 타이핑 어드벤처 — 작업 계획서 (2026-09-09 갱신)

> "이어서 작업"이라고 하면 이 문서를 읽고 **9-3. 남은 겹침**부터 진행한다.
> (2~8장은 설계·완료 기록. 지금 손대야 할 건 9-3 세 항목 + 3차 이미지 5장 대기)

## 1. 현재 상태 (MVP 완료)

- 스택: Vite + TypeScript + Phaser 3.90 + DOM 오버레이, 저장은 localStorage(`typing_adventure_save_v1`)만. 백엔드·로그인·학급기록 금지.
- 실행: `npm install` → `npm run dev` (포트 5180) / 빌드 `npm run build` / 에셋 변환 `npm run assets`
- 개발용 바로가기(저장 데이터 있을 때만): `?go=battle&stage=stage_1`, `?go=worldmap`, `?go=intro&stage=stage_3`, `?st=1`(숨김 탭에서 RAF 멈춤 대응), 콘솔 `window.__game`
- 동작 확인됨: 홈 → 모험 준비(이름·캐릭터4·난이도3·펫4) → 지도(5노드 잠금/해금/별) → 소개 → 전투 → 결과(별·기록·배지) → 해금 → 새로고침 후 이어하기. 설정·도감·인증서 모달.
- 한글 IME: 실제 input, compositionstart/update/end 처리, compositionend 이후 NFC 비교, 조합 중 오답 판정 없음(시뮬레이션 검증). 낱말 모드 Enter/Space, 문장 모드 Enter, 일치 시 자동 제출.
- 타수 정의(전체 공통): 정답 확정 글자의 키 입력 수(학교=5타)/경과 분 → "타/분". 정확도 = 정답타수/(정답+오답타수).
- 피해 배율: 스테이지 몬스터 총HP ÷ (목표 낱말 수 × 10), 최소 1 (보스전 6배).
- v2 공통 시스템(2-1 ①~⑤)은 구현됨. 스테이지 5개는 이름·아이콘·mode만 바뀌었고 플레이는 아직 전부 웨이브 전투 → 4장 2단계부터 모드별로 갈아엎는다.

### 파일 지도
- 데이터: `src/game/data/content.json`(낱말·문장), `stages.ts`(밸런스·지도 좌표), `enemies.ts`, `characters.ts`, `badges.ts`
- 로직: `src/game/systems/{TypingRun(공통 코어),BattleSystem(웨이브 규칙),TypingSystem(IME),TypingStats,ScoreSystem,SaveSystem,AudioManager}.ts`
- 연출: `src/game/scenes/*`, `src/game/entities/{Player,Enemy,Pet}.ts`
- DOM: `src/game/ui/screens/*`, `HudController.ts`, `KeyboardGuide.ts`, `ModalController.ts`
- 스타일: `src/styles/{design-tokens,components,animations,responsive,screens}.css`
- 에셋 변환: `scripts/build-assets.mjs` (원본 `assets/` 수정 금지 → `public/assets/`)
- 캐릭터/펫/몬스터 시트는 전부 5×6 그리드(행0 idle 5종, 행1~4 정면/후면/좌/우 걷기4+달리기, 행5 공격2·피격·대시·승리)

### 사용자 규칙
- 말투: 친근한 반말. 산출물 UI 문구는 존댓말/문서 규칙 따름.
- 인수인계 루틴: 방학 제외 거의 매일 오후 4시 30분쯤 "이어서 하게 저장해줘" → 이 문서(docs/PLAN.md) 갱신 + 메모리 + NotebookLM 저장. 집의 다른 PC에서 "이어서 작업"이라 하면 이 문서부터 읽고 질문 없이 6장 첫 항목부터 진행.
- **부엉이·올빼미 이미지 절대 금지** (캐릭터 제안·프롬프트 포함).
- 이미지 재생성 필요하면 프롬프트를 따로 정리해서 요청, 그전엔 있는 것으로 구성.
- 사소한 확인 질문 없이 설계 문서대로 진행. 계획 요청 시엔 실행하지 말고 계획만.

## 2. v2 설계 — 스테이지 5개, 겉모습 완전히 다르게

| 스테이지 | 핵심 플레이 | 타이핑 | 체감 |
|---|---|---|---|
| 1 푸른 숲 | 웨이브 몬스터 전투 | 짧은 단어 | 타격감 |
| 2 네온 시티 | 추격 레이스 | 짧은 단어 연속 | 속도감 |
| 3 사막 유적 | 편지 복원·황금문 개방 | 문장·장문 | 탐험/퍼즐 |
| 4 폭주 열차 | 긴급 전보 | 문장 + 시간 압박 | 긴장감 |
| 5 어둠의 성채 | 최종 보스 3페이즈 | 종합 | 클라이맥스 |

### 2-1. 공통 시스템
1. **음절 타격 판정**: compositionend마다 확정 음절이 목표 접두어와 맞으면 약공격(피해1·이펙트), 단어 완성 시 강공격. 틀린 음절 확정 → 그 글자 빨갛게 흔들림, 백스페이스로 고치면 콤보 유지·PERFECT 불가, Enter로 틀린 채 제출해야 MISS.
2. **콤보→FEVER**: 5(피해+20%) / 10 POWER(발광, ×1.5) / 20 FEVER 8초(모드별 특수효과, 배경 밝아짐, BGM 템포업, 오타 1회 용서) / 30 FINAL FEVER(보스). 3초 무입력 시 게이지 서서히 감소.
3. **변화구 단어 12%**: 금색 보물(코인+점수), 하트 회복(HP/시간), 빨간 폭탄(5초 제한, 실패 시 콤보만 초기화). content.json에 태그로.
4. **펫 스킬**: 고양이(오답1회 방어 / 방어막5초), 토끼(폭탄 +2초 / 시간·거리 +5), 드래곤(강공격 +10% / 화염 광역), 다람쥐(다음 키 크게 표시 / 다음 단어 힌트). 액티브는 FEVER 진입 시 자동.
5. **몰래 적응형 난이도**: 최근 10단어 정확도 <80% → 난이도 -1, ≥97%+빠름 → +1. UI 비노출.
6. **어제의 나(고스트)**: 최고 기록의 단어별 완료 시각 저장 → 레이스·전보·보스에 고스트 표시. 나와의 비교만.

### 2-2. 스테이지 로직 (초안 수치)
- **S1 푸른 숲**: 20마리 = 4웨이브×5. 몬스터가 오른쪽에서 접근, 닿으면 HP-10 후 밀림. 슬라임 2음절/박쥐 3음절, 등장 간격 6→3초. FEVER=화면 전부 처치. 20마리째에 숲의 문 열림. 별3: 정확도95 + 100초 이내 또는 15콤보.
- **S2 네온 시티**: 1000m, 자동 5m/s. 속도=기본+최근3단어 타수 보정, 단어 완성 BOOST 1초, 오타 2초 -30%. 추격자 4.5m/s, 30초마다 +0.3. 잡히면 HP-20·추격자 밀려남, 3회 실패. 10단어 무오타 TURBO 5초. 트랙 `YOU ──●── GOAL` + 고스트. 별3: 도착+무피격+고스트 추월.
- **S3 사막 유적**: 편지 6문장, 2문장=자물쇠1(총3). 어절 룬 점등, 오타 확정 시 룬 균열(고치면 복구). 시간제한 없음, 5초 정지 시 모래시계로 점수만 감소. PERFECT 문장 2개 → 비밀방(펫 해금 조각). 마지막 글자에 황금문 개방. 별3: 개방+정확도95+PERFECT2.
- **S4 폭주 열차**: 280m, 초당 2m 감소(체감 140초). 전송률=완료 어절/전체. 문장 완료→브레이크 1단(-25%). 오타→1.5초 통신 끊김(노이즈, 전송률 정지). 20콤보 BOOST 전송 2배, 30 FEVER 급감속. 거리 0 전 미완→급정지 실패 연출. 전보 3문장 15어절, 표준 난이도 정확도 90% 아이가 딱 성공하게 튜닝.
- **S5 어둠의 성채**: P1 결정 5개(HP=음절 수, 결정마다 갑옷 1조각) → P2 러시 60초(3초마다 큐 최대4, 가득 차면 어둠 게이지→HP, 30콤보 FINAL FEVER로 소멸) → P3 문장 2개(어절 룬, 갑옷 전파괴→코어→마지막 Enter 0.5초 정지→PERFECT TYPE→빛 폭발→밝은 성→월드맵 점등). 반격: 30초마다 암흑 폭탄 단어.
- 2026-09-08 저녁 사용자 재확인 추가 사항: S1 HUD에 '개인 최고 타수' 표시, S1 튜토리얼 겸용(설명 최소). S3 10자 무오타 → 룬 발광, 정확도 98% 이상 → 비밀 보상. S5 P3는 보스 HP 30%에서 시작, 최종 문장 예시 '우리는 작은 한 글자부터 새로운 길을 만들었다. / 포기하지 않고 계속 나아가면 더 넓은 세상이 열린다.'
- **직업 연출(판정 동일)**: 하늘=전사(검격/강베기/대검), 보라=마법사(룬/마법탄/마법진), 지호=학자(책장/봉인/글자폭풍), 루카=궁수(화살/연사/화살비).

### 2-3. 진행·보상·실패
- 캐릭터 1명·펫 2마리 잠금 → 별·배지·비밀방으로 해금. 보물 단어·별로 코인 → 칭호·홈 장식(상점 없음).
- 오늘의 도전: 날짜 시드 20단어, 개인 기록만, 인증서 반영.
- 실패해도 진행 저장, 같은 스테이지 3회 실패 시 도움 모드(시간+30%, 추격자 느리게) 제안.
- 사운드: BGM 8곡 + 효과음 15종 파일명·프롬프트는 `docs/AUDIO-PROMPTS.md`. 외부 음원 임의 다운로드 금지, 파일 생기면 `public/assets/audio/`에 그 이름 그대로(코드 수정 불필요). 스테이지별 BGM 키는 `AudioManager.STAGE_BGM`.

## 3. 필요한 이미지 (사용자가 ChatGPT로 생성)

필수: ①네온 시티 배경(가로, 스크롤용) ②사막 유적 황금문 배경 ③폭주 열차 배경 ④검은 그림자 추격자 5×6 시트 ⑤단어 결정 5×4 시트
권장: ⑥직업 이펙트 5×4 시트 4장 ⑦밝아진 성채 배경
불필요: 몬스터 추가, UI 아이콘/버튼(CSS), 판정 텍스트(CSS), 로고(CSS 대체 중)
배경 → `assets/background`, 시트 → `assets/character`. 프롬프트 전문은 `docs/ASSET-PROMPTS.md`.

## 4. 구현 순서
1. 공통 시스템(음절 판정·FEVER·변화구·펫 스킬) + 스테이지 이름/테마 교체
2. S1 푸른 숲 리뉴얼(웨이브 20마리, 접근 게이지, FEVER 광역)
3. S2 레이스(새 씬, 고스트 저장)
4. S3 편지 복원
5. S4 폭주 열차
6. S5 보스 3페이즈 + 엔딩
7. 직업 연출 → 메타(해금·오늘의 도전·도움 모드) → 사운드
구조: 모드별 씬 + DOM 화면을 분리(전투 씬 하나에 분기하지 않기). BattleSystem은 "TypingRun" 공통 코어(판정·콤보·타수) + 모드별 규칙 클래스로 나눔.

## 5. 결정 사항 로그
- 2026-09-08: MVP 완료. 보스 HP 안 줄던 문제 → 피해 배율 자동화로 해결. 부엉이 금지. v2 설계 확정(위 2장). 스테이지 4 몬스터(촛불·가고일) 프롬프트는 폐기(열차 스테이지엔 몬스터 없음).

## 6. 다음 할 일 (이어서 작업 시작점)
- [x] 4장 1단계 완료 (2026-09-08 저녁): 공통 코어 `src/game/systems/TypingRun.ts` + `BattleSystem`은 그 위의 웨이브 규칙. 음절 약공격(낱말당 기본 피해의 40% 상한), 콤보 5/10 POWER/20 FEVER 8초/30 FINAL(보스), 3초 무입력 콤보 감소, 변화구 12%(보물·하트·폭탄, content.json 태그로 강제 가능), 펫 패시브·액티브(FEVER 진입 시 자동), 몰래 적응형(`pickAdjusted`), 스테이지 이름·아이콘·mode 교체. 몬스터 HP 40% 상향, 피해 배율 = 총HP/(낱말수×10×2). 셀프체크 `npm run check`. 개발용 `window.__battle`.
- [x] 타이틀 로고(`assets/ui/logo-typing-adventure.png`)·아이콘 시트 20종(`ui-icon-sheet.png`) 적용 완료. `node scripts/build-assets.mjs ui` → `public/assets/ui/`. 홈 로고 이미지, 지도·HUD·결과 화면 이모지 → `icon()` 픽셀 아이콘. `assets/ui`의 나머지 ChatGPT 혼합 UI 시트 18장은 미사용(잘라 쓰기엔 불규칙).
- [x] 효과음 15종 자체 합성 적용(`npm run sfx`, WebAudio 버퍼 재생, 콤보 피치). BGM 8곡 Suno 제작 완료 → `public/assets/bgm/` (경로 주의: audio 아님). 트랙별 음량 보정 `BGM_GAIN`, 결과 화면은 루프 없음. 화면별 BGM: 홈·준비=home, 지도=map, 소개·전투=스테이지곡, 결과=result(실패 시 map).
- [ ] v2 스테이지 이미지(네온시티·사막·열차 배경, 추격자·결정 시트, 직업 이펙트, 밝은 성채)는 아직 없음 → 들어오면 `npm run assets` + `asset-map.mjs` 등록. 프롬프트 `docs/ASSET-PROMPTS.md`.
- [x] 4장 2단계 완료 (2026-09-08 밤): S1 푸른 숲 = `systems/WaveSystem.ts`(규칙) + `scenes/WaveScene.ts`(연출). 20마리(웨이브 4×5, 슬라임 2음절/박쥐 3음절, 등장 간격 4→2.2초, 화면 최대 4마리, 이동 14/10초), 머리 위 낱말, 음절마다 타격·완성 시 처치, 닿으면 HP-10 후 x=0.25로 밀림, 오타는 콤보만, FEVER 진입·드래곤 화염 = 전멸, 20마리째 숲의 문 연출 → 클리어. HUD '몬스터 n/20' + 개인 최고 타수. `Game.navigate`가 stage.mode로 Phaser 씬 선택(DOM은 공통 BattleScreen, 규칙은 `TypingMode` 인터페이스). 셀프체크 `scripts/check-wave.ts`. content.json stage_1에 3음절 낱말 12개 추가. 목표 없을 땐 콤보 무입력 감소 안 함.
- [x] 4장 3단계 완료 (2026-09-08 밤): S2 네온 시티 = `systems/RaceSystem.ts` + `scenes/RaceScene.ts`. 1000m, 기본 4m/s(추격자 4.5 → 가만히 있으면 잡힘), 낱말 완성 BOOST +4(1초), 최근 3낱말 타수로 지속 가속(최대 +3), 오타 2초 30% 감속, 10연속 무오타 TURBO ×1.5 5초, FEVER ×1.6 + 추격자 100m 밀림, 잡히면 HP-20·80m 밀림·3회 실패. 고스트 = `save.records.ghosts[stage]` 1초 간격 거리 샘플, 더 빠를 때만 갱신, 결과 화면에 추월 여부. HUD에 트랙 바(YOU/👻/추격자). 배경은 호수 이미지 tileSprite 스크롤, 추격자는 잉크 슬라임 어둡게 틴트 → 네온 시티 배경·그림자 시트 오면 `stages.ts bgBattle`·`enemies.ts`만 교체. content.json stage_2 도시 낱말 16개 추가. 셀프체크 `scripts/check-race.ts`.
- 이미지 주문서 캔버스: https://claude.ai/code/artifact/77a529d9-2b61-434e-957e-ee1f6526f5de (프롬프트 복사·완료 체크). 새로 필요한 이미지는 여기에 추가.
- [x] 4장 4단계 완료 (2026-09-08 밤): S3 사막 유적 = `systems/LetterSystem.ts` + `scenes/LetterScene.ts`. content.json stage_3에 태그 `편지` 문장 6개(탐험가 편지). 2문장=자물쇠 1(총 3, UI 아이콘 lock→unlock), 어절 룬 점등/균열/복구, 10자 무오타 룬 발광, 5초 무입력 모래시계(점수 초당 -5), PERFECT 2문장 → 비밀방 코인 +30, 정확도 98% → 코인 +20, 6문장 → 황금문 개방. 시간제한 없음(HUD '걸린 시간'), 몬스터 패널 숨김. 양피지·문·룬은 Phaser 그래픽으로 그림 → 사막 배경 이미지 오면 `bgBattle`만 교체. 셀프체크 `scripts/check-letter.ts`. 펫 해금 조각은 메타 단계(4장 7)에서.
- [x] 4장 5단계 완료 (2026-09-08 밤): S4 폭주 열차 = `systems/TelegramSystem.ts` + `scenes/TrainScene.ts`. 280m, 초당 2m(기초는 /1.35), 전보 3문장 14어절(content.json 태그 `전보`), 전송률 = 완료 어절/전체, 문장 완료 → 브레이크 1단(속도 ×0.75), 오타 확정·오답 제출 → 1.5초 통신 끊김(판정 정지, 노이즈), 10콤보 POWER 전송률 +5%, FEVER(20) 속도 절반, 토끼 액티브 +20m, 3문장 → 비상 정지·클리어(남은 거리 ×10점), 거리 0 → 급정지 실패. HUD 전보 패널(거리·속도·전송률·브레이크 ●●●). 씬은 선로·갑판·전신기·다가오는 끊긴 다리 전부 코드 그래픽 → 열차 배경 오면 `bgBattle`만 교체. 셀프체크 `scripts/check-telegram.ts`. 플랜의 '20콤보 BOOST/30콤보 FEVER'는 공통 코어 문턱(10 POWER/20 FEVER)에 맞춰 조정.
- [x] 4장 6단계 완료 (2026-09-08 밤): S5 어둠의 성채 = `systems/BossSystem.ts` + `scenes/BossScene.ts`. P1 결정 5개(태그 `결정`: 빛·용기·희망·미래·도전, 음절마다 균열, 완성 시 폭발) → 보호막 해제. P2 러시: 3초(×timeMul)마다 낱말 큐(태그 `러시` 15개, 최대 4), 낱말당 보스 피해 5×배율, 큐 넘치면 어둠 +0.34·HP-10, 30초마다 암흑 폭탄 낱말(시간 초과 시 어둠 +0.2), FINAL FEVER(30콤보) 진입 시 큐 소멸 +20 피해, 드래곤 화염 +10, 보스 HP 30 → P3. P3: 문장(태그 `최종`) 1 → 갑옷 파괴(HP 15), 문장 2 → 코어 → BOSS_FINAL(0.5초 정지 → PERFECT TYPE → 백색 폭발 → 배경 밝게·보스 소멸·반짝이) → 4.2초 뒤 결과. 결과 배너 '세상에 글자를 되찾았다', 5스테이지 전부 클리어 시 월드맵 제목 '빛을 되찾은 세상' + 노드 점등. 밝은 성 배경 이미지 오면 BossScene onFinal 의 setTint 대신 이미지 교체. 셀프체크 `scripts/check-boss.ts`. 'P1 결정마다 갑옷 1조각'은 P3 갑옷 파괴와 겹쳐 P1은 보호막 해제로 단순화.
- [x] 4장 7단계 일부 완료 (2026-09-08 밤):
  - 직업 연출 `scenes/ClassFx.ts` (코드 그래픽, 이펙트 시트 오면 교체): 전사 검격 호/대검/검광 파동, 마법사 룬·마법진·광역, 학자 책장·봉인 도장(봉/완)·글자 폭풍, 궁수 화살·연사·관통·화살비. Wave·Battle·Boss 씬에서 weak/strong/perfect/fever 호출.
  - 배지 15종(`data/badges.ts`): 스테이지별 영웅, FEVER(20콤보), 어제의 나 추월, 별빛 필사가(편지 PERFECT 4), 침착한 통신사(열차 별3), 엔딩.
  - 잠금/해금: 루카 = 별 6개, 드래곤 = fever_master 배지, 다람쥐 = letter_perfect 배지 (`characters.ts unlock`, `unlockMet`). 새 세이브 기본은 캐릭터 3·펫 2. 해금은 `finalizeAndSave`에서, 결과 화면에 "새로 합류". 셋업 카드 잠금 표시.
  - 도움 모드: `progress.fails[stage]` 3 이상이면 소개 화면에 토글 → `progress.assist[stage]` → 그 스테이지는 기초 난이도 규칙.
- [x] 오늘의 도전 완료 (2026-09-08 밤): `systems/DailySystem.ts`(날짜 시드 mulberry32로 전체 낱말 풀에서 20개) + `scenes/DailyScene.ts`(도서관 배경, 적 없음). 홈 메뉴 '📅 오늘의 도전' → `navigate('battle',{stageId:'daily'})`, `DAILY_STAGE`(index 0, 지도 제외). 기록은 `records.daily[YYYY-MM-DD]`에 타수 기준 최고만, 진행도·배지·해금 영향 없음. 결과 화면 '오늘 최고 기록 갱신', 인증서에 오늘 기록 줄.
- [x] 코인 사용처 완료 (2026-09-08 밤, 상점 없음): `data/titles.ts` 칭호 6단계(0/30/80/150/300/500코인)·홈 장식 4종(50/150/300/500)이 코인 총합 문턱으로 자동 개방. 홈 카드에 칭호·코인·다음 칭호까지, HUD 레벨 옆 칭호, 인증서에 칭호, 결과 화면 '획득: 칭호/장식', 도감 '🏷 칭호·장식' 탭 + 친구들 탭 잠금 표시.
- [x] v2 이미지 적용 (2026-09-08 밤): 네온 시티·황금문·열차·밝은 성 배경, 그림자 추격자 시트(`mon_shadow_chaser`, S2 적), 결정 시트(`fx_crystals` 5×4 격자 아틀라스, BossScene 결정 프레임 r0 온전/r1 균열/r2 산산/r3 빛). `node scripts/build-assets.mjs v2` = 새 것만 변환. `GRIDS` 로 격자 시트 일반화.
- [x] 반응형 (2026-09-08 밤): `Game.setupUiScale` 이 visualViewport 기준(소프트 키보드 올라오면 남은 영역에 맞춤) + 배율 0.62 미만이면 `#ui-stage.compact` 로 잔글씨·키보드 가이드 키 확대. 세로 안내는 1100px 이하 세로 화면. 홈 카드 아이콘 크기 버그 수정.
- [x] 숲의 문(`fx_gate` 1×3: 닫힘/반쯤/활짝, WaveScene 오른쪽 x=1700, 20마리째 프레임 전환+빛기둥)·열차 소품(`fx_train_props` 2×3: 전신기 대기/누름, 계기판 비움/빨강, 레버 올림/내림, TrainScene 갑판) 적용 (2026-09-08 밤).
- [x] 직업 이펙트 시트 4장 적용 (2026-09-08 밤): `fx_warrior/mage/scholar/archer` 5×4 격자 아틀라스, `ClassFx.playSheetFx` 가 시트 있으면 5프레임 애니(r0 약/r1 강/r2 PERFECT/r3 FEVER, 궁수는 플레이어→목표 이동), 없으면 코드 그래픽 폴백. 캔버스 1차(1~9번) 전부 완료.
- [x] 설정 규격 (2026-09-08 밤): BGM·효과음 볼륨 막대(`settings.bgmVolume/sfxVolume`), 학생·교사 가이드 모달, 프롤로그(새 모험 시작 시 1회 + 다시보기)·엔딩 다시보기(보스 클리어 후 해금), 정보·크레딧 모달(제작·제공·교육 내용 출처·AI 고지·저작권·개인정보 문구, `data/about.ts` — **author 표기명 확인 필요**), README.md.
- [ ] 캔버스 2차(선택): 배지 아이콘 15종, 홈 장식·변화구·펫 스킬 아이콘 시트, 지도 노드 아이콘 5종, 프롤로그·엔딩 삽화 2장. 오면 이모지 자리 교체.
- [x] `final-check` 1~2단계 완료 (2026-09-08 밤): `docs/reviews/FINAL-CHECK-20260908.md` — 152/242(63%), **배포 보류**(S4 통신 끊김 중 문장 소실 FAIL, 셋업 패널 버튼 잘림 FAIL). 개선안 승인 대기.
- [x] final-check 3~4단계 완료 (2026-09-08 심야): 216/242(89%), **조건부 배포 가능**. 조건: about.ts author 표기, CREDITS Suno 라이선스, 실기기 IME·BGM 확인. 2차 이미지 5장 적용(배지·아이템·지도 핀 개별 webp DOM_SHEETS, 삽화 2장). 파일 정리(_unused/), GitHub yelmovie/typing-adventure main 푸시.
- [x] 피드백 라운드 2 (2026-09-09 새벽): 오답은 반복 없이 다음으로(전 모드), 판정 팝업 겹침 해결(`--stack`), 펫 액티브 = 10콤보마다 + PET_PASSIVE 연출, 캐릭터 살아있는 idle(`setLively`)·jab/hop/dash/sad, 4초 무입력 시 HP 초당 -2(`idleDrain`, IDLE_DRAIN 이벤트), content.json 세계관 문장/이중모음 재생성(129개, 보스 P3 3문장), S1 템포 상향(간격 2.2→1.1, 최대 6마리).
- [x] 점프·아이템·소탕 (2026-09-09 새벽): **점프** = Tab 키 또는 입력창 옆 `⏭ 점프` 버튼, 판마다 3번(`RULES.skipsPerStage`, `TypingRun.skip()`), 정확도 영향 없이 콤보만 0, 각 모드의 `skip()` 이 오답 경로처럼 다음 목표로. **S1 아이템** = 처치 시 35% 드롭(🪙30/💎80/⭐150, `WAVE.drops`, ITEM_DROP 이벤트, 캐릭터에게 날아가 +점수). **5콤보 소탕** = S1에서 5콤보마다 화면의 적 전멸(`WAVE.sweepEvery`, WAVE_SWEEP → 플래시·문구). **걷는 화면** = WaveScene 배경 tileSprite 2겹 스크롤 + `Player.walking`(동작 후 idle 대신 걷기 복귀). 셀프체크 check-wave 7번.
- [ ] 지도 수정(디자인 에이전트 끝난 뒤 직접): 점선 경로를 캐릭터 뒤로, 비네트+발밑 글로우, 노드 라벨 대비. 배경 v2 프롬프트 #14 는 캔버스에.
- [ ] 다음: 실기기 피드백 → 밸런스. 남은 개선: 인라인 style 12곳, 폴드 터치, 캐릭터·펫 시트 선택분만 로딩, 제작기·기능향상기 md(education-content-studio).
- [ ] 이미지 들어오면: 네온 시티·사막·열차 배경, 그림자 추격자·결정 시트, 밝은 성, 직업 이펙트 4장 → `npm run assets` + asset-map 등록 + 각 씬의 코드 그래픽 교체.
- [ ] 이후 4장 3~7 순서대로
- 미정: 펫 액티브 중 '거리 +5'(토끼)·'화염 광역'(드래곤)은 지금 단일 몬스터 25% 피해로 임시 — 모드별 씬에서 다시 정의.

## 7. 재미 3/10 → 11점 계획 (2026-09-09, 사용자 요청)

사용자 평가: "재미 3/10". 원인 진단: 캐릭터를 **조작할 수 없고**, 위험(HP)과 보상(아이템)의 **루프가 약하고**, 화면이 정적이며, UI 가 캐릭터·글자를 가린다.

| # | 항목 | 무엇을 | 담당 |
|---|---|---|---|
| 1 | 조작감 | 방향키 ←→ 전진/후진, ↑ 점프, ↓ 앉기. S1: 슬라임은 점프로 뛰어넘고 박쥐는 앉아서 피하면 **회피** (피해 0, +점수, DODGE 연출). 다른 모드도 이동·점프는 연출로 | 코어 |
| 2 | 위험·보상 루프 | HP 감소: 접촉 -10, 무입력 초당 -2, 오답 제출 -3. 회복: ❤ 하트 +20, 10콤보마다 +5, PERFECT +2, 클리어 시 전부. 아이템 6종(🪙30점·💎80점+코인·⭐150점·❤HP·🛡 다음 접촉 무효·⚡ 3초 적 느려짐) S1 드롭 + 전 모드 변화구로 등장 | 코어 |
| 3 | 단계별 폭발 | 5콤보 소탕(완료) → 10콤보 펫 스킬 → 20 FEVER. 각 단계 화면 연출·문구가 확실히 다르게 | 코어 |
| 4 | 웨이브 보스 | S1 마지막 웨이브에 큰 슬라임(4음절, HP 2배, 느림) + 웨이브마다 배경 색 온도 변화(낮→노을) | 코어 |
| 5 | 걷는 화면 | S1 배경 스크롤 + 걷기 애니(완료). 나머지 모드는 기존 스크롤 유지 | 완료 |
| 6 | 오늘의 도전 선택 | 단어 / 문장 / 긴 글(≈500자) 를 사용자가 고름 | 코어+UI |
| 7 | 도감 | 낱말 탭 제거, 나머지(배지·칭호·장식·아이템·몬스터)를 4×4 격자로, 이미지 없으면 CSS 아이콘 | UI |
| 8 | UX 정리 | 모든 화면 우상단 홈·소리(BGM/효과음 슬라이더)·설정 버튼, 키보드 가이드는 기본 숨김 → 켜면 화면 중앙, 입력란 맨 아랫줄, 셋업 이름 입력 제거, 글자·팝업·캐릭터 겹침 0 | UI |

에이전트 2개 병렬: **코어**(`src/game/systems/**`, `entities/**`, `scenes/**`, `EventBus.ts`, `Game.ts`, `types.ts`, `data/content.json`, `scripts/check-*.ts`) / **UI**(`src/game/ui/**`, `src/styles/**`, `data/*.ts`(content.json 제외), `index.html`). 공유 훅은 미리 넣음: `TypingSystem.onMove` → `BattleScreen` → `TypingMode.move?(dir, pressed)`.

## 8. 다음에 이어서 할 일 (2026-09-09 아침 중단 지점)

> "이어서 해" 라고 하면 **여기부터**. 현재 `npx tsc --noEmit` 통과, `npm run check` 7/7 통과, 커밋 완료(작업 중 체크포인트). 푸시는 아직 안 함.

### 끝난 것
- 점프(Tab / ⏭ 버튼, 판당 3회), S1 걷는 배경 스크롤, 아이템 드롭, 5콤보 소탕 — §6 참고.
- 코어: 방향키 조작(`Player.jump/crouch/nudge`, `WaveSystem.move()`, `DODGE` 이벤트 → WaveScene 회피 연출), HP 규칙(`RULES.wrongHp/comboHealEvery/comboHealHp/perfectHealHp`), 아이템 6종(coin·gem·star·heart·shield·bolt, `WAVE.drops`), S1 마지막 웨이브 대장 슬라임(`WAVE.bossHpMul/bossScaleMul/bossSpeedMul`), 오늘의 도전 kind(`DailySystem(…, kind)` + `navigate('battle',{stageId:'daily',dailyKind})`), `scripts/check-daily.ts`.
- UI: 공통 상단바 `src/game/ui/TopBar.ts`(홈·소리 팝오버·설정) → 홈·지도·소개·결과·셋업에 적용, 셋업 이름 입력 제거, 도감 탭 재구성(몬스터·배지·친구들·아이템·칭호), `src/game/data/items.ts`, 키보드 가이드 토글(`settings.showKeyboardGuide`, 중앙 오버레이).

### 8장 진행 결과 (2026-09-09 오전, 두 번째 중단)
- [x] 1 전투 상단바 — HUD 에 이미 홈·소리·설정 다 있었음. 홈은 `homeMenu()` 로 "정말 나갈까요?" 확인 후 이동. 추가 작업 없음.
- [x] 2 입력란 맨 아랫줄 — `.bb-main` 의 마지막 행이 `.bb-input-wrap`(입력창 + Enter 아이콘 + 점프 버튼). 이미 충족.
- [x] 3 도감 — 4열 격자(`.coll-grid`), 낱말 탭 없음, 탭 = 몬스터(17종)·배지(16)·친구들·아이템(6)·칭호·장식. 아이템 아이콘을 실제 이미지로 연결(`items.ts` 의 `img`: icon_coin·item_star·item_heart·item_shield·icon_bolt), 보석만 CSS 아이콘(`.ci-gem` 마름모 그라데이션).
- [x] 5 지도 — 점선 길을 DOM SVG → **Phaser Graphics(depth 1)** 로 옮겨 캐릭터(depth 10) 뒤로. 가장자리 비네트, 발밑 빛무리(맥동) 추가, 노드 라벨 text-shadow·테두리 강화. `WorldMapScreen` 의 SVG 생성 코드 제거.
- [x] 키보드 가이드 기본값 off (`SaveSystem` 새 세이브 `showKeyboardGuide: false`) — 켤 때만 화면 중앙 오버레이.
- [x] 홈·결과 화면의 중복 '홈으로' 버튼 제거(`commonTopBar({ hideHome: true })`).

### 남은 것 (다음에 이어서)
1. ~~겹침 최종 확인 나머지 화면~~ → 9장 참고 (완료)
2. ~~플레이 검증~~ → 9장 참고 (완료)
3. ~~무입력 HP 감소 밸런스~~ → 9장 참고 (완료)
4. ~~`npm run build`~~ (통과) → 커밋 → 푸시

### 사용자가 만들어 오기로 한 이미지 (주문서 3차)
https://claude.ai/code/artifact/77a529d9-2b61-434e-957e-ee1f6526f5de — 14 지도 배경 v2 / 15 대장 슬라임 시트 / 16 캐릭터 점프·앉기 프레임 4명 / 17 아이템 6종 아이콘 / 18 회피·획득 이펙트. 들어오면 `assets/background`·`assets/character` 에 넣고 "이미지 넣었어" → `npm run assets` + `scripts/asset-map.mjs` 등록.

### 남은 사용자 확인 사항 (기존)
`data/about.ts` 저자 표기명, CREDITS 의 Suno 라이선스 문구, 실기기(태블릿) IME·BGM 확인.

## 9. 2026-09-09 오후 작업 — 겹침 점검·플레이 검증·밸런스

8장 "남은 것" 1~4 를 전부 처리했다. 확인 방법은 **브라우저에서 실제로 띄우고 `getBoundingClientRect` 를 디자인 좌표(1920×1080)로 환산해 측정**. 데스크톱(1600×900, 배율 0.833)과 태블릿(1280×800, 배율 0.667 → `compact`) 두 조건 모두.

### 9-1. 고친 것

| 문제 | 원인 | 수정 |
|---|---|---|
| **S2·S4·S5 에서 펫 스킬 줄이 가려짐** | `.battle-left`(130~345)와 모드 패널(`.race-track`/`.tele-panel`/보스 HP, top:292)이 절대좌표라 53px 겹침. compact 는 64px | 좌측을 `.battle-left-col`(absolute, flex column, gap 12) 한 열로 묶고 각 패널을 `position: relative` 로. `BattleScreen` 이 보스전에서만 적 HP 패널을 이 열에 넣는다 |
| **하단 입력 패널이 830 선을 26~52px 침범** | `min-height:226` 보다 실제 콘텐츠가 커서 무시됨(낱말 모드 252, compact 288) | `.bb-target` line-height 1.2→1 · min-height 78→64, `.bb-input` 패딩 6→2, `.bb-hint` 22→18. compact 는 `min-height` 240→226, `.bb-hint` 24px+line-height 1, `#ui-stage.compact .bb-target-lbl .bb-kbd-toggle{min-height:52px}`(뒤에 오는 `.btn-sm` 76px 에 먹히던 걸 특이도로 되살림). **결과: 데스크톱·compact·낱말·문장 모두 top 830 정확히** |
| **S3 편지에서 판정 팝업이 본문을 덮음** | 한 문장 정답에 PERFECT·자물쇠·비밀방이 동시에 떠 78px씩 3단으로 쌓임 | `.screen.mode-letter .judge-pop { bottom: var(--judge-bottom) }` + `BattleScreen.judge()` 가 편지 모드에서만 큐(700ms 간격)로 하나씩. `onHide` 에서 타이머·큐 정리 |
| **compact 에서 좌측 패널이 양피지를 침범** | compact `.battle-left` 폭 340 → 오른쪽 끝 370 vs 양피지 왼쪽 360 | `LetterScene` `PAPER.x` 800→840 (폭 유지, 양피지 400~1280). 문장 시작 x 가 PAPER 기준이라 폭을 줄이면 긴 문장이 삐져나가므로 **폭이 아니라 위치**를 옮김 |
| **결과 화면 해금 토스트가 STAGE CLEAR 배너와 겹침** | `.toast` 가 top:40 + left:50% 라 배너(y 46~153, x 674~1246)와 같은 자리 | `.toast.toast-side`(left:24, transform:none) + 전용 키프레임 `ta-toast-side`. `ResultScreen` 이 이 클래스를 붙임. 측정: 토스트 x 24~251 / 배너 x 789~1131 → 겹침 0 |
| **S4 전신기 송신 링이 엉뚱한 데서 터짐** | 링 좌표 (840, 715)가 코드 그래픽 폴백 시절 값. 실제 전신기 아트 본체는 x664~862·y565~689 | 시트가 있으면 (763, DECK_Y-150) 로, 없으면 기존 좌표 유지 |
| **무입력 HP 감소가 가혹함** | 4초부터 초당 -2 → 54초면 사망. 실제로 화면만 보다 죽었음 | `RULES.drainAfterSec` 4→8, `drainHpPerSec` 2→1 (가만히 두면 108초). **S3 는 아예 제거** — 설계상 "시간제한 없음, 5초 정지 시 모래시계로 점수만 감소"인데 HP까지 깎고 있었다(설계 위반) |
| **↑ 를 누르고 있으면 슬라임 무적** | `WaveSystem.jumping = pressed` 라 키를 떼기 전까지 회피 판정 유지. 캐릭터는 420ms 뒤 착지하는데 판정만 살아 있음 | `WAVE.jumpSec = 0.42`(Player.jump 와 동일), 한 번 누를 때 그 시간만 유효(`upHeld` 로 키 리피트 무시), `tick` 에서 감소. 실측: 11초 홀드 → 회피 0·접촉 3(고치기 전엔 회피 3·접촉 0) |

### 9-2. 플레이 검증 결과 (S1 실제 플레이)

| 항목 | 결과 |
|---|---|
| 방향키 4종 | ← → nudge / ↑ `jumping:true` / ↓ `crouching:true` 전부 발생 |
| 점프 회피 | 슬라임 3회 회피, 피해 0, +90점(30×3) |
| 아이템 드롭 | 9처치 중 3드롭(coin·coin·gem) ≈ 33% — `dropChance 0.35` 와 일치 |
| 5콤보 소탕 | `WAVE_SWEEP {combo:5, count:2}` 발생 |
| 콤보 회복 | 7회 |
| 접촉 피해 | 6회 × -10 |
| 대장 슬라임 | 20번째에 등장. 이름 '대장 슬라임', 4음절 '호랑나비', HP 8(=4×2), speed 0.0611(일반 0.111보다 느림) |
| S1 완주 | 20/20 처치 → STAGE CLEAR, HP 100, 6,990점, 20콤보 FEVER |

`npx tsc --noEmit` 통과 · `npm run check` 7/7 통과 · `npm run build` 통과.

### 9-3. 남은 겹침 (확정됐지만 아직 안 고친 것)

7개 화면을 각각 감사하고 지적마다 반박 담당 2명을 붙여 검증한 결과 **35건 중 17건 확정**. 위 표로 처리한 것을 빼면 아래가 남았다.

1. **compact 에서 좌측 열이 캐릭터를 살짝 가림** (S4·S5). compact 는 펫 스킬 줄이 2줄이 되어(`white-space: normal`) `.battle-left` 가 264px 로 커지고, 그 아래 전보 패널/보스 HP 패널까지 쌓이면 열 하단이 573(S4)·524(S5) 까지 내려온다. 캐릭터 아트 상단이 503~515 라 왼쪽 어깨·머리 옆 38×58px 정도가 패널에 덮인다. 데스크톱은 5px 여유로 아슬아슬.
   - 검증자 결론: `white-space: normal` 을 지우면 24px 로 커진 펫 스킬 문구가 잘리고, `.td-row.small` 을 18px 로 줄이면 compact 의 "잔글씨 실효 16px 이상" 규칙을 깬다. **보스 HP 패널을 좌측 열에서 빼는 배치 변경**이 정공법 — 레이아웃 결정이 필요해서 남겨둠.
2. **결과 화면 배너가 화면 밖으로 잘림** — `.result-wrap` 이 세로 가운데 정렬인데 패널 높이가 콘텐츠에 따라 784~1039px 로 변한다. 배지가 많으면(6개+칭호) 배너(패널 위 58px + 높이 107px)의 위쪽이 y<0 으로 넘어간다. 배지 줄을 자르는 안·`max-height` 안은 검증자가 둘 다 틀렸다고 판정(칩 하나가 212~280px 라 4개로 잘라도 2줄, `.result-panel` 에 `overflow` 지정이 없어 높이만 줄고 자식은 넘침). **패널을 위 정렬로 바꾸거나 배지 영역만 스크롤**하는 쪽으로 다시 설계 필요.
3. **S1 클리어 순간 판정 팝업 4개가 겹침** — FEVER·펫 스킬·20콤보 소탕·STAGE CLEAR 가 같은 프레임에 떠서 스택 띠를 넘어 서로 얹힌다. 편지 모드에 넣은 큐를 웨이브에도 적용할지, 축하 연출이니 그대로 둘지 결정 필요.

기각된 18건(고칠 필요 없음으로 판정): 셋업 캐릭터·펫이 760 선보다 아래인 것(오른쪽 미리보기 영역이라 의도됨), 결과 화면 캐릭터 좌표, 열차 갑판·선로·스파크가 하단 패널 뒤로 흐르는 것(의도된 배경 블리드), 전신기 라벨·계기판이 캐릭터에 가리는 것(depth 연출), 레이스 고스트 클램프(프레임 밖 퇴장이 의도), 보스 P2 큐 낱말 vs 콤보 박스, 상단바 2px 초과 등.

### 9-4. 이번에 확인한 실패

- **NotebookLM MCP 서버는 더 이상 못 쓴다 (원인 확정)** — `ask_question` 이 항상 `"Could not find NotebookLM chat input"` 으로 실패한다. `get_health` 가 `authenticated: false` 라 처음엔 쿠키 만료로 봤지만, Chrome 전체 종료 → `cleanup_data(preserve_library:true)` → `setup_auth` 를 다 해도 브라우저 창조차 안 뜨고 즉시 실패했다.
  진짜 원인: **NotebookLM 이 `notebook.google.com` 의 "Gemini Notebook" 으로 개편**되면서 서버가 찾는 옛 주소·옛 입력창 선택자가 안 맞는다. 인증 문제가 아니다.
  **우회(확인됨):** `mcp__claude-in-chrome__*` 로 사용자의 실제 Chrome에서 노트북을 열면 이미 로그인돼 있어 그대로 질문할 수 있다 → https://notebooklm.google.com/notebook/3fe83052-fcdd-4d5d-945a-6c21904c23df
  **덧붙여:** 그렇게 직접 물어본 결과 이 노트북에는 **타이핑 어드벤처 관련 기록이 없다**("기록 없음"). 즉 인수인계는 지금까지도 사실상 이 문서(`docs/PLAN.md`)가 해 왔다. 글로벌 `~/.claude/CLAUDE.md` 의 Memory routing 절에도 같은 내용을 적어뒀다.

## 10. 3차 이미지 5장 적용 (2026-09-09 오후)

사용자가 만들어 온 5장을 전부 반영했다. 원본은 `assets/`, 가공본은 `npm run assets` → `public/assets/`.

| 파일 | 규격 검사 | 등록 | 연결 |
|---|---|---|---|
| `assets/background/adventure-map-v2.png` | 1664×936, 알파 없음(배경이라 정상) | `BACKGROUNDS bg_world_map` 교체 | 지도 핀 좌표 조정: S2 (720,690)→(530,610) 네온시티 성 아래, S3 (880,430)→(980,620) 황금문 옆. ①④⑤는 그대로 맞음 |
| `assets/character/boss-slime-sheet-v2.png` | 1145×1374, 알파 O, 5×6 30프레임 | `SHEETS mon_boss_slime` | `WAVE BOSS_SHEET`, `WaveSystem.spawn` 이 대장에만 이 시트. `WaveScene` 은 시트 없으면 초록 슬라임 1.8배 폴백. 전용 시트일 땐 배율 1.25·틴트 없음 |
| `assets/character/character-action-poses-v2.png` | 1254×1254, 알파 O, 4×4 | `GRIDS char_poses` (행=캐릭터4, 열=준비·공중·앉기·착지) | **아직 연결 안 함** — `Player.jump/crouch` 는 여전히 트윈. 다음 작업 |
| `assets/character/item-game-icons-v2.png` | 2172×362, 알파 O, 6×1 | `GRIDS fx_items` + `DOM_SHEETS drop_*` | `WaveScene.onDrop` 이모지 → 스프라이트(72px). `data/items.ts` 도감 아이콘도 `drop_*` 로 통일(보석 CSS 아이콘 제거) |
| `assets/character/fx-dodge-pickup-heal-v2.png` | 1086×1448, 알파 O, 5×3 | `GRIDS fx_pickup` | `WaveScene.playFx(row,x,y)` 신설 → 회피(r0)·획득(r1)·회복(r2). ADD 블렌드라 크로마 잔여 어두운 테두리가 안 보인다 |

- 프리로드: `StageIntroScene.MODE_ATLAS.wave` 에 `mon_boss_slime`·`fx_items`·`fx_pickup` 추가.
- 알파 검사 결과(크로마키 제거 확인): 순수 크로마 잔류가 대장 슬라임 4.1%·이펙트 2.6%로 잡혔으나 프리뷰로 확인하니 **슬라임 몸 색·회복 이펙트 잎사귀**였다. 실제 잔여 없음. 아이템 시트는 0.000%.
- 브라우저 실측 확인: 지도 핀 5개 랜드마크 정렬, 대장 슬라임(왕관·큰 크기) 20번째 등장, 아이템 6종 렌더, 회피 이펙트 재생.

### 남은 이미지 작업
- `char_poses` 를 `Player.jump/crouch` 에 연결(행 인덱스: brown_boy 0 / pink_girl 1 / glasses_boy 2 / blond_explorer 3).
- 지도 배경이 바뀌었으니 `WorldMapScene` 의 비네트·발밑 글로우 색감 재확인.
