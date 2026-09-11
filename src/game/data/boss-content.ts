import type { ContentUnit } from '../types';

const ROLES = ['갑옷', '코어', '마무리'] as const;
const EXTRA = {
  ko: {
    crystals: ['수호', '불꽃', '번개', '지혜', '우정'],
    rush: ['쿠키', '팝콘', '젤리', '로켓', '방패', '회오리', '무지개', '비밀문'],
    final: [
      ['딱딱한 갑옷도 우리 글자 앞에서는 와르르!', '반짝이는 글자들이 갑옷의 틈을 찾아냈어.', '친구와 힘을 모아 마지막 갑옷을 깨자!'],
      ['앗, 갑옷 속에 반짝이는 코어가 보여!', '숨겨진 코어야, 빼앗은 글자를 돌려줘!', '정확한 한 문장으로 코어를 밝혀 보자!'],
      ['팡! 글자들이 마을로 돌아간다!', '우리가 해냈어! 이제 마을에 웃음이 가득해.', '친구야, 하이파이브! 별빛 마을을 구했어!'],
    ],
  },
  en: {
    crystals: ['spark', 'magic', 'guard', 'bloom', 'trust'],
    rush: ['cookie', 'pop', 'jelly', 'rocket', 'shield', 'whirl', 'rain', 'door'],
    final: [
      ['Crack! Our words break the armor!', 'Aim for the gap in that shiny armor.', 'Team up! The last armor is falling!'],
      ['Look! The secret core is glowing!', 'Little core, give our letters back!', 'One clear sentence lights the core!'],
      ['Pop! The letters are flying home!', 'We did it! Our town can smile again.', 'High five! We saved our star town!'],
    ],
  },
};

/** Keep existing IDs/history; add role-based alternatives for each final strike. */
export function withBossVariety(base: ContentUnit[], language: 'ko' | 'en'): ContentUnit[] {
  const out = base.map(unit => {
    if (unit.stage !== 'stage_5' || !unit.tags.includes('최종')) return unit;
    const order = Number(unit.tags.find(tag => /^순서\d+$/.test(tag))?.slice(2));
    const role = ROLES[order - 1];
    return role ? { ...unit, tags: [...unit.tags, role] } : unit;
  });
  const extra = EXTRA[language];
  const add = (text: string, id: string, type: 'word' | 'sentence', tags: string[], difficulty: number) => {
    out.push({ id: `${language}-boss-v2-${id}`, stage: 'stage_5', type, text, tags, difficulty, weight: 1 });
  };
  extra.crystals.forEach((text, i) => add(text, `crystal-${i}`, 'word', ['결정'], 2));
  extra.rush.forEach((text, i) => add(text, `rush-${i}`, 'word', ['러시'], 2));
  extra.final.forEach((sentences, role) => sentences.forEach((text, i) => add(text, `final-${role}-${i}`, 'sentence', ['최종', ROLES[role], `순서${role + 1}`], 3)));
  return out;
}
