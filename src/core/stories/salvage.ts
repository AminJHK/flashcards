/**
 * 중간에 끊긴 JSON을 살린다: 마지막으로 끝까지 온 객체(})까지 자르고 열린 괄호를 닫는다.
 * 예: 이야기 줄은 다 왔는데 glossary를 쓰다 끊긴 경우, 이야기는 쓸 수 있다.
 * 살릴 수 없으면 undefined.
 */
export function salvageJson(text: string): unknown {
  const cuts: { at: number; close: string }[] = [];
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return undefined;
      if (c === '}' && stack.length) cuts.push({ at: i + 1, close: [...stack].reverse().join('') });
    }
  }
  // 뒤에서부터 (가장 많이 살리는 쪽부터) 시도
  for (let k = cuts.length - 1, tries = 0; k >= 0 && tries < 60; k--, tries++) {
    try {
      return JSON.parse(text.slice(0, cuts[k]!.at) + cuts[k]!.close);
    } catch {
      /* 더 앞에서 잘라 본다 */
    }
  }
  return undefined;
}
