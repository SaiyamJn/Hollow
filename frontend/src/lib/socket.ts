import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../stores/auth";

// One Socket.io connection for the whole app. The JWT rides in the handshake
// (socket.io `auth`), mirroring the Authorization header on REST calls; the
// auth callback re-reads the store so reconnects always use the latest token.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // REST uses VITE_API_URL (often "/api"). Socket.io must hit the site origin
    // so Nginx can upgrade /socket.io/ — strip a trailing /api if present.
    const raw = import.meta.env.VITE_API_URL as string | undefined;
    const base =
      !raw || raw.startsWith("/")
        ? window.location.origin
        : raw.replace(/\/api\/?$/, "");
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
