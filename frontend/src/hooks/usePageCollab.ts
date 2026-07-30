import { useEffect, useState } from "react";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { getSocket } from "../lib/socket";

function toB64(u8: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode(...u8.subarray(i, i + chunk));
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export interface CollabSession {
  doc: Y.Doc;
  awareness: Awareness;
  /** True when this client should seed the doc from the page's saved content. */
  seed: boolean;
}

interface JoinResponse {
  error?: string;
  state?: string;
  awareness?: string;
  seed?: boolean;
}

// Binds one page to the server-side Y.Doc over Socket.io: applies the initial
// snapshot, then streams incremental CRDT updates both ways. "remote" origins
// prevent echo loops (a received update must not be re-emitted).
export function usePageCollab(pageId: string, password?: string) {
  const [session, setSession] = useState<CollabSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    let active = true;

    const join = (isFirstJoin: boolean) => {
      socket.emit("collab:join", { pageId, password }, (res: JoinResponse) => {
        if (!active) return;
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.state) Y.applyUpdate(doc, fromB64(res.state), "remote");
        if (res.awareness) {
          try {
            applyAwarenessUpdate(awareness, fromB64(res.awareness), "remote");
          } catch {
            // no awareness states yet
          }
        }
        if (isFirstJoin) setSession({ doc, awareness, seed: res.seed ?? false });
      });
    };

    const onLocalUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      socket.emit("collab:update", { pageId, update: toB64(update) });
    };
    doc.on("update", onLocalUpdate);

    const onLocalAwareness = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin === "remote") return;
      const changed = [...added, ...updated, ...removed];
      socket.emit("collab:awareness", { pageId, update: toB64(encodeAwarenessUpdate(awareness, changed)) });
    };
    awareness.on("update", onLocalAwareness);

    const onRemoteUpdate = (msg: { pageId: string; update: string }) => {
      if (msg.pageId === pageId) Y.applyUpdate(doc, fromB64(msg.update), "remote");
    };
    const onRemoteAwareness = (msg: { pageId: string; update: string }) => {
      if (msg.pageId === pageId) applyAwarenessUpdate(awareness, fromB64(msg.update), "remote");
    };
    socket.on("collab:update", onRemoteUpdate);
    socket.on("collab:awareness", onRemoteAwareness);

    // Rejoin after a dropped connection; Yjs merges whatever we missed.
    const onReconnect = () => join(false);
    socket.on("connect", onReconnect);

    if (socket.connected) join(true);
    else socket.once("connect", () => join(true));

    return () => {
      active = false;
      socket.emit("collab:leave", { pageId });
      socket.off("collab:update", onRemoteUpdate);
      socket.off("collab:awareness", onRemoteAwareness);
      socket.off("connect", onReconnect);
      doc.off("update", onLocalUpdate);
      awareness.off("update", onLocalAwareness);
      awareness.destroy();
      doc.destroy();
      setSession(null);
      setError(null);
    };
  }, [pageId, password]);

  return { session, error };
}
