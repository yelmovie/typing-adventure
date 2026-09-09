// 아이템 6종 (몬스터 처치·변화구 드롭. 코어가 같은 id 로 WaveSystem 등에 구현)
export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  /** public/assets/ui 의 아이콘 파일명. 없으면 CSS 아이콘(cssIcon) 으로 그린다 */
  img?: string;
  /** 전용 이미지가 없는 아이템의 CSS 아이콘 종류 */
  cssIcon?: 'gem';
}

// 아이콘은 item-game-icons-v2.png(6×1) 을 잘라 만든 drop_* (게임 화면 fx_items 와 같은 그림)
export const ITEMS: ItemDef[] = [
  { id: 'coin', name: '코인', desc: '점수 30점을 더해줘요', img: 'drop_coin' },
  { id: 'gem', name: '보석', desc: '점수 80점과 코인을 더해줘요', img: 'drop_gem' },
  { id: 'star', name: '별', desc: '점수 150점을 더해줘요', img: 'drop_star' },
  { id: 'heart', name: '하트', desc: '체력을 20 채워줘요', img: 'drop_heart' },
  { id: 'shield', name: '방패', desc: '다음 한 번의 접촉을 막아줘요', img: 'drop_shield' },
  { id: 'bolt', name: '번개', desc: '3초 동안 적을 느리게 만들어요', img: 'drop_bolt' },
];
