/** 한국어 조사 자동 선택. 낱말의 마지막 글자에 받침이 있는지 보고 이/가·을/를·은/는·으로/로 를 고른다. */
export type JosaPair = '이/가' | '을/를' | '은/는' | '으로/로';

const FORMS: Record<JosaPair, [withBatchim: string, withoutBatchim: string]> = {
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '은/는': ['은', '는'],
  '으로/로': ['으로', '로'],
};

// 숫자로 끝나면 읽는 소리 기준(영·일·삼·육·칠·팔 = 받침 있음).
const DIGIT_BATCHIM = new Set(['0', '1', '3', '6', '7', '8']);

/** 마지막 글자의 받침 종성 번호(0 = 없음). 한글 음절이 아니면 undefined */
function finalConsonant(word: string): number | undefined {
  const trimmed = word.trimEnd();
  const last = trimmed[trimmed.length - 1];
  if (!last) return undefined;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
  if (DIGIT_BATCHIM.has(last)) return 1;
  if (/[0-9]/.test(last)) return 0;
  return undefined;
}

/** 낱말에 맞는 조사만 돌려준다. 한글이 아닌 이름(영문 등)은 받침 없는 꼴을 쓴다 */
export function josaOnly(word: string, pair: JosaPair): string {
  const jong = finalConsonant(word);
  const [withBatchim, withoutBatchim] = FORMS[pair];
  if (jong === undefined || jong === 0) return withoutBatchim;
  // ㄹ 받침 뒤에는 '으로' 가 아니라 '로' (예: 마을로)
  if (pair === '으로/로' && jong === 8) return withoutBatchim;
  return withBatchim;
}

/** 낱말 + 조사. 예: josa('고양이', '이/가') → '고양이가', josa('드래곤', '이/가') → '드래곤이' */
export function josa(word: string, pair: JosaPair): string {
  return `${word}${josaOnly(word, pair)}`;
}
