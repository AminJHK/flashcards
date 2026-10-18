/**
 * Google Drive 백업. drive.file 권한이라 이 앱이 만든 파일만 보고 쓸 수 있다.
 * 백업은 내 Drive의 "플래시카드 백업" 폴더에 JSON 파일로 들어가서, Drive 앱에서도 직접 볼 수 있다.
 */

import { fetchWithTimeout, TimeoutError } from '../net';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER_NAME = '플래시카드 백업';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
}

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }, 30_000);
  } catch (e) {
    throw new DriveError(e instanceof TimeoutError ? e.message : '인터넷에 연결되어 있지 않아요');
  }
  if (res.status === 401) throw new DriveError('Google 로그인이 만료됐어요. 다시 시도해 주세요', 401);
  if (res.status === 403) {
    let msg = '';
    let reason = '';
    try {
      const e = ((await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } }).error;
      msg = e?.message ?? '';
      reason = e?.errors?.[0]?.reason ?? '';
    } catch {
      /* 없음 */
    }
    if (/not been used|disabled|accessNotConfigured/i.test(`${msg} ${reason}`)) throw new DriveError('Google Drive API가 꺼져 있어요. 안내 2단계(Drive API 사용)를 확인해 주세요 (안드로이드 앱이면 안드로이드 클라이언트를 만든 프로젝트에서 켜요)', 403);
    // 로그인 때 Drive 항목을 체크하지 않으면 토큰에 Drive 권한이 없다 (권한 화면에 항목별 체크 칸이 있다)
    if (/insufficient|scope/i.test(`${msg} ${reason}`)) throw new DriveError('로그인할 때 Drive 항목을 체크하지 않았어요. Google 계정 › 보안 › 타사 앱 연결에서 이 앱을 삭제한 뒤 다시 로그인하고, Drive 항목을 꼭 체크해 주세요', 403);
    // 원인을 알 수 있게 Google이 알려 준 내용을 그대로 붙인다
    throw new DriveError(`Drive를 쓸 권한이 없어요${msg || reason ? ` (${(msg || reason).slice(0, 120)})` : ''}`, 403);
  }
  if (!res.ok) throw new DriveError(`Drive 오류 (${res.status})`, res.status);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>;
}

/** 백업 폴더를 찾고, 없으면 만든다. */
export async function ensureFolder(token: string, knownId?: string): Promise<string> {
  if (knownId) {
    try {
      const f = await call<{ id: string; trashed?: boolean }>(token, `${API}/files/${knownId}?fields=id,trashed`);
      if (!f.trashed) return f.id;
    } catch (e) {
      if (!(e instanceof DriveError) || e.status !== 404) throw e;
    }
  }
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`);
  const found = await call<{ files: { id: string }[] }>(token, `${API}/files?q=${q}&fields=files(id)&pageSize=1`);
  if (found.files[0]) return found.files[0].id;
  const made = await call<{ id: string }>(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  return made.id;
}

export async function uploadJson(token: string, folderId: string, name: string, text: string): Promise<DriveFile> {
  const boundary = `flashcards${Math.random().toString(36).slice(2)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    text +
    `\r\n--${boundary}--`;
  return call<DriveFile>(token, `${UPLOAD}/files?uploadType=multipart&fields=id,name,createdTime,size`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

/** 백업 파일 목록 (동기화 파일은 빼고, 최신순) */
export async function listBackups(token: string, folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/json'`);
  const r = await call<{ files: DriveFile[] }>(token, `${API}/files?q=${q}&orderBy=createdTime desc&pageSize=50&fields=files(id,name,createdTime,size)`);
  return r.files.filter((f) => f.name.startsWith('flashcards-backup-'));
}

/** 폴더 안에서 이름으로 파일을 찾는다 */
export async function findFile(token: string, folderId: string, name: string): Promise<DriveFile | undefined> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and name='${name}'`);
  const r = await call<{ files: DriveFile[] }>(token, `${API}/files?q=${q}&pageSize=1&fields=files(id,name,createdTime,size)`);
  return r.files[0];
}

/** 이미 있는 파일의 내용을 바꾼다 */
export async function updateText(token: string, fileId: string, text: string): Promise<void> {
  await call<unknown>(token, `${UPLOAD}/files/${fileId}?uploadType=media&fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  });
}

export function downloadText(token: string, fileId: string): Promise<string> {
  return call<string>(token, `${API}/files/${fileId}?alt=media`).then((t) => (typeof t === 'string' ? t : JSON.stringify(t)));
}

/** 오래된 백업은 지운다 (최근 keep개만 남긴다). */
export async function pruneBackups(token: string, folderId: string, keep: number): Promise<number> {
  const files = await listBackups(token, folderId);
  const old = files.slice(keep);
  for (const f of old) await call<void>(token, `${API}/files/${f.id}`, { method: 'DELETE' });
  return old.length;
}

export async function userEmail(token: string): Promise<string | undefined> {
  try {
    const r = await call<{ email?: string }>(token, 'https://www.googleapis.com/oauth2/v3/userinfo');
    return r.email;
  } catch {
    return undefined;
  }
}
