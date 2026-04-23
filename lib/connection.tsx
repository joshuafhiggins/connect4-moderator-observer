"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_WS_URL,
  ParsedMessage,
  RECONNECT_INTERVAL_MS,
  RECONNECT_TIMEOUT_MS,
  cmd,
  parseMessage,
} from "@/lib/protocol";

export type ConnectionRole = "observer" | "player";
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

type MessageListener = (message: ParsedMessage, raw: string) => void;

interface ConnectOptions {
  role: ConnectionRole;
  wsUrl: string;
  username?: string;
}

interface ConnectionContextValue {
  role: ConnectionRole | null;
  wsUrl: string;
  username: string;
  status: ConnectionStatus;
  isInMatch: boolean;
  shouldGoFirst: boolean;
  isAdmin: boolean;
  reconnectAttempts: number;
  shouldRedirectToConnect: boolean;
  becomePlayer: (username: string) => void;
  authenticateAdmin: (password: string) => boolean;
  connect: (options: ConnectOptions) => void;
  disconnect: () => void;
  send: (message: string) => boolean;
  subscribe: (listener: MessageListener) => () => void;
  clearRedirectFlag: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

interface SessionState {
  role: ConnectionRole;
  wsUrl: string;
  username: string;
}

export function ConnectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [role, setRole] = useState<ConnectionRole | null>(null);
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [isInMatch, setIsInMatch] = useState(false);
  const [shouldGoFirst, setShouldGoFirst] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [shouldRedirectToConnect, setShouldRedirectToConnect] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<MessageListener>>(new Set());
  const manualCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDeadlineRef = useRef<number | null>(null);
  const reconnectActiveRef = useRef(false);
  const isInMatchRef = useRef(false);
  const shouldGoFirstRef = useRef(false);
  const sessionRef = useRef<SessionState | null>(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearReconnectState = useCallback(() => {
    reconnectActiveRef.current = false;
    reconnectDeadlineRef.current = null;
    clearReconnectTimer();
    setReconnectAttempts(0);
  }, [clearReconnectTimer]);

  const emitMessage = useCallback((message: ParsedMessage, raw: string) => {
    listenersRef.current.forEach((listener) => listener(message, raw));
  }, []);

  const safeCloseSocket = useCallback(() => {
    const current = wsRef.current;
    if (!current) return;
    current.onopen = null;
    current.onmessage = null;
    current.onclose = null;
    current.onerror = null;
    try {
      current.close();
    } catch {
      // no-op
    }
    wsRef.current = null;
  }, []);

  const handleDisconnect = useCallback(() => {
    const currentRole = sessionRef.current?.role;

    if (currentRole === "observer") {
      clearReconnectState();
      setStatus("disconnected");
      setShouldRedirectToConnect(true);
      return;
    }

    if (currentRole === "player" && isInMatchRef.current) {
      if (reconnectActiveRef.current) {
        setStatus("reconnecting");
        return;
      }
      reconnectActiveRef.current = true;
      reconnectDeadlineRef.current = Date.now() + RECONNECT_TIMEOUT_MS;
      setStatus("reconnecting");
      setReconnectAttempts(0);
      return;
    }

    clearReconnectState();
    setStatus("disconnected");
    setShouldRedirectToConnect(true);
  }, [clearReconnectState]);

  const attachSocket = useCallback(
    (socket: WebSocket, reconnecting: boolean) => {
      socket.onopen = () => {
        const session = sessionRef.current;
        if (!session) return;

        if (session.role === "observer") {
          socket.send(cmd.observe());
          return;
        }

        if (reconnecting) {
          socket.send(cmd.reconnect(session.username));
        } else {
          socket.send(cmd.connect(session.username));
        }
      };

      socket.onmessage = (event) => {
        const raw = event.data as string;
        if (process.env.NODE_ENV === "development") {
          console.log("Recieved: " + raw);
        }
        const parsed = parseMessage(raw);

        if (parsed.type === "OBSERVE_ACK") {
          setRole("observer");
          setShouldRedirectToConnect(false);
          setStatus("connected");
          setIsAdmin(false);
        }

        if (parsed.type === "CONNECT_ACK") {
          setRole("player");
          setIsAdmin(false);
        }

        if (parsed.type === "RECONNECT_ACK") {
          clearReconnectState();
          setShouldRedirectToConnect(false);
          setStatus("connected");
          setIsAdmin(false);
        }

        if (parsed.type === "DISCONNECT_ACK") {
          setRole("observer");
          setUsername("");
          setIsAdmin(false);
          isInMatchRef.current = false;
          setIsInMatch(false);
        }

        if (parsed.type === "ADMIN_AUTH_ACK") {
          setIsAdmin(true);
        }

        if (parsed.type === "GAME_START") {
          isInMatchRef.current = true;
          setIsInMatch(true);
          shouldGoFirstRef.current = parsed.goesFirst;
          setShouldGoFirst(parsed.goesFirst);
        }

        if (
          parsed.type === "GAME_WINS" ||
          parsed.type === "GAME_LOSS" ||
          parsed.type === "GAME_DRAW" ||
          parsed.type === "GAME_TERMINATED"
        ) {
          isInMatchRef.current = false;
          setIsInMatch(false);
        }

        if (
          parsed.type === "ERROR" &&
          reconnecting &&
          parsed.message.startsWith("ERROR:INVALID:RECONNECT")
        ) {
          safeCloseSocket();
        }

        emitMessage(parsed, raw);
      };

      socket.onclose = () => {
        wsRef.current = null;
        if (manualCloseRef.current) {
          manualCloseRef.current = false;
          return;
        }
        handleDisconnect();
      };

      socket.onerror = () => {
        // Allow close event to drive state transitions.
      };
    },
    [clearReconnectState, emitMessage, handleDisconnect, safeCloseSocket],
  );

  const openSocket = useCallback(
    (reconnecting: boolean) => {
      const session = sessionRef.current;
      if (!session) return;

      safeCloseSocket();
      manualCloseRef.current = false;
      const socket = new WebSocket(session.wsUrl);
      wsRef.current = socket;
      attachSocket(socket, reconnecting);
    },
    [attachSocket, safeCloseSocket],
  );

  useEffect(() => {
    if (!reconnectActiveRef.current) return;

    const runReconnectAttempt = () => {
      if (!reconnectActiveRef.current) return;

      const deadline = reconnectDeadlineRef.current;
      if (!deadline || Date.now() >= deadline) {
        reconnectActiveRef.current = false;
        reconnectDeadlineRef.current = null;
        setStatus("disconnected");
        setShouldRedirectToConnect(true);
        return;
      }

      setReconnectAttempts((prev) => prev + 1);
      openSocket(true);

      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(
        runReconnectAttempt,
        RECONNECT_INTERVAL_MS,
      );
    };

    runReconnectAttempt();

    return () => clearReconnectTimer();
  }, [clearReconnectTimer, openSocket, status]);

  const connect = useCallback(
    ({ role, wsUrl, username }: ConnectOptions) => {
      const resolvedUsername = (username ?? "").trim();
      sessionRef.current = { role, wsUrl, username: resolvedUsername };

      setRole(role);
      setWsUrl(wsUrl);
      setUsername(resolvedUsername);
      setShouldRedirectToConnect(false);
      clearReconnectState();
      isInMatchRef.current = false;
      setIsInMatch(false);
      setIsAdmin(false);
      setStatus("connecting");

      openSocket(false);
    },
    [clearReconnectState, openSocket],
  );

  const send = useCallback((message: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    if (process.env.NODE_ENV === "development") {
      console.log("Sending: " + message);
    }
    wsRef.current.send(message);
    return true;
  }, []);

  const becomePlayer = useCallback(
    (username: string) => {
      const resolvedUsername = (username ?? "").trim();
      setRole("player");
      setUsername(resolvedUsername);
      isInMatchRef.current = false;
      setIsInMatch(false);
      setIsAdmin(false);
      send(cmd.connect(resolvedUsername));
    },
    [send],
  );

  const authenticateAdmin = useCallback(
    (password: string) => {
      const trimmed = password.trim();
      if (!trimmed) return false;
      return send(cmd.adminAuth(trimmed));
    },
    [send],
  );

  const disconnect = useCallback(() => {
    clearReconnectState();
    manualCloseRef.current = true;
    safeCloseSocket();

    sessionRef.current = null;
    setRole(null);
    setStatus("idle");
    setUsername("");
    setIsInMatch(false);
    setIsAdmin(false);
    isInMatchRef.current = false;
    setShouldRedirectToConnect(false);
  }, [clearReconnectState, safeCloseSocket]);

  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const clearRedirectFlag = useCallback(() => {
    setShouldRedirectToConnect(false);
  }, []);

  useEffect(() => {
    return () => {
      clearReconnectState();
      manualCloseRef.current = true;
      safeCloseSocket();
    };
  }, [clearReconnectState, safeCloseSocket]);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      role,
      wsUrl,
      username,
      status,
      isInMatch,
      shouldGoFirst,
      isAdmin,
      reconnectAttempts,
      shouldRedirectToConnect,
      becomePlayer,
      authenticateAdmin,
      connect,
      disconnect,
      send,
      subscribe,
      clearRedirectFlag,
    }),
    [
      role,
      wsUrl,
      username,
      status,
      isInMatch,
      shouldGoFirst,
      isAdmin,
      reconnectAttempts,
      shouldRedirectToConnect,
      becomePlayer,
      authenticateAdmin,
      connect,
      disconnect,
      send,
      subscribe,
      clearRedirectFlag,
    ],
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return context;
}
