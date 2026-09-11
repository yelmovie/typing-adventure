import './styles/design-tokens.css';
import './styles/animations.css';
import './styles/responsive.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/finale.css';
import './styles/opening.css';
import './styles/learning.css';
import './styles/gameplay.css';
import './styles/replay-journey.css';
import './styles/journey.css';
import './styles/result.css';
import './styles/popups.css';
import './styles/popup-content.css';
import './styles/setup-fit.css';
import './styles/update-notice.css';
import { createGame, currentScreen } from './game/Game';
import { AudioManager } from './game/systems/AudioManager';
import { installSaveNotice } from './game/ui/SaveNotice';
import { setLanguage, installLocaleObserver, installTranslations } from './game/i18n/Locale';
import { EN, translateDynamic } from './game/i18n/en';
import { SaveSystem } from './game/systems/SaveSystem';
import { installUpdateNotice } from './game/ui/UpdateNotice';

// Use the saved corpus immediately; fonts swap in without blocking the first screen.
setLanguage(SaveSystem.get().settings.language ?? 'ko');
installTranslations(EN, translateDynamic);
installLocaleObserver();
createGame();
installSaveNotice();
installUpdateNotice({
  canOffer: () => ['home', 'worldmap'].includes(currentScreen() ?? '')
    && !document.querySelector('.opening-player, #modal-root .modal-backdrop, #fade.on, #ui-stage[aria-busy]'),
  save: () => SaveSystem.status().state !== 'recovered' && SaveSystem.save(),
});

// 첫 사용자 입력 시 오디오 컨텍스트 잠금 해제
const unlock = () => {
  AudioManager.unlock();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
