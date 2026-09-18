import type { ContentUnit, GameLanguage, StageId } from '../types';

// Choose a whole story: random individual sentences lose the clue → action → outcome.
export const REMIX_STORIES = {
  ko: {
    stage_3: [
      ['탐험가에게, 모래 속 편지를 찾아 줘.', '작은 별이 그려진 돌을 따라와.', '바람이 불면 발자국이 사라지니 서둘러.', '돌 아래에 황금 열쇠가 숨어 있어.', '열쇠를 들고 세 자물쇠를 열어 줘.', '자물쇠마다 다른 글자가 새겨져 있어.', '찰칵! 황금문 안에서 빛이 새어 나와.', '문 안쪽 계단이 별빛으로 반짝여.', '잃어버린 글자들이 우리를 기다렸어!'],
      ['친구야, 사막의 지도가 찢어졌어.', '편지를 잇자 길이 다시 나타났어.', '초승달 바위 뒤로 천천히 걸어가.', '모래 언덕 너머로 황금문이 보여.', '반짝이는 열쇠를 찾아 문에 꽂아 줘.', '문 앞에는 오래된 글자가 새겨져 있어.', '세 자물쇠가 차례대로 열렸어.', '문이 열리자 시원한 바람이 불어왔어.', '우리가 글자 보물방을 찾아냈어!'],
      ['유적을 지키던 작은 용의 편지야.', '바람이 글자들을 모래 속에 숨겼어.', '별 모양 발자국을 따라가 보자.', '발자국 끝에 낡은 상자가 묻혀 있어.', '상자 안에서 금빛 열쇠를 찾았어.', '금빛 열쇠가 세 자물쇠를 깨웠어.', '용이 꼬리로 문을 살짝 밀어 주었어.', '문 너머에서 친구의 웃음이 들려.', '되찾은 글자로 새 지도를 그리자!'],
      ['사막 마을 아이가 편지를 보냈어.', '우리 마을 우물이 글자를 잃어버렸대.', '우물 옆 야자나무 아래를 파 봐.', '거기서 작은 놋쇠 열쇠가 나올 거야.', '열쇠를 들고 황금문으로 걸어가.', '문에 새겨진 낱말을 소리 내어 읽어 봐.', '자물쇠가 하나씩 노래하며 열릴 거야.', '문 안에서 시원한 물소리가 들려.', '우물의 글자들이 반짝이며 돌아왔어!'],
      ['별을 세는 낙타 상인의 편지야.', '밤마다 사막 위로 글자 별이 떨어져.', '떨어진 별은 황금문 뒤에 모여 있어.', '모래 언덕 두 개를 넘어 문을 찾아.', '문 앞 돌판에 손을 올려 봐.', '돌판이 따뜻해지면 자물쇠가 깨어나.', '한 문장씩 읽어 주면 문이 열려.', '문 너머에 별빛 계단이 기다려.', '글자 별을 하늘로 돌려보내자!'],
    ],
    stage_4: [
      ['기관사님, 앞쪽 다리가 끊겼어요!', '승객을 앉히고 속도를 줄여 주세요.', '기적을 울려 앞쪽에 알려 주세요.', '모래 주머니를 내려 무게를 줄여요.', '지금 브레이크! 다리 앞에서 멈춰요!'],
      ['긴급 전보! 선로 끝에 큰 틈이 있어요.', '속도를 낮추고 브레이크를 준비해요.', '창문을 닫고 손잡이를 꼭 잡아요.', '신호등이 빨간불로 바뀌었어요.', '정지 신호예요! 여기서 열차를 멈춰요!'],
      ['열차팀, 부서진 다리가 가까워요!', '모두 자리에 앉고 손잡이를 잡아요.', '기관실에 남은 거리를 알려 주세요.', '바퀴 소리가 커지면 속도를 더 줄여요.', '비상 브레이크 작동! 천천히 멈춰요!'],
      ['기관사님, 안개 속에 끊긴 다리가 있어요!', '등불을 켜고 속도를 절반으로 줄여요.', '승객들에게 자리에 앉으라고 알려요.', '모래 주머니를 풀어 무게를 줄여요.', '멈춰요! 다리 앞 붉은 깃발이에요!'],
      ['긴급! 열차가 너무 빨리 달리고 있어요.', '바퀴 소리가 커지니 브레이크를 잡아요.', '기적을 세 번 울려 앞차에 알려요.', '창문을 닫고 손잡이를 꼭 잡아요.', '정지 신호예요! 여기서 멈춰요!'],
    ],
  },
  en: {
    stage_3: [
      ['Dear friend, find my sandy letter.', 'Follow the stones with little stars.', 'Hurry, the wind erases the footprints.', 'A golden key is under the last stone.', 'Use the key to open three locks.', 'Each lock shows a different letter.', 'Click! A light shines through the gate.', 'Starlight glows on the stairs inside.', 'The lost words are waiting for us!'],
      ['Hello, explorer! My map is torn.', 'Join this letter to reveal the path.', 'Walk behind the moon-shaped rock.', 'The gold gate waits past the dunes.', 'Find the key and put it in the gate.', 'Old letters are carved on the door.', 'Three locks open one by one.', 'A cool wind blows as the gate opens.', 'We found the room of lost words!'],
      ['This letter is from a little dragon.', 'The wind hid our words in the sand.', 'Follow the trail of tiny stars.', 'An old box is buried at the end.', 'Inside the box is a golden key.', 'The gold key wakes the three locks.', 'The dragon nudges the gate open.', 'A friend is laughing past the gate.', 'Let us draw a new map with our words!'],
      ['A desert child sent this letter.', 'Our village well lost its letters.', 'Dig under the palm tree by the well.', 'You will find a small brass key there.', 'Carry the key to the golden gate.', 'Read the words carved on the door.', 'The locks will sing and open one by one.', 'Cool water sounds come from inside.', 'The well got its sparkling letters back!'],
      ['A letter from a star-counting trader.', 'Letter stars fall on the sand at night.', 'They gather behind the golden gate.', 'Cross two dunes to find the gate.', 'Put your hand on the stone by the door.', 'When it warms up, the locks wake up.', 'Read one sentence and the door opens.', 'Starlit stairs wait beyond the door.', 'Let us send the letter stars home!'],
    ],
    stage_4: [
      ['Driver, the bridge ahead is broken!', 'Seat the team and slow the train.', 'Sound the horn to warn the front car.', 'Drop the sandbags to make us lighter.', 'Brake now! Stop before the gap!'],
      ['Urgent! A gap is ahead on the track.', 'Slow down and prepare the brakes.', 'Close the windows and hold on tight.', 'The signal light just turned red.', 'Red signal! Bring the train to a stop!'],
      ['Train team, the broken bridge is near!', 'Sit down and hold the rail, everyone.', 'Tell the engine room how far it is.', 'If the wheels get loud, slow down more.', 'Emergency brake! Stop slowly here!'],
      ['Driver, a broken bridge is in the fog!', 'Light the lamps and slow to half speed.', 'Tell the passengers to sit down.', 'Drop the sandbags to make us lighter.', 'Stop! A red flag is at the bridge!'],
      ['Urgent! The train is going too fast.', 'The wheels are loud, so hold the brake.', 'Sound the horn three times ahead.', 'Close the windows and hold on tight.', 'Red signal! Stop the train right here!'],
    ],
  },
} satisfies Record<GameLanguage, Record<'stage_3' | 'stage_4', string[][]>>;

