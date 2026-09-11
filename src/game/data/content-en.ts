import type { ContentUnit, StageId } from '../types';
const units: ContentUnit[] = [];
function words(stage: StageId, list: string[], tags: string[] = [], difficulty = 1) {
  list.forEach((text, i) => units.push({ id: `en-${stage}-${tags.join('-') || 'word'}-${i}`, stage, type: 'word', text, tags, difficulty, weight: 1 }));
}
function sentences(stage: StageId, list: string[], tag: string, difficulty = 2) {
  list.forEach((text, i) => units.push({ id: `en-${stage}-${tag}-${i}`, stage, type: 'sentence', text, tags: [tag, `순서${i + 1}`], difficulty, weight: 1 }));
}
words('stage_1', ['pop', 'zip', 'zap', 'hop', 'yum', 'wow', 'puff', 'ping', 'pong', 'jelly', 'cookie', 'candy', 'cocoa', 'berry', 'peach', 'mango', 'slime', 'bunny', 'fairy', 'wand', 'magic', 'bubble', 'giggle', 'noodle', 'muffin', 'waffle', 'sprout', 'rainbow', 'cupcake', 'sparkle']);
words('stage_2', ['dash', 'zoom', 'jet', 'beam', 'gear', 'bolt', 'turbo', 'radar', 'rover', 'laser', 'portal', 'tunnel', 'secret', 'launch', 'signal', 'pixel', 'neon', 'switch', 'shield', 'space', 'spark', 'trail', 'glide', 'quest', 'key', 'drive', 'brake', 'wheel', 'wing', 'gate'], [], 2);
sentences('stage_3', ['Dear explorer,', 'A star map is under the sand.', 'Follow the dots to the gold gate.', 'Tap the small button by your feet.', 'Click! The gate is glowing.', 'We found the room of lost words!'], '편지');
sentences('stage_4', ['Train team, the track ends ahead!', 'Slow down and get the brakes ready.', 'Brake now! Stop before the bridge!'], '전보');
words('stage_5', ['glow', 'brave', 'hope', 'friend', 'dream'], ['결정'], 3);
words('stage_5', ['star', 'moon', 'shine', 'spell', 'crown', 'heart', 'cheer', 'smile', 'lucky', 'super', 'power', 'light', 'team', 'clear', 'found', 'hooray'], ['러시'], 2);
sentences('stage_5', ['My words opened a new path.', 'I fixed mistakes and kept going!', 'We did it! Our town is bright again!'], '최종', 3);
sentences('daily', ['A jelly slime goes hop, hop, hop.', 'A bunny shares a star-shaped cookie.', 'Which button opens the secret door?', 'A cloud brings a parcel to my window.', 'My rocket shoes go zip!', 'The little dragon sneezes flowers.', 'A hidden bell plays our song.', 'We share the treasure with a friend.', 'Oops! I fix one letter and try again.', 'I draw a new star in the sky.', 'I check the green light, then go.', 'A new word is a new clue.'], '오늘문장');
sentences('daily', ['Mia found a parcel on a cloud.', 'It had a note for the moon bunny.', 'One word in the address was missing.', 'Mia opened her little star map.', 'She looked for a lake shaped like a ring.', 'Only one star had a lake like that.', 'She typed its name into the rocket.', 'The rocket hummed and rose into the sky.', 'The moon bunny waved from a small garden.', 'The parcel held seeds from an old friend.', 'They read the letter and planted the seeds.', 'Mia flew home with a new story to tell.'], '장문1');
export const ENGLISH_CONTENT: ContentUnit[] = units;
