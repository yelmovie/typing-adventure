import type { StageId } from '../types';

/**
 * 스테이지 소개 화면에서 캐릭터·펫·몬스터가 한 마디씩 하는 대사.
 * 문구만 고치면 되도록 데이터로 분리했다. 학생에게 보이는 문장이므로 해요체 또는 캐릭터 말투.
 */
export interface IntroLine {
  /** 'player' | 'pet' | 몬스터 id */
  who: string;
  text: string;
}

/**
 * 캐릭터가 스테이지마다 하는 말. 같은 상황이라도 넷이 다르게 말한다.
 *  하늘  빨간 목도리의 씩씩한 모험가 — 짧고 힘차게, 먼저 뛰어든다
 *  보라  분홍 후드의 명랑한 탐험가 — 밝고 들뜬 말투, 신나 한다
 *  지호  안경 쓴 똑똑한 책벌레 — 먼저 살펴보고 침착하게 말한다
 *  루카  고글을 쓴 용감한 탐험대장 — 이끄는 말투, 대원을 챙긴다
 */
const PLAYER_LINES: Record<string, Record<StageId, string>> = {
  brown_boy: {
    stage_1: '좋아, 손가락 풀고 간다!',
    stage_2: '멈추면 잡혀. 끝까지 달린다!',
    stage_3: '모래에 묻힌 편지, 내가 파낸다!',
    stage_4: '열차가 폭주 중이야. 내가 막는다!',
    stage_5: '여기가 마지막이다. 덤벼!',
    daily: '오늘도 한 판! 기록 갈아치운다!',
  },
  pink_girl: {
    stage_1: '와, 슬라임이다! 재밌겠다!',
    stage_2: '네온 불빛 예쁘다… 앗, 달려야지!',
    stage_3: '보물찾기 같아! 편지 살려내자!',
    stage_4: '기차 진짜 빠르다! 손가락도 빠르게!',
    stage_5: '무섭지만… 같이 있으니까 괜찮아!',
    daily: '오늘은 몇 개나 맞힐까? 두근두근!',
  },
  glasses_boy: {
    stage_1: '받침 없는 낱말부터. 침착하게 가자.',
    stage_2: '오타 한 번이 2초야. 정확한 쪽이 빨라.',
    stage_3: '띄어쓰기까지 그대로. 읽고 나서 치자.',
    stage_4: '문장이 길어. 한 어절씩 끊어서 보자.',
    stage_5: '다 배운 것들이야. 순서대로 풀면 돼.',
    daily: '어제 기록은 여기. 오늘은 넘어 보자.',
  },
  blond_explorer: {
    stage_1: '대원들, 준비됐나? 출발한다!',
    stage_2: '뒤 돌아보지 마. 내가 앞장선다!',
    stage_3: '이 유적, 내가 읽어 주지. 따라와!',
    stage_4: '전원 자리로! 전보를 보낸다!',
    stage_5: '여기까지 잘 왔다. 마지막이다!',
    daily: '오늘의 임무 확인. 출동!',
  },
};

/**
 * 펫은 울음소리만 짧게. 캐릭터 바로 옆에 서 있어서 말풍선이 길면 주인공 얼굴을 덮는다.
 * 펫이 무슨 도움을 주는지는 전투 화면 좌측 패널에 이미 적혀 있다.
 */
const PET_LINES: Record<string, string> = {
  cat: '냥냥!',
  rabbit: '깡총!',
  dragon: '크릉!',
  squirrel: '찍찍!',
};

/** 몬스터는 도발한다 — 아이가 "그래?" 하고 덤비게 */
const ENEMY_LINES: Record<string, string> = {
  green_slime: '말랑… 낱말 내놔!',
  letter_bat: '끼익! 글자를 훔쳐 간다!',
  shadow_chaser: '…어디까지 도망칠래?',
  keycap_knight: '자판을 지키는 기사다!',
  sentence_ghost: '문장을 흐트러뜨려 주지…',
  ink_slime: '잉크로 다 지워 버릴 거야!',
  keyboard_golem: '쿵… 쿵… 글자는 전부 내 것.',
};

export function playerLine(characterId: string, stage: StageId): string {
  return PLAYER_LINES[characterId]?.[stage] ?? PLAYER_LINES.brown_boy[stage] ?? '가 보자!';
}
export function petLine(petId: string): string {
  return PET_LINES[petId] ?? '가자!';
}
export function enemyLine(enemyId: string): string | null {
  return ENEMY_LINES[enemyId] ?? null;
}
