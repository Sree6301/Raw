import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { loadPersistedState } from './state.js';
import { createRouter } from './routes.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const app = express();
const server = http.createServer(app);

// CORS configuration - allow Customer Web, Admin Dashboard, and Windows Agent
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-guest-session-token', 'x-agent-key']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Determine RAW_Inputs root directory (shared across backend and Windows Agent)
let rawInputsDir = path.resolve(process.cwd(), 'RAW_Inputs');
if (!fs.existsSync(rawInputsDir)) {
  const parentRaw = path.resolve(process.cwd(), '..', 'RAW_Inputs');
  if (fs.existsSync(parentRaw)) {
    rawInputsDir = parentRaw;
  } else {
    fs.mkdirSync(rawInputsDir, { recursive: true });
  }
}

// Ensure subfolders exist
const userUploadsDir = path.join(rawInputsDir, 'User_Uploads');
const scansDir = path.join(rawInputsDir, 'Scans');
const duplexDir = path.join(rawInputsDir, 'Duplex');

[userUploadsDir, scansDir, duplexDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Statically serve RAW_Inputs via /uploads URL prefix for web & mobile clients
app.use('/uploads/documents', express.static(userUploadsDir));
app.use('/uploads/photos', express.static(userUploadsDir));
app.use('/uploads/scans', express.static(scansDir));
app.use('/uploads/duplex', express.static(duplexDir));
app.use('/uploads', express.static(rawInputsDir));

// WebSocket Server for instant real-time sync with Windows Agent and Web Dashboards
const wss = new WebSocketServer({ server, path: '/ws' });
const connectedClients = new Set<WebSocket>();

export interface AgentStatus {
  connected: boolean;
  agentName: string;
  activePrinter: string;
  port: string;
  lastSeen: string;
}

export const currentAgentStatus: AgentStatus = {
  connected: false,
  agentName: 'Smart Xerox Hub Windows Agent',
  activePrinter: 'HP Smart Tank 580-590 series',
  port: 'USB001',
  lastSeen: ''
};

wss.on('connection', (ws) => {
  connectedClients.add(ws);
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: 'Smart Xerox Hub Realtime Connected',
    agentStatus: currentAgentStatus
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'AGENT_REGISTER' || msg.type === 'AGENT_HEARTBEAT') {
        currentAgentStatus.connected = true;
        currentAgentStatus.agentName = msg.agentName || currentAgentStatus.agentName;
        currentAgentStatus.activePrinter = msg.activePrinter || currentAgentStatus.activePrinter;
        currentAgentStatus.port = msg.port || currentAgentStatus.port;
        currentAgentStatus.lastSeen = new Date().toISOString();
        (ws as any).isAgent = true;
        broadcastEvent('AGENT_STATUS', currentAgentStatus);
      }
    } catch {}
  });

  ws.on('close', () => {
    connectedClients.delete(ws);
    if ((ws as any).isAgent) {
      currentAgentStatus.connected = false;
      currentAgentStatus.lastSeen = new Date().toISOString();
      broadcastEvent('AGENT_STATUS', currentAgentStatus);
    }
  });
});

export function broadcastEvent(type: string, payload: any) {
  const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// State & Router
const state = loadPersistedState();
const router = createRouter(state, broadcastEvent, rawInputsDir, () => currentAgentStatus);

app.use('/api', router);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'Smart Xerox Hub Backend',
    activeSessions: state.guestSessions.size,
    totalPrintOrders: state.printOrders.size,
    agentStatus: currentAgentStatus,
    rawInputsDirectory: rawInputsDir,
    timestamp: new Date().toISOString()
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` SMART XEROX HUB - BACKEND SERVER RUNNING`);
  console.log(` HTTP API: http://localhost:${PORT}/api`);
  console.log(` Realtime WebSocket: ws://localhost:${PORT}/ws`);
  console.log(` RAW_Inputs Directory: ${rawInputsDir}`);
  console.log(`=======================================================`);
});
