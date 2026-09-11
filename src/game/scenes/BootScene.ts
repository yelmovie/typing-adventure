import Phaser from 'phaser';
import { getCharacter, getPet } from '../data/characters';
import { homeSheet } from '../data/homeAssets';
import { navigate } from '../Game';
import { SaveSystem } from '../systems/SaveSystem';
import type { StageId } from '../types';
import { assetFailureMessage } from '../ui/assetFailureMessage';
import { getLanguage } from '../i18n/Locale';

// 첫 화면~지도까지 쓰는 배경만. 스테이지 배경·몬스터·이펙트는 StageIntroScene.preload 에서 스테이지별로 지연 로딩.
const BACKGROUNDS = ['bg_main_gate'];

export class BootScene extends Phaser.Scene {
  private loadFailed = false;
  constructor() {
    super('Boot');
  }

  preload() {
    this.loadFailed = false;
    const fill = document.getElementById('loading-fill');
    const text = document.getElementById('loading-text');
    this.load.on('progress', (p: number) => {
      if (fill) fill.style.width = `${Math.round(p * 100)}%`;
      if (text) text.textContent = `모험 준비 중... ${Math.round(p * 100)}%`;
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.loadFailed = true;
      console.warn('[Boot] load error', file.key, file.url);
    });

    for (const bg of BACKGROUNDS) this.load.image(bg, `./assets/backgrounds/${bg}.webp`);
    const profile = SaveSystem.get().profile;
    for (const sheet of [getCharacter(profile.characterId).sheet, getPet(profile.petId).sheet].map(homeSheet)) {
      if (!this.textures.exists(sheet)) this.load.atlas(sheet, `./assets/sprites/${sheet}.webp`, `./assets/sprites/${sheet}.json`);
    }
  }

  create() {
    const loading = document.getElementById('loading');
    if (this.loadFailed) {
      const message = document.getElementById('loading-text');
      if (message) {
        message.replaceChildren(document.createTextNode(`${assetFailureMessage()} `));
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = getLanguage() === 'en' ? 'Try again' : '다시 받기';
        retry.style.cssText = 'padding:12px 20px;font:inherit;cursor:pointer';
        retry.onclick = () => location.reload();
        message.append(retry);
      }
      return;
    }
    if (loading) loading.classList.add('hide');
    // 개발용 바로가기: ?go=battle&stage=stage_1 / ?go=worldmap / ?go=intro&stage=stage_2
    const q = new URLSearchParams(location.search);
    const go = q.get('go');
    const stageId = (q.get('stage') ?? 'stage_1') as StageId;
    if (import.meta.env.DEV && go && SaveSystem.hasSave()) {
      if (go === 'battle') {
        // navigate validates full character and stage atlases before constructing a battle.
        void navigate('battle', { stageId });
        return;
      }
      if (go === 'intro') {
        void navigate(go, { stageId });
        return;
      }
      if (go === 'worldmap' || go === 'setup') {
        void navigate(go);
        return;
      }
    }
    void navigate('home');
  }
}
