# 타이핑 어드벤처 설계 패키지

버전: 1.0.0  
작성일: 2026-09-08

## 프로젝트 한 줄 설명
한글 타자 연습을 판타지 탐험과 몬스터 전투로 바꾼 초등학생용 웹게임.

## 중요 확정사항
- 백엔드 없음
- 로그인/회원가입 없음
- 우리 반 기록/친구 랭킹 없음
- 저장은 브라우저 localStorage만 사용
- PC + 태블릿 가로형 우선
- Phaser 3 + TypeScript + Vite 권장
- 한글 입력은 DOM input + 브라우저 IME 사용
- compositionstart/compositionend 처리 필수
- 문자열 비교 전 Unicode NFC 정규화

## 파일
1. `01_prd.json` — 제품 요구사항
2. `02_trd.json` — 기술 설계
3. `03_screen_flow.json` — 화면 전환 및 화면별 필수 요소
4. `04_game_balance.json` — 스테이지/별/피해량 기본 밸런스
5. `05_asset_manifest.json` — 생성한 이미지와 필요한 에셋 구조
6. `06_local_save_schema.json` — 로컬 저장 구조
7. `07_content_schema.json` — 단어/문장 콘텐츠 구조
8. `08_ui_design_system.json` — CSS 공통 디자인 시스템
9. `09_claude_code_implementation_prompt.json` — Claude Code용 구현 지시문
10. `10_acceptance_test_checklist.json` — 구현 완료 검수표
11. `project_manifest.json` — 전체 파일 목록과 구현 순서

## 권장 구현 순서
1. 프로젝트 뼈대 생성
2. localStorage 스키마
3. 한글 IME 입력 처리 테스트
4. 홈 → 월드맵 → Stage 1 → 결과까지 vertical slice 완성
5. 캐릭터/몬스터 스프라이트 연결
6. 스테이지 2~5 확장
7. 도감/배지/개인 인증서
8. 사운드/연출/접근성 점검
9. Vercel 배포

## 금지
- 서버 API를 임의로 추가하지 말 것
- Firebase/Supabase/DB를 추가하지 말 것
- 학급 랭킹 기능을 추가하지 말 것
- 한글을 직접 자모 단위로 조합하는 로직을 새로 만들지 말 것
