import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());

// HTTP Routes
app.get('/', (req, res) => res.send('Robby Robot Backend Running ✅'));
app.get('/health', (req, res) => res.status(200).send('OK'));

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ====================== WEBSOCKET WITH SPECIFIC PATH ======================
const wss = new WebSocketServer({ 
  server,
  path: "/robby-ws"        // ← This is the path we are setting
});

const devices = new Map();
const controllers = new Set();

wss.on('connection', (ws, req) => {
  console.log(`New client connected on path: ${req.url}`);

  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);

      if (msg.type === 'identify' && msg.client === 'device') {
        devices.set(msg.deviceId, ws);
        ws.deviceId = msg.deviceId;
        console.log(`Device registered: ${msg.deviceId}`);
        return;
      }

      if (msg.type === 'telemetry') {
        controllers.forEach(client => {
          if (client.readyState === 1) client.send(JSON.stringify(msg));
        });
        return;
      }

      if (msg.type === 'control' && msg.deviceId) {
        const device = devices.get(msg.deviceId);
        if (device && device.readyState === 1) {
          device.send(JSON.stringify(msg));
          console.log(`Command to ${msg.deviceId}: ${msg.command}`);
        }
      }
    } catch (err) {
      console.error("Message error:", err);
    }
  });

  ws.on('close', () => {
    if (ws.deviceId) devices.delete(ws.deviceId);
    controllers.delete(ws);
  });

  controllers.add(ws);
});

console.log("Robby WebSocket Server Started on path /robby-ws");