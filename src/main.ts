import './styles/design-tokens.css';
import './styles/animations.css';
import './styles/responsive.css';
import './styles/components.css';
import './styles/screens-home-setup.css';
import './styles/screens-map-intro.css';
import './styles/screens-battle.css';
import './styles/screens-result-collection.css';
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
import './styles/adaptive-layout.css';
import { setLanguage } from './game/i18n/Locale';
import { readBootstrapLanguage } from './game/systems/BootstrapSettings';
import { startOpening } from './game/ui/OpeningStartup';
import { setupUiScale } from './game/ui/Viewport';

setLanguage(readBootstrapLanguage());
setupUiScale();
let activated = false;
const recordActivation = () => {
  activated = true;
  window.removeEventListener('pointerdown', recordActivation);
  window.removeEventListener('keydown', recordActivation);
};
window.addEventListener('pointerdown', recordActivation);
window.addEventListener('keydown', recordActivation);
let runtime: Promise<void> | undefined;
const start = () => {
  if (!runtime) {
    runtime = import('./runtime')
      .then(module => module.startRuntime(activated))
      .then(() => {
        // Finish offline preparation quietly once the home screen is idle. Never blocks the game.
        void import('./game/systems/BackgroundPrecache').then(module => module.scheduleBackgroundPrecache()).catch(() => {});
      })
      .catch((error) => { runtime = undefined; throw error; });
  }
  return runtime;
};
// Developer scene shortcuts intentionally enter their requested scene directly.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('go')) void start();
else startOpening(start);
