import type { ContentUnit } from '../types';

const ROLES = ['갑옷', '코어', '마무리'] as const;
/** 마지막 장문은 역할마다 문장 두 개씩(순서 1-2 갑옷, 3-4 코어, 5-6 마무리)으로 이어진다. */
export const FINAL_PER_ROLE = 2;
export const FINAL_SENTENCES = ROLES.length * FINAL_PER_ROLE;

const EXTRA = {
  ko: {
    crystals: ['수호', '불꽃', '번개', '지혜', '우정'],
    rush: ['쿠키', '팝콘', '젤리', '로켓', '방패', '회오리', '무지개', '비밀문'],
    // 장문 세트: 각 배열이 한 편(6문장)이며 순서대로 갑옷·갑옷·코어·코어·마무리·마무리.
    final: [
      ['딱딱한 갑옷도 우리 글자 앞에서는 와르르 무너져!', '반짝이는 글자들이 갑옷의 틈을 찾아냈어.', '앗, 갑옷 속에 반짝이는 코어가 보여!', '숨겨진 코어야, 빼앗은 글자를 돌려줘!', '팡! 글자들이 마을로 돌아간다!', '우리가 해냈어! 이제 마을에 웃음이 가득해.'],
      ['골렘의 갑옷이 두꺼워도 한 글자씩 두드리면 돼.', '친구와 힘을 모아 마지막 갑옷을 깨자!', '코어가 드러나자 성채가 조용히 떨리기 시작했어.', '정확한 한 문장으로 코어를 밝혀 보자!', '별빛이 성채를 감싸고 어둠이 걷히고 있어.', '친구야, 하이파이브! 별빛 마을을 구했어!'],
      ['자판 위 손가락이 춤추듯 갑옷을 두드리고 있어.', '한 글자도 놓치지 않고 갑옷의 금을 넓히자!', '갑옷 틈 사이로 따뜻한 빛이 새어 나와.', '코어야, 우리가 배운 글자를 받아 줘!', '반짝! 잃어버린 낱말들이 하늘로 날아올라.', '별빛 마을에 다시 글자 노래가 울려 퍼졌어!'],
    ],
  },
  en: {
    crystals: ['spark', 'magic', 'guard', 'bloom', 'trust'],
    rush: ['cookie', 'pop', 'jelly', 'rocket', 'shield', 'whirl', 'rain', 'door'],
    final: [
      ['Crack! Our words break the armor!', 'Aim for the gap in that shiny armor.', 'Look! The secret core is glowing!', 'Little core, give our letters back!', 'Pop! The letters are flying home!', 'We did it! Our town can smile again.'],
      ['Tap by tap, the thick armor cracks.', 'Team up! The last armor is falling!', 'The core shines as the castle shakes.', 'One clear sentence lights the core!', 'Starlight wraps the dark castle.', 'High five! We saved our star town!'],
      ['Our fingers dance across the keys.', 'Every letter widens the armor crack!', 'Warm light leaks through the armor.', 'Core, take back the words we learned!', 'Whoosh! Lost words rise into the sky.', 'Songs of letters fill our star town!'],
    ],
  },
};

/** 순서N 태그(1..6)로 역할을 정한다. 범위 밖이면 undefined. */
export function finalRoleForOrder(order: number): (typeof ROLES)[number] | undefined {
  return ROLES[Math.floor((order - 1) / FINAL_PER_ROLE)];
}

/** Keep existing IDs/history; tag the base passage by role and add alternative passages for each final strike. */
export function withBossVariety(base: ContentUnit[], language: 'ko' | 'en'): ContentUnit[] {
  const out = base.map(unit => {
    if (unit.stage !== 'stage_5' || !unit.tags.includes('최종')) return unit;
    const order = Number(unit.tags.find(tag => /^순서\d+$/.test(tag))?.slice(2));
    const role = finalRoleForOrder(order);
    return role && !unit.tags.includes(role) ? { ...unit, tags: [...unit.tags, role] } : unit;
  });
  const extra = EXTRA[language];
  const add = (text: string, id: string, type: 'word' | 'sentence', tags: string[], difficulty: number) => {
    out.push({ id: `${language}-boss-v2-${id}`, stage: 'stage_5', type, text, tags, difficulty, weight: 1 });
  };
  extra.crystals.forEach((text, i) => add(text, `crystal-${i}`, 'word', ['결정'], 2));
  extra.rush.forEach((text, i) => add(text, `rush-${i}`, 'word', ['러시'], 2));
  // 기본 장문이 이야기1 이므로 추가 세트는 이야기2 부터.
  extra.final.forEach((sentences, set) => sentences.forEach((text, i) => add(text, `final-${set}-${i}`, 'sentence', ['최종', finalRoleForOrder(i + 1)!, `순서${i + 1}`, `이야기${set + 2}`], 3)));
  return out;
}
