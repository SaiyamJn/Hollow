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
  /** True when we fell back to local editing (socket/collab unavailable). */
  localOnly?: boolean;
}

interface JoinResponse {
  error?: string;
  state?: string;
  awareness?: string;
  seed?: boolean;
}

const JOIN_TIMEOUT_MS = 3500;

function isHardJoinError(msg: string | undefined) {
  if (!msg) return false;
  return (
    msg === "Not found" ||
    msg === "Section is locked" ||
    msg === "Incorrect section password" ||
    /unauthorized/i.test(msg)
  );
}

// Binds one page to the server-side Y.Doc over Socket.io. If the socket or join
// stalls, we fall back to a local doc so the page still opens from REST content.
export function usePageCollab(pageId: string, password?: string) {
  const [session, setSession] = useState<CollabSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    let active = true;
    let published = false;
    const timers = new Set<number>();

    const clearTimers = () => {
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
    };

    const publish = (seed: boolean, localOnly = false) => {
      if (!active || published) return;
      published = true;
      clearTimers();
      setSession({ doc, awareness, seed, localOnly });
    };

    const applyJoinPayload = (res: JoinResponse) => {
      if (res.state) Y.applyUpdate(doc, fromB64(res.state), "remote");
      if (res.awareness) {
        try {
          applyAwarenessUpdate(awareness, fromB64(res.awareness), "remote");
        } catch {
          // no awareness states yet
        }
      }
    };

    const join = (isFirstJoin: boolean) => {
      const failOpen = () => {
        if (isFirstJoin) publish(true, true);
      };

      const timer = window.setTimeout(failOpen, JOIN_TIMEOUT_MS);
      timers.add(timer);

      const onAck = (err: Error | null, res: JoinResponse) => {
        timers.delete(timer);
        window.clearTimeout(timer);
        if (!active) return;

        if (err) {
          failOpen();
          return;
        }
        if (res?.error) {
          if (isHardJoinError(res.error)) {
            setError(res.error);
            return;
          }
          failOpen();
          return;
        }

        applyJoinPayload(res ?? {});
        if (isFirstJoin) publish(res?.seed ?? false, false);
      };

      // socket.io v4 ack timeout — falls through to failOpen if the server never replies
      try {
        (socket as any).timeout(JOIN_TIMEOUT_MS).emit(
          "collab:join",
          { pageId, password },
          (err: Error | null, res: JoinResponse) => onAck(err, res)
        );
      } catch {
        socket.emit("collab:join", { pageId, password }, (res: JoinResponse) => onAck(null, res));
      }
    };

    const onLocalUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      if (!socket.connected) return;
      socket.emit("collab:update", { pageId, update: toB64(update) });
    };
    doc.on("update", onLocalUpdate);

    const onLocalAwareness = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin === "remote") return;
      if (!socket.connected) return;
      const changed = [...added, ...updated, ...removed];
      socket.emit("collab:awareness", {
        pageId,
        update: toB64(encodeAwarenessUpdate(awareness, changed)),
      });
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

    const onReconnect = () => join(false);

    const onConnectError = () => {
      // Don't block the page on auth/transport failures — edit locally from REST.
      publish(true, true);
    };
    socket.on("connect_error", onConnectError);

    if (socket.connected) {
      join(true);
      socket.on("connect", onReconnect);
    } else {
      if (!socket.connected) socket.connect();
      const wait = window.setTimeout(() => publish(true, true), JOIN_TIMEOUT_MS);
      timers.add(wait);
      socket.once("connect", () => {
        timers.delete(wait);
        window.clearTimeout(wait);
        if (!published) join(true);
        // Rejoins after a later drop; avoid double-join on this first connect.
        socket.on("connect", onReconnect);
      });
    }

    return () => {
      active = false;
      clearTimers();
      socket.emit("collab:leave", { pageId });
      socket.off("collab:update", onRemoteUpdate);
      socket.off("collab:awareness", onRemoteAwareness);
      socket.off("connect", onReconnect);
      socket.off("connect_error", onConnectError);
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
