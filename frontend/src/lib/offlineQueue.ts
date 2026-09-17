export interface QueuedRequest {
  id: string;
  method: string;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  timestamp: number;
}

const STORAGE_KEY = "hollow.offlineQueue";

type QueueListener = (count: number, isSyncing: boolean) => void;
const listeners = new Set<QueueListener>();
let isSyncing = false;

function notify() {
  const count = getQueue().length;
  listeners.forEach((l) => l(count, isSyncing));
}

export function subscribeOfflineStatus(listener: QueueListener) {
  listeners.add(listener);
  listener(getQueue().length, isSyncing);
  return () => {
    listeners.delete(listener);
  };
}

export function getQueue(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function enqueueRequest(req: Omit<QueuedRequest, "id" | "timestamp">) {
  const queue = getQueue();
  const item: QueuedRequest = {
    ...req,
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  queue.push(item);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // quota
  }
  notify();
}

export async function replayOfflineQueue(
  sendFn: (req: QueuedRequest) => Promise<unknown>,
  onSuccess?: () => void
) {
  if (isSyncing) return;
  const queue = getQueue();
  if (queue.length === 0) return;

  isSyncing = true;
  notify();

  try {
    while (queue.length > 0) {
      const next = queue[0];
      try {
        await sendFn(next);
        queue.shift();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
        notify();
      } catch (err: any) {
        // If still offline or network error, stop replaying until next online event
        if (!navigator.onLine || !err.response) {
          break;
        }
        // If server rejected with 4xx/5xx (e.g. invalid entity), drop this item so queue doesn't stay blocked forever
        queue.shift();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
        notify();
      }
    }
    onSuccess?.();
  } finally {
    isSyncing = false;
    notify();
  }
}

export function initWebOfflineSync(
  sendFn: (req: QueuedRequest) => Promise<unknown>,
  onSuccess?: () => void
) {
  const onOnline = () => {
    void replayOfflineQueue(sendFn, onSuccess);
  };

  const onOffline = () => {
    notify();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  // If already online, try replaying any pending items left from a previous offline session
  if (navigator.onLine) {
    void replayOfflineQueue(sendFn, onSuccess);
  }

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
