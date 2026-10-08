/**
 * 음성 인식 결과 조각을 하나의 문장으로 합친다.
 * 안드로이드 브라우저는 말하는 동안 "지금까지 들은 전체"를 조각마다 다시 보내는 경우가 많다
 * (请告诉我你的 → 请告诉我你的全名和 → …). 그대로 이어 붙이면 같은 말이 여러 번 들어가므로,
 * 앞 조각을 포함하는 조각은 바꿔 끼우고, 겹치는 부분은 한 번만 남긴다.
 */

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const squash = (s: string) => s.replace(/\s+/g, '');

function joinPiece(a: string, b: string): string {
  if (!a) return b;
  // 중국어처럼 띄어 쓰지 않는 글자끼리는 붙이고, 아니면 한 칸 띄운다
  const first = b[0] ?? '';
  const sep = /[\p{P}]/u.test(first) || (CJK.test(a.slice(-1)) && CJK.test(first)) ? '' : ' ';
  return a + sep + b;
}

export function mergeTranscripts(parts: readonly string[]): string {
  let acc = '';
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const A = squash(acc);
    const P = squash(p);
    if (A.includes(P)) continue; // 이미 들은 말을 다시 보냄
    if (P.startsWith(A) || P.includes(A)) {
      acc = p; // 앞의 말까지 포함한 더 긴 조각 → 바꿔 끼움
      continue;
    }
    // 앞 조각 끝과 이 조각 앞이 겹치면 겹친 부분은 한 번만
    let overlap = 0;
    for (let k = Math.min(A.length, P.length); k > 0; k--) {
      if (A.endsWith(P.slice(0, k))) {
        overlap = k;
        break;
      }
    }
    acc = joinPiece(acc, overlap ? squash(p).slice(overlap) : p);
  }
  return acc.replace(/\s+/g, ' ').trim();
}
