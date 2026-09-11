import type { ScreenName } from '../types';
import type { Screen } from './Screen';
import { HomeScreen } from './screens/HomeScreen';
import { SetupScreen } from './screens/SetupScreen';
import { TutorialScreen } from './screens/TutorialScreen';
import { WorldMapScreen } from './screens/WorldMapScreen';
import { IntroScreen } from './screens/IntroScreen';
import { BattleScreen } from './screens/BattleScreen';
import { ResultScreen } from './screens/ResultScreen';
import { closeModal } from './ModalController';

/** DOM 스크린 관리자 */
export class UIRoot {
  private screens: Record<ScreenName, Screen<never>>;
  private root = document.getElementById('ui-root')!;

  constructor() {
    this.screens = {
      home: new HomeScreen(),
      setup: new SetupScreen(),
      tutorial: new TutorialScreen(),
      worldmap: new WorldMapScreen(),
      intro: new IntroScreen(),
      battle: new BattleScreen(),
      result: new ResultScreen(),
    };
    for (const s of Object.values(this.screens)) {
      s.el.style.display = 'none';
      this.root.appendChild(s.el);
    }
  }

  show(name: ScreenName, data: Record<string, unknown>) {
    (this.screens[name] as Screen<Record<string, unknown>>).show(data);
  }

  hide(name: ScreenName) {
    closeModal();
    this.screens[name].hide();
  }
}
