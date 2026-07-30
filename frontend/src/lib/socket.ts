import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../stores/auth";

// One Socket.io connection for the whole app. The JWT rides in the handshake
// (socket.io `auth`), mirroring the Authorization header on REST calls; the
// auth callback re-reads the store so reconnects always use the latest token.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const base = import.meta.env.VITE_API_URL ?? window.location.origin;
    socket = io(base, {
      auth: (cb) => cb({ token: useAuthStore.getState().token }),
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