export interface RemixStory { units: ContentUnit[]; storyIndex: number }
export function remixStoryCount(stage: StageId): number {
  return stage === 'stage_3' || stage === 'stage_4' ? REMIX_STORIES.ko[stage].length : 0;
}
/** 완주한 문장 목록(wordsSeen)이 어느 이야기인지 — 이어하기로 복원한 판도 같은 이야기로 기록한다. */
export function remixStoryIndexOf(stage: StageId, language: GameLanguage, texts: string[]): number | undefined {
  if (stage !== 'stage_3' && stage !== 'stage_4') return;
  const seen = new Set(texts.map(t => t.normalize('NFC')));
  const index = REMIX_STORIES[language][stage].findIndex(story => story.some(line => seen.has(line.normalize('NFC'))));
  return index >= 0 ? index : undefined;
}

const previous = new Map<string, number>();
/**
 * 이야기를 통째로 고른다. 아직 완주하지 않은 이야기(`played` 에 없는 번호)를 순서대로 먼저 내고,
 * 모두 완주했으면 직전 이야기를 피해 무작위로 고른다 — 학생이 지도의 "이야기 1/5 → 2/5" 를 실제로 채울 수 있게.
 */
export function buildRemixStory(stage: StageId, language: GameLanguage, originals: ContentUnit[], random = Math.random, played: number[] = []): RemixStory | undefined {
  if (stage !== 'stage_3' && stage !== 'stage_4') return;
  const options = REMIX_STORIES[language][stage];
  const key = `${language}:${stage}`;
  const candidates = options.map((_, i) => i).filter(i => i !== previous.get(key));
  const unplayed = candidates.filter(i => !played.includes(i));
  const selected = unplayed.length ? unplayed[0] : candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))];
  previous.set(key, selected);
  const tag = stage === 'stage_3' ? '편지' : '전보';
  const bases = originals.filter(unit => unit.tags.includes(tag)).sort((a, b) => {
    const order = (u: ContentUnit) => Number(u.tags.find(t => /^순서\d+$/.test(t))?.slice(2) ?? 0);
    return order(a) - order(b);
  });
  const units: ContentUnit[] = options[selected].map((text, i) => ({
    ...(bases[i] ?? bases[0]), id: `remix-${language}-${stage}-${selected}-${i}`, stage,
    type: 'sentence', text: text.normalize('NFC'), difficulty: bases[i]?.difficulty ?? 2,
    weight: 1, tags: [tag, `순서${i + 1}`, `이야기${selected + 1}`],
  }));
  return { units, storyIndex: selected };
}
