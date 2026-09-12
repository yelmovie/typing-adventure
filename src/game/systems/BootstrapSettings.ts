import type { GameLanguage } from '../types';
import { STORAGE_KEY } from './SaveKey';

/** Reads only the language needed by the lightweight opening; full validation runs with the game. */
export function readBootstrapLanguage(): GameLanguage {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'ko';
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return 'ko';
    const settings = (saved as { settings?: unknown }).settings;
    if (!settings || typeof settings !== 'object') return 'ko';
    return (settings as { language?: unknown }).language === 'en' ? 'en' : 'ko';
  } catch {
    return 'ko';
  }
}
