import mqtt from "mqtt";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import { startSimulator } from "./gpsSimulator.js"; // ← comment out to disable
dotenv.config();

const BROKER  = process.env.MQTT_BROKER;
const USERNAME= process.env.MQTT_USERNAME;
const PASSWORD= process.env.MQTT_PASSWORD;
const TOPIC   = process.env.MQTT_TOPIC;
const WS_PORT = process.env.WS_PORT;

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
        else     console.log(`📡 Subscribed to: ${TOPIC}`);
    });
});

mqttClient.on("error",     (err) => console.error("❌ MQTT error:", err.message));
mqttClient.on("reconnect", ()    => console.log("🔄 Reconnecting to broker..."));

// ── 2. Start WebSocket server for the React frontend ───────────────────────
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`🌐 WebSocket bridge running on ws://localhost:${WS_PORT}`);

// ── 3. Broadcast helper — sends a packet to all connected browser clients ──
const broadcast = (topic, payload) => {
    const packet = JSON.stringify({
        topic,
        payload,
        receivedAt: new Date().toISOString(),
    });
    wss.clients.forEach((ws) => {
        if (ws.readyState === 1) ws.send(packet);
    });
};

// ── 4. Forward every real MQTT message to the browser ──────────────────────
mqttClient.on("message", (topic, message) => {
    const payload = message.toString();
    console.log(`📨 [${topic}] → ${payload}`);
    broadcast(topic, payload);
});

wss.on("connection", (ws) => {
    console.log(`🖥️  Browser client connected (total: ${wss.clients.size})`);
    ws.on("close", () =>
        console.log(`🔌 Browser client disconnected (total: ${wss.clients.size})`)
    );
});

// ── 5. GPS Simulator ────────────────────────────────────────────────────────
// Passes the broadcast function so simulated packets go through
// the same pipeline as real MQTT messages.
//
// To disable simulation:
//   - Comment out the import at the top of this file
//   - Comment out the line below
// ───────────────────────────────────────────────────────────────────────────
startSimulator(broadcast); // ← comment out to disable GPS simulation

// ── 6. Graceful shutdown ───────────────────────────────────────────────────
process.on("SIGINT", () => {
    console.log("\n👋 Shutting down bridge...");
    mqttClient.end(true, () => {
        wss.close(() => {
            console.log("✅ Done.");
            process.exit(0);
        });
    });
});