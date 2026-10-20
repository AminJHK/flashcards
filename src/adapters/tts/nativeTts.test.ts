import { describe, expect, it } from 'vitest';
import { voiceChoices } from './nativeTts';

describe('안드로이드 목소리 목록', () => {
  it('폰에 저장·인터넷 판을 하나로 묶어 "목소리 n"으로 보여 주고, 엔진 기본(-language)은 뺀다', () => {
    const v = (name: string, network = name.endsWith('-network')) => ({ name, lang: 'id-ID', network });
    const list = voiceChoices([v('id-id-x-ide-network'), v('id-id-x-ide-local'), v('id-id-x-idd-local'), v('id-id-x-idc-network'), v('id-ID-language', false)]);
    expect(list).toEqual([
      { name: 'id-id-x-idc-network', label: '목소리 1 · 인터넷 필요', members: ['id-id-x-idc-network'] },
      { name: 'id-id-x-idd-local', label: '목소리 2', members: ['id-id-x-idd-local'] },
      { name: 'id-id-x-ide-local', label: '목소리 3', members: ['id-id-x-ide-network', 'id-id-x-ide-local'] },
    ]);
  });
});
