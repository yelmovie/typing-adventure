import { createGame, currentScreen } from './game/Game';
import { AudioManager } from './game/systems/AudioManager';
import { installSaveNotice } from './game/ui/SaveNotice';
import { setLanguage, installLocaleObserver, installTranslations } from './game/i18n/Locale';
import { EN, translateDynamic } from './game/i18n/en';
import { SaveSystem } from './game/systems/SaveSystem';
import { installUpdateNotice } from './game/ui/UpdateNotice';

export function startRuntime(wasActivated = false) {
// Restore the saved corpus before mounting any game screens.
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

if (wasActivated || navigator.userActivation?.hasBeenActive) unlock();
}
