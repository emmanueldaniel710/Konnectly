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
}

const rooms = new Map<string, Room>();

// Periodically clean up offline rooms (older than 2 hours or no listeners)
setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    if (!room.host && !room.guest) {
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

// Room status check
app.get("/api/rooms/:code/status", (req: Request, res: Response) => {
  const { code } = req.params;
  const room = rooms.get(code.toUpperCase());
  if (!room) {
    res.status(404).json({ exists: false });
    return;
  }
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
    if (peerId === "host") {
      // Create room dynamically if host connects or reconnects
      room = { code: roomCode, host: null, guest: null, history: [] };
      rooms.set(roomCode, room);
    } else {
      res.status(404).write("Room not found");
      res.end();
      return;
    }
  }

  // Set headers for SSE stream
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
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

      // If everyone is gone, delete the room in 10 seconds unless they reconnect
      setTimeout(() => {
        const activeRoom = rooms.get(roomCode);
        if (activeRoom && !activeRoom.host && !activeRoom.guest) {
          rooms.delete(roomCode);
        }
      }, 10000);
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
  const room = rooms.get(code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
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
