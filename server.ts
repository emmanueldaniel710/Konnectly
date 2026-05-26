import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { VALID_CODES } from "./src/codes.js";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" })); // Increase limit to support large photos of any kind
app.use(express.urlencoded({ limit: "50mb", extended: true }));

interface Message {
  id: string;
  sender: string;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  color: string;
  timestamp: string;
  isMe?: boolean;
}

interface Client {
  peerId: "host" | "guest";
  name: string;
  color: string;
  initial: string;
  res: Response;
  isTyping: boolean;
}

interface Room {
  code: string;
  host: Client | null;
  guest: Client | null;
  history: Message[];
  lastActive: number;
}

const rooms = new Map<string, Room>();

// Periodically clean up offline rooms (completely inactive/empty for over 2 hours)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (!room.host && !room.guest && (now - room.lastActive > 7200000)) {
      rooms.delete(code);
    }
  }
}, 60000);

// Validate Access Code API (optional fallback, client-side is main)
app.post("/api/validate-code", (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ valid: false, error: "Code is required" });
    return;
  }
  const codeStr = String(code).trim();
  const valid = VALID_CODES.has(codeStr);
  res.json({ valid });
});

// Explicit Room Registration Endpoint
app.post("/api/rooms/:code/create", (req: Request, res: Response) => {
  const { code } = req.params;
  const roomCode = code.toUpperCase();
  let room = rooms.get(roomCode);
  if (!room) {
    room = { code: roomCode, host: null, guest: null, history: [], lastActive: Date.now() };
    rooms.set(roomCode, room);
  } else {
    room.lastActive = Date.now();
  }
  res.json({ success: true, code: roomCode });
});

// Room status check
app.get("/api/rooms/:code/status", (req: Request, res: Response) => {
  const { code } = req.params;
  const roomCode = code.toUpperCase();
  let room = rooms.get(roomCode);
  if (!room) {
    // Proactively initialize the ephemeral room to handle multi-host container edge-cases and eliminate race conditions
    room = { code: roomCode, host: null, guest: null, history: [], lastActive: Date.now() };
    rooms.set(roomCode, room);
  }
  room.lastActive = Date.now();
  res.json({
    exists: true,
    hasHost: !!room.host,
    hasGuest: !!room.guest,
  });
});

// Real-time Event Stream (Server-Sent Events)
app.get("/api/rooms/:code/stream", (req: Request, res: Response) => {
  const { code } = req.params;
  const peerId = req.query.peerId as "host" | "guest";
  const name = (req.query.name as string) || "Anonymous";
  const color = (req.query.color as string) || "#4d8bff";
  const initial = name.charAt(0).toUpperCase();

  if (!peerId || (peerId !== "host" && peerId !== "guest")) {
    res.status(400).write("Invalid peerId");
    res.end();
    return;
  }

  const roomCode = code.toUpperCase();
  let room = rooms.get(roomCode);

  if (!room) {
    // Proactively initialize the ephemeral room for host or guest to make connection 100% resilient
    room = { code: roomCode, host: null, guest: null, history: [], lastActive: Date.now() };
    rooms.set(roomCode, room);
  }

  room.lastActive = Date.now();

  // Set headers for SSE stream with buffering bypass and absolute non-cache controls
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Client connection object
  const client: Client = {
    peerId,
    name,
    color,
    initial,
    res,
    isTyping: false,
  };

  if (peerId === "host") {
    if (room.host) {
      try { room.host.res.end(); } catch (e) {}
    }
    room.host = client;
  } else {
    if (room.guest) {
      try { room.guest.res.end(); } catch (e) {}
    }
    room.guest = client;
  }

  // Helper to send events
  const sendEvent = (resObj: Response, type: string, data: any) => {
    try {
      resObj.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    } catch (e) {}
  };

  // Welcome event
  sendEvent(res, "welcome", { peerId, roomCode });

  // If both connected, notify both parties in order to sync profiles
  if (room.host && room.guest) {
    sendEvent(room.host.res, "partner_connected", {
      name: room.guest.name,
      color: room.guest.color,
      initial: room.guest.initial,
    });
    sendEvent(room.guest.res, "partner_connected", {
      name: room.host.name,
      color: room.host.color,
      initial: room.host.initial,
    });
  }

  // Standard keep alive ping every 10 seconds to satisfy Cloud Run standard idle rules
  const pingInterval = setInterval(() => {
    try {
      res.write(":\n\n");
    } catch (e) {}
  }, 10000);

  req.on("close", () => {
    clearInterval(pingInterval);
    if (room) {
      if (peerId === "host") {
        room.host = null;
        if (room.guest) {
          sendEvent(room.guest.res, "partner_disconnected", {});
        }
      } else {
        room.guest = null;
        if (room.host) {
          sendEvent(room.host.res, "partner_disconnected", {});
        }
      }
    }
  });
});

