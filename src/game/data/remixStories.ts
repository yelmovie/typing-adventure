import type { ContentUnit, GameLanguage, StageId } from '../types';

// Choose a whole story: random individual sentences lose the clue → action → outcome.
export const REMIX_STORIES = {
  ko: {
    stage_3: [
      ['탐험가에게, 모래 속 편지를 찾아 줘.', '작은 별이 그려진 돌을 따라와.', '돌 아래에 황금 열쇠가 숨어 있어.', '열쇠를 들고 세 자물쇠를 열어 줘.', '찰칵! 황금문 안에서 빛이 새어 나와.', '잃어버린 글자들이 우리를 기다렸어!'],
      ['친구야, 사막의 지도가 찢어졌어.', '편지를 잇자 길이 다시 나타났어.', '초승달 바위 뒤로 천천히 걸어가.', '반짝이는 열쇠를 찾아 문에 꽂아 줘.', '세 자물쇠가 차례대로 열렸어.', '우리가 글자 보물방을 찾아냈어!'],
      ['유적을 지키던 작은 용의 편지야.', '바람이 글자들을 모래 속에 숨겼어.', '별 모양 발자국을 따라가 보자.', '금빛 열쇠가 세 자물쇠를 깨웠어.', '문 너머에서 친구의 웃음이 들려.', '되찾은 글자로 새 지도를 그리자!'],
    ],
    stage_4: [
      ['기관사님, 앞쪽 다리가 끊겼어요!', '승객을 앉히고 속도를 줄여 주세요.', '지금 브레이크! 다리 앞에서 멈춰요!'],
      ['긴급 전보! 선로 끝에 큰 틈이 있어요.', '속도를 낮추고 브레이크를 준비해요.', '정지 신호예요! 여기서 열차를 멈춰요!'],
      ['열차팀, 부서진 다리가 가까워요!', '모두 자리에 앉고 손잡이를 잡아요.', '비상 브레이크 작동! 천천히 멈춰요!'],
    ],
  },
  en: {
    stage_3: [
      ['Dear friend, find my sandy letter.', 'Follow the stones with little stars.', 'A golden key is under the last stone.', 'Use the key to open three locks.', 'Click! A light shines through the gate.', 'The lost words are waiting for us!'],
      ['Hello, explorer! My map is torn.', 'Join this letter to reveal the path.', 'Walk behind the moon-shaped rock.', 'Find the key and put it in the gate.', 'Three locks open one by one.', 'We found the room of lost words!'],
      ['This letter is from a little dragon.', 'The wind hid our words in the sand.', 'Follow the trail of tiny stars.', 'The gold key wakes the three locks.', 'A friend is laughing past the gate.', 'Let us draw a new map with our words!'],
    ],
    stage_4: [
      ['Driver, the bridge ahead is broken!', 'Seat the team and slow the train.', 'Brake now! Stop before the gap!'],
      ['Urgent! A gap is ahead on the track.', 'Slow down and prepare the brakes.', 'Red signal! Bring the train to a stop!'],
      ['Train team, the broken bridge is near!', 'Sit down and hold the rail, everyone.', 'Emergency brake! Stop slowly here!'],
    ],
  },
} satisfies Record<GameLanguage, Record<'stage_3' | 'stage_4', string[][]>>;

const previous = new Map<string, number>();
export function buildRemixStory(stage: StageId, language: GameLanguage, originals: ContentUnit[], random = Math.random): ContentUnit[] | undefined {
  if (stage !== 'stage_3' && stage !== 'stage_4') return;
  const options = REMIX_STORIES[language][stage];
  const key = `${language}:${stage}`;
  const candidates = options.map((_, i) => i).filter(i => i !== previous.get(key));
  const selected = candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))];
  previous.set(key, selected);
  const tag = stage === 'stage_3' ? '편지' : '전보';
  const bases = originals.filter(unit => unit.tags.includes(tag)).sort((a, b) => {
    const order = (u: ContentUnit) => Number(u.tags.find(t => /^순서\d+$/.test(t))?.slice(2) ?? 0);
    return order(a) - order(b);
  });
  return options[selected].map((text, i) => ({
    ...(bases[i] ?? bases[0]), id: `remix-${language}-${stage}-${selected}-${i}`, stage,
    type: 'sentence', text: text.normalize('NFC'), difficulty: bases[i]?.difficulty ?? 2,
    weight: 1, tags: [tag, `순서${i + 1}`, `이야기${selected + 1}`],
  }));
}
