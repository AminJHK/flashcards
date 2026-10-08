import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveError, ensureFolder, pruneBackups, uploadJson } from './drive';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('Google Drive', () => {
  it('폴더가 없으면 만들고, 있으면 그대로 쓴다', async () => {
    const f = vi.fn().mockResolvedValueOnce(json(200, { files: [] })).mockResolvedValueOnce(json(200, { id: 'NEW' }));
    vi.stubGlobal('fetch', f);
    expect(await ensureFolder('T')).toBe('NEW');
    expect(JSON.parse(f.mock.calls[1]![1].body)).toEqual({ name: '플래시카드 백업', mimeType: 'application/vnd.google-apps.folder' });
    expect(f.mock.calls[0]![1].headers.Authorization).toBe('Bearer T');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(200, { id: 'OLD', trashed: false })));
    expect(await ensureFolder('T', 'OLD')).toBe('OLD');
  });

  it('백업 파일을 폴더 안에 multipart로 올린다', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { id: 'F', name: 'b.json', createdTime: 'x' }));
    vi.stubGlobal('fetch', f);
    await uploadJson('T', 'FOLDER', 'b.json', '{"a":1}');
    const [url, init] = f.mock.calls[0]!;
    expect(url).toContain('uploadType=multipart');
    expect(init.headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    expect(init.body).toContain('"parents":["FOLDER"]');
    expect(init.body).toContain('{"a":1}');
  });

  it('오래된 백업은 지우고 최근 것만 남긴다', async () => {
    const files = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, name: `${i}`, createdTime: '' }));
    const f = vi.fn().mockResolvedValueOnce(json(200, { files })).mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', f);
    expect(await pruneBackups('T', 'FOLDER', 3)).toBe(2);
    expect(f.mock.calls.slice(1).map((c) => [c[0], c[1].method])).toEqual([
      ['https://www.googleapis.com/drive/v3/files/f3', 'DELETE'],
      ['https://www.googleapis.com/drive/v3/files/f4', 'DELETE'],
    ]);
  });

  it('Drive API가 꺼져 있으면 무엇을 켜야 하는지 알려준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(403, { error: { message: 'Google Drive API has not been used in project 123 before or it is disabled.' } })));
    await expect(ensureFolder('T')).rejects.toThrow(/Drive API가 꺼져 있어요/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, {})));
    await expect(ensureFolder('T')).rejects.toBeInstanceOf(DriveError);
  });
});
