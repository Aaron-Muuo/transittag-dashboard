import mqtt from "mqtt";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
dotenv.config();

const BROKER   = process.env.MQTT_BROKER;
const USERNAME = process.env.MQTT_USERNAME;
const PASSWORD = process.env.MQTT_PASSWORD;
const TOPIC    = process.env.MQTT_TOPIC;
const WS_PORT  = process.env.WS_PORT;

// ── 1. Connect to MQTT broker via TCP ──────────────────────────────────────
console.log(`🔌 Connecting to MQTT broker: ${BROKER}`);

const mqttClient = mqtt.connect(BROKER, {
    username: USERNAME,
    password: PASSWORD,
    clientId: `bridge_${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    reconnectPeriod: 5000,
});

mqttClient.on("connect", () => {
    console.log("✅ Connected to MQTT broker");
    mqttClient.subscribe(TOPIC, { qos: 1 }, (err) => {
        if (err) console.error("❌ Subscribe error:", err.message);
        else console.log(`📡 Subscribed to: ${TOPIC}`);
    });
});

mqttClient.on("error", (err) => console.error("❌ MQTT error:", err.message));
mqttClient.on("reconnect", ()  => console.log("🔄 Reconnecting to broker..."));

// ── 2. Start WebSocket server for the React frontend ───────────────────────
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`🌐 WebSocket bridge running on ws://localhost:${WS_PORT}`);

// ── 3. Forward every MQTT message to all connected browser clients ─────────
mqttClient.on("message", (topic, message) => {
    const payload = message.toString();
    const packet = JSON.stringify({ topic, payload, receivedAt: new Date().toISOString() });

    console.log(`📨 [${topic}] → ${payload}`);

    wss.clients.forEach((ws) => {
        if (ws.readyState === 1) { // 1 = OPEN
            ws.send(packet);
        }
    });
});

wss.on("connection", (ws) => {
    console.log(`🖥️  Browser client connected (total: ${wss.clients.size})`);
    ws.on("close", () => console.log(`🔌 Browser client disconnected (total: ${wss.clients.size})`));
});

// ── 4. Graceful shutdown ───────────────────────────────────────────────────
process.on("SIGINT", () => {
    console.log("\n👋 Shutting down bridge...");
    mqttClient.end(true, () => {
        wss.close(() => { console.log("✅ Done."); process.exit(0); });
    });
});