import { getLanguage } from '../i18n/Locale';

/** A failed asset request alone does not prove the internet connection is down. */
export function assetFailureMessage(): string {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (getLanguage() === 'en') return local
    ? 'Preview files could not be loaded. Check that the local server is running, then try again.'
    : 'Some game files could not be loaded. Please try again in a moment.';
  return local
    ? '미리보기 자료를 불러오지 못했어. 로컬 서버가 실행 중인지 확인한 뒤 다시 시도해 줘.'
    : '게임 자료를 불러오지 못했어. 잠시 후 다시 시도해 줘.';
}
