import './styles/design-tokens.css';
import './styles/animations.css';
import './styles/responsive.css';
import './styles/components.css';
import './styles/screens.css';
import { createGame } from './game/Game';
import { AudioManager } from './game/systems/AudioManager';

// 폰트가 준비되면 시작 (실패해도 시스템 폰트로 진행)
const ready = 'fonts' in document ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();

void ready.then(() => {
  createGame();
});

// 첫 사용자 입력 시 오디오 컨텍스트 잠금 해제
const unlock = () => {
  AudioManager.unlock();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
