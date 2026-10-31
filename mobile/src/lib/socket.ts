import { io, Socket } from "socket.io-client";
import { API_URL, getApiToken } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const base = API_URL.replace(/\/api\/?$/, "");
    socket = io(base, {
      auth: (cb) => cb({ token: getApiToken() }),
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      autoConnect: true,
    });
  } else if (socket.disconnected) {
    socket.connect();
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

