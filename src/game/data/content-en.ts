import type { ContentUnit, StageId } from '../types';
const units: ContentUnit[] = [];
function words(stage: StageId, list: string[], tags: string[] = [], difficulty = 1) {
  list.forEach((text, i) => units.push({ id: `en-${stage}-${tags.join('-') || 'word'}-${i}`, stage, type: 'word', text, tags, difficulty, weight: 1 }));
}
function sentences(stage: StageId, list: string[], tag: string, difficulty = 2, extraTags: string[] = []) {
  list.forEach((text, i) => units.push({ id: `en-${stage}-${tag}-${i}`, stage, type: 'sentence', text, tags: [tag, `순서${i + 1}`, ...extraTags], difficulty, weight: 1 }));
}
words('stage_1', ['pop', 'zip', 'zap', 'hop', 'yum', 'wow', 'puff', 'ping', 'pong', 'jelly', 'cookie', 'candy', 'cocoa', 'berry', 'peach', 'mango', 'slime', 'bunny', 'fairy', 'wand', 'magic', 'bubble', 'giggle', 'noodle', 'muffin', 'waffle', 'sprout', 'rainbow', 'cupcake', 'sparkle']);
words('stage_2', ['dash', 'zoom', 'jet', 'beam', 'gear', 'bolt', 'turbo', 'radar', 'rover', 'laser', 'portal', 'tunnel', 'secret', 'launch', 'signal', 'pixel', 'neon', 'switch', 'shield', 'space', 'spark', 'trail', 'glide', 'quest', 'key', 'drive', 'brake', 'wheel', 'wing', 'gate'], [], 2);
sentences('stage_3', ['Explorer, I found a map in the sand.', 'It shows three rocks shaped like stars.', 'Past the rocks you will see a gold gate.', 'At the gate, tap the small button.', 'Click! The gate lights up and shakes.', 'Only careful sentences open the locks.', 'Push the door together. A cool wind!', 'Shiny stairs lead down behind the door.', 'We found the room of the lost words!'], '편지');
sentences('stage_4', ['Engine room! The bridge ahead is broken.', 'Slow down and get the brakes ready.', 'Everyone sit down and hold on tight.', 'Sound the horn to warn the front car.', 'Brake now! Stop before the bridge!'], '전보');
words('stage_5', ['glow', 'brave', 'hope', 'friend', 'dream'], ['결정'], 3);
words('stage_5', ['star', 'moon', 'shine', 'spell', 'crown', 'heart', 'cheer', 'smile', 'lucky', 'super', 'power', 'light', 'team', 'clear', 'found', 'hooray'], ['러시'], 2);
// Final passage: two sentences per role (armor 1-2, core 3-4, finale 5-6); the set tag keeps them together.
sentences('stage_5', ['My words opened a new path.', 'I fixed mistakes and kept going!', 'The core glows behind the armor.', 'A careful sentence wakes the core.', 'Pop! The letters fly back home.', 'We did it! Our town is bright again!'], '최종', 3, ['이야기1']);
sentences('daily', ['A jelly slime goes hop, hop, hop.', 'A bunny shares a star-shaped cookie.', 'Which button opens the secret door?', 'A cloud brings a parcel to my window.', 'My rocket shoes go zip!', 'The little dragon sneezes flowers.', 'A hidden bell plays our song.', 'We share the treasure with a friend.', 'Oops! I fix one letter and try again.', 'I draw a new star in the sky.', 'I check the green light, then go.', 'A new word is a new clue.'], '오늘문장');
sentences('daily', ['Mia found a parcel on a cloud.', 'It had a note for the moon bunny.', 'One word in the address was missing.', 'Mia opened her little star map.', 'She looked for a lake shaped like a ring.', 'Only one star had a lake like that.', 'She typed its name into the rocket.', 'The rocket hummed and rose into the sky.', 'The moon bunny waved from a small garden.', 'The parcel held seeds from an old friend.', 'They read the letter and planted the seeds.', 'Mia flew home with a new story to tell.'], '장문1');
export const ENGLISH_CONTENT: ContentUnit[] = units;

/** Standards, learning objectives and review metadata for the English content (same shape as content.json `meta`). */
export const ENGLISH_CONTENT_META = {
  // Only the Practical Arts standard applies to English typing; the Korean-language standards in content.json do not.
  standards: [
    {
      code: '[6실04-02]',
      text: '생활 속 디지털 기술의 중요성을 이해하고, 디지털 기기와 디지털 콘텐츠 저작 도구를 사용하여 발표 자료를 만들어 보면서 디지털 기기의 활용 능력을 기른다.',
      subject: '실과 (Practical Arts)',
      grade: '초등 5~6학년',
      source: 'https://namu.wiki/w/2022%20%EA%B0%9C%EC%A0%95%20%EA%B5%90%EC%9C%A1%EA%B3%BC%EC%A0%95/%EC%8B%A4%EA%B3%BC(%EA%B8%B0%EC%88%A0%C2%B7%EA%B0%80%EC%A0%95)',
      verified: true,
      note: 'Keyboard input practice supports basic digital-device skills. Original text: 교육부 고시 제2022-33호 [별책 10].',
    },
  ],
  learningObjectives: {
    stage_1: ['Type short words accurately and get comfortable with the keyboard.', 'Delete and fix a wrong letter before finishing the word.'],
    stage_2: ['Type longer words quickly and accurately, one after another.'],
    stage_3: ['Read the story and choose the sentence that comes next.', 'Type sentences with correct spacing, capital letters and punctuation.'],
    stage_4: ['Type sentences accurately under a time limit.', 'Notice a typo, fix it calmly and send again.'],
    stage_5: ['Switch between words and sentences and use everything learned so far.', 'Complete a longer passage sentence by sentence.'],
    daily: ['Measure your own record with the same words every day.', 'Look at speed and accuracy separately.'],
  },
  review: {
    needsReview: true,
    reviewer: '',
    reviewedAt: null as string | null,
    source: 'Original sentences written for this game (옐샘)',
    note: 'A teacher reads every word and sentence, then sets needsReview to false.',
  },
};
