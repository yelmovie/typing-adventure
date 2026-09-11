import { ensureUpdateRegistration } from '../ui/UpdateNotice';

/** Explicit, resumable offline preparation. Cache entries are shared with the service worker. */
type ManifestAsset = { url: string; bytes: number; revision: string };
type ClassroomManifest = { version: string; cacheName: string; assets: ManifestAsset[] };
export type ClassroomStatus = {
  state: 'idle' | 'checking' | 'downloading' | 'ready' | 'incomplete' | 'unsupported';
  completed: number; total: number; bytes: number; totalBytes: number;
  missing: string[]; message: string;
};
const MANIFEST_CACHE = 'typing-classroom-manifest';
const MANIFEST_URL = './classroom-manifest.json';
const baseStatus = (): ClassroomStatus => ({ state: 'idle', completed: 0, total: 0, bytes: 0, totalBytes: 0, missing: [], message: '수업 자료를 확인해 줘.' });
const urlOf = (path: string) => new URL(path, document.baseURI).href;

class ClassroomReadyImpl {
  private active?: Promise<ClassroomStatus>;

  private supported() { return 'caches' in window && 'serviceWorker' in navigator; }

  private async manifest(): Promise<ClassroomManifest> {
    const cache = await caches.open(MANIFEST_CACHE);
    let response: Response | undefined;
    try {
      response = await fetch(MANIFEST_URL, { cache: 'no-cache', signal: AbortSignal.timeout(12000) });
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error('manifest');
      await cache.put(urlOf(MANIFEST_URL), response.clone());
    } catch { response = await cache.match(urlOf(MANIFEST_URL)); }
    if (!response) throw new Error('온라인으로 앱을 연 뒤 자료를 준비해 줘.');
    const manifest = await response.json() as ClassroomManifest;
    if (!Array.isArray(manifest.assets) || !manifest.assets.length || !manifest.cacheName?.startsWith('typing-classroom-')) throw new Error('수업 자료 목록을 확인하지 못했어.');
    return manifest;
  }

  async inspect(): Promise<ClassroomStatus> { return this.verify(); }

  async verify(): Promise<ClassroomStatus> {
    if (!this.supported()) return { ...baseStatus(), state: 'unsupported', message: '이 브라우저에서는 오프라인 준비를 사용할 수 없어.' };
    try { return await this.check(await this.manifest()); }
    catch (error) { return { ...baseStatus(), state: 'incomplete', message: error instanceof Error ? error.message : '수업 자료를 확인하지 못했어.' }; }
  }

  private async check(manifest: ClassroomManifest): Promise<ClassroomStatus> {
    const cache = await caches.open(manifest.cacheName);
    const status = baseStatus();
    status.total = manifest.assets.length;
    status.totalBytes = manifest.assets.reduce((sum, item) => sum + item.bytes, 0);
    for (const asset of manifest.assets) {
      const response = await cache.match(urlOf(asset.url));
      if (response?.ok && response.headers.get('x-classroom-revision') === asset.revision) {
        status.completed++;
        status.bytes += asset.bytes;
      } else status.missing.push(asset.url);
    }
    status.state = status.missing.length ? 'incomplete' : 'ready';
    status.message = status.state === 'ready'
      ? '수업 준비 완료! 이 브라우저에서 모든 지역과 완주 영상을 오프라인으로 이용할 수 있어.'
      : `${status.total - status.completed}개 자료를 더 받으면 수업 준비가 끝나.`;
    return status;
  }

  prepare(onProgress?: (status: ClassroomStatus) => void, signal?: AbortSignal): Promise<ClassroomStatus> {
    if (this.active) return this.active;
    this.active = this.download(onProgress, signal).finally(() => { this.active = undefined; });
    return this.active;
  }

  private async download(onProgress?: (status: ClassroomStatus) => void, signal?: AbortSignal): Promise<ClassroomStatus> {
    if (!this.supported()) return this.verify();
    let status = baseStatus();
    try {
      await ensureUpdateRegistration();
      // A controlled page is essential: CacheStorage alone cannot answer offline HTTP requests.
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('앱 준비 중이야. 잠시 뒤 다시 눌러 줘.')), 12000)),
      ]);
      if (!registration.active) throw new Error('앱을 새로 열고 다시 준비해 줘.');
      const manifest = await this.manifest();
      status = await this.check(manifest);
      status.state = 'downloading';
      onProgress?.({ ...status });
      const pending = manifest.assets.filter((asset) => status.missing.includes(asset.url));
      const cache = await caches.open(manifest.cacheName);
      // Three simultaneous transfers keep progress responsive without flooding a classroom router.
      let next = 0;
      const outcomes = await Promise.allSettled(Array.from({ length: Math.min(3, pending.length) }, async () => {
        while (next < pending.length) {
          if (signal?.aborted) throw new DOMException('취소', 'AbortError');
          const asset = pending[next++];
          const requestAbort = new AbortController();
          const cancel = () => requestAbort.abort();
          signal?.addEventListener('abort', cancel, { once: true });
          const timeout = setTimeout(cancel, 45000);
          let response: Response;
          let buffer: ArrayBuffer;
          try {
            const downloadUrl = new URL(asset.url, document.baseURI);
            // Explicit downloads bypass runtime writes so the verified canonical entry cannot race a SW cache.put.
            downloadUrl.searchParams.set('classroom-download', asset.revision);
            response = await fetch(downloadUrl, { cache: 'no-cache', signal: requestAbort.signal });
            buffer = await response.arrayBuffer();
          } finally {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', cancel);
          }
          if (!response.ok || response.status === 206) throw new Error('일부 자료를 받지 못했어. 다시 누르면 이어서 받을 수 있어.');
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((b) => b.toString(16).padStart(2, '0')).join('');
          if (hash !== asset.revision) throw new Error('앱이 업데이트되었어. 새로고침 후 다시 준비해 줘.');
          const headers = new Headers(response.headers);
          headers.delete('content-encoding');
          // These same-origin static bytes are SHA-verified. A server's Vary: Origin
          // would make CSS font requests miss the explicit download's cache entry.
          headers.delete('vary');
          headers.set('content-length', String(buffer.byteLength));
          headers.set('x-classroom-revision', asset.revision);
          await cache.put(urlOf(asset.url), new Response(buffer, { status: 200, headers }));
          status.completed++;
          status.bytes += asset.bytes;
          status.message = `수업 자료 받는 중 ${status.completed}/${status.total}`;
          onProgress?.({ ...status });
        }
      }));
      const failure = outcomes.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      // Request durable storage where available; refusal does not claim permanent storage.
      await navigator.storage?.persist?.().catch(() => false);
      status = await this.check(manifest);
      if (!navigator.serviceWorker.controller) status.message += ' 처음 준비한 브라우저라면 한 번 새로고침해 줘.';
      onProgress?.(status);
      return status;
    } catch (error) {
      status.state = 'incomplete';
      status.message = signal?.aborted ? '준비를 멈췄어. 다시 누르면 이어서 받을 수 있어.'
        : error instanceof Error ? error.message : '저장 공간이나 인터넷을 확인한 뒤 다시 준비해 줘.';
      onProgress?.({ ...status });
      return status;
    }
  }
}

export const ClassroomReady = new ClassroomReadyImpl();