// Relaying messages, payloads, actions
app.post("/api/rooms/:code/send", (req: Request, res: Response) => {
  const { code } = req.params;
  const { peerId, message, imageUrl, audioUrl, name, color, timestamp } = req.body;
  const roomCode = code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  room.lastActive = Date.now();

  const msgId = "msg_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const msgObj: Message = {
    id: msgId,
    sender: name,
    text: message,
    imageUrl,
    audioUrl,
    color,
    timestamp,
  };

  // Add to scroll backlog
  room.history.push(msgObj);
  if (room.history.length > 100) room.history.shift();

  // Send to target peer
  const target = peerId === "host" ? room.guest : room.host;
  if (target) {
    try {
      target.res.write(`data: ${JSON.stringify({ type: "chat", data: msgObj })}\n\n`);
    } catch (e) {}
  }

  res.json({ success: true, messageId: msgId });
});

// typing indicator status update
app.post("/api/rooms/:code/typing", (req: Request, res: Response) => {
  const { code } = req.params;
  const { peerId, isTyping } = req.body;
  const roomCode = code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  room.lastActive = Date.now();

  const sender = peerId === "host" ? room.host : room.guest;
  if (sender) {
    sender.isTyping = !!isTyping;
  }

  const target = peerId === "host" ? room.guest : room.host;
  if (target) {
    try {
      target.res.write(`data: ${JSON.stringify({ type: "typing", isTyping: !!isTyping })}\n\n`);
    } catch (e) {}
  }

  res.json({ success: true });
});

// typing profile status syncs dynamically
app.post("/api/rooms/:code/profile", (req: Request, res: Response) => {
  const { code } = req.params;
  const { peerId, name, color } = req.body;
  const roomCode = code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  room.lastActive = Date.now();

  const sender = peerId === "host" ? room.host : room.guest;
  if (sender) {
    sender.name = name;
    sender.color = color;
    sender.initial = name.charAt(0).toUpperCase();
  }

  const target = peerId === "host" ? room.guest : room.host;
  if (target) {
    try {
      target.res.write(
        `data: ${JSON.stringify({
          type: "profile",
          data: { name, color, initial: name.charAt(0).toUpperCase() },
        })}\n\n`
      );
    } catch (e) {}
  }

  res.json({ success: true });
});

// Seen status relay
app.post("/api/rooms/:code/seen", (req: Request, res: Response) => {
  const { code } = req.params;
  const { peerId, isSeen } = req.body;
  const roomCode = code.toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  room.lastActive = Date.now();

  const target = peerId === "host" ? room.guest : room.host;
  if (target) {
    try {
      target.res.write(
        `data: ${JSON.stringify({
          type: "seen",
          isSeen: !!isSeen,
        })}\n\n`
      );
    } catch (e) {}
  }

  res.json({ success: true });
});

// Fetch Room Backlog (History)
app.get("/api/rooms/:code/history", (req: Request, res: Response) => {
  const { code } = req.params;
  const roomCode = code.toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) {
    res.json([]);
    return;
  }
  room.lastActive = Date.now();
  res.json(room.history);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite middleware setup
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets compiled to dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Konnectly Server] Running at http://localhost:${PORT}`);
  });
}

startServer();
