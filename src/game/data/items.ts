// 아이템 6종 (몬스터 처치·변화구 드롭. 코어가 같은 id 로 WaveSystem 등에 구현)
export interface ItemDef {
  id: string;
  name: string;
  desc: string;
}

export const ITEMS: ItemDef[] = [
  { id: 'coin', name: '코인', desc: '점수 30점을 더해줘요' },
  { id: 'gem', name: '보석', desc: '점수 80점과 코인을 더해줘요' },
  { id: 'star', name: '별', desc: '점수 150점을 더해줘요' },
  { id: 'heart', name: '하트', desc: '체력을 20 채워줘요' },
  { id: 'shield', name: '방패', desc: '다음 한 번의 접촉을 막아줘요' },
  { id: 'bolt', name: '번개', desc: '3초 동안 적을 느리게 만들어요' },
];
