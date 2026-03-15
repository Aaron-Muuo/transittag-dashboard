import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Fix Leaflet icon paths (broken by Vite) ─────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const NAIROBI    = [-1.2921, 36.8219];
const PIN_COLORS = ["#0ea5e9","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];

const makeIcon = (color, isMoving, hasAlarm) => L.divIcon({
    className: "",
    html: `<div style="position:relative;width:32px;height:32px">
    ${isMoving ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${color};opacity:0.4;animation:ripple 1.5s infinite"></div>` : ""}
    <div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${hasAlarm ? "#ef4444" : color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
      <span style="transform:rotate(45deg);font-size:13px">${hasAlarm ? "🚨" : "🚌"}</span>
    </div></div>`,
    iconSize: [32,32], iconAnchor: [16,32], popupAnchor: [0,-36],
});

const getTopicType = (t) => {
    if (t.includes("/heartbeat/")) return "heartbeat";
    if (t.includes("/wifi/"))      return "wifi";
    if (t.includes("/rfid/"))      return "rfid";
    if (t.includes("/login/"))     return "login";
    return "unknown";
};

const timeSince = (d) => {
    if (!d) return "—";
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
    bg: "#f1f5f9", surface: "#ffffff", surface2: "#f8fafc",
    border: "#e2e8f0", border2: "#cbd5e1",
    text: "#0f172a", text2: "#475569", text3: "#94a3b8",
    topbar: "#0f172a", accent: "#0ea5e9",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const BatteryBar = ({ level }) => {
    const pct = Math.min(100, Math.max(0, level));
    const color = pct > 50 ? "#16a34a" : pct > 20 ? "#d97706" : "#dc2626";
    return (
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:44, height:20, border:`2px solid ${color}`, borderRadius:3, position:"relative", display:"flex", alignItems:"center", padding:"2px" }}>
                <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:2, transition:"width 0.5s" }}/>
                <div style={{ position:"absolute", right:-5, top:"50%", transform:"translateY(-50%)", width:3, height:8, background:color, borderRadius:"0 2px 2px 0" }}/>
            </div>
            <span style={{ color, fontWeight:700, fontSize:12 }}>{pct}%</span>
        </div>
    );
};

const SignalBars = ({ level }) => {
    const active = Math.round((level / 31) * 5);
    return (
        <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:16 }}>
            {Array.from({ length:5 }).map((_,i) => (
                <div key={i} style={{ width:5, height:4+i*3, borderRadius:2, background: i < active ? "#0ea5e9" : "#e2e8f0" }}/>
            ))}
            <span style={{ color:"#0ea5e9", fontSize:11, marginLeft:3 }}>{level}</span>
        </div>
    );
};

const TYPE_META = {
    heartbeat: { color:"#0ea5e9", bg:"#e0f2fe" },
    wifi:      { color:"#8b5cf6", bg:"#ede9fe" },
    rfid:      { color:"#d97706", bg:"#fef3c7" },
    login:     { color:"#16a34a", bg:"#dcfce7" },
    unknown:   { color:"#64748b", bg:"#f1f5f9" },
};

const Badge = ({ type }) => {
    const m = TYPE_META[type] || TYPE_META.unknown;
    return <span style={{ fontSize:10, fontWeight:700, letterSpacing:0.8, padding:"2px 7px", borderRadius:4, background:m.bg, color:m.color, textTransform:"uppercase" }}>{type}</span>;
};

const StatBox = ({ label, value }) => (
    <div style={{ background:T.surface2, borderRadius:8, padding:"8px 10px", border:`1px solid ${T.border}` }}>
        <div style={{ color:T.text3, fontSize:9, letterSpacing:0.5, marginBottom:4, textTransform:"uppercase" }}>{label}</div>
        <div>{value}</div>
    </div>
);

const HeartbeatCard = ({ data, receivedAt }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderTop:"3px solid #0ea5e9", borderRadius:10, padding:16, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"#0ea5e9" }}/>
                <span style={{ color:T.text2, fontSize:11, fontWeight:700, letterSpacing:0.8 }}>HEARTBEAT</span>
            </div>
            <span style={{ color:T.text3, fontSize:11 }}>{timeSince(receivedAt)}</span>
        </div>
        <div style={{ color:T.text2, fontSize:11, marginBottom:12 }}>IMEI: <span style={{ color:"#0ea5e9", fontWeight:700 }}>{data.imei}</span></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <StatBox label="Battery"    value={<BatteryBar level={data.battery}/>}/>
            <StatBox label="GSM Signal" value={<SignalBars level={data.gsm}/>}/>
            <StatBox label="ACC"        value={<span style={{ color:data.acc==="ACC ON"?"#16a34a":"#dc2626", fontWeight:700, fontSize:12 }}>{data.acc}</span>}/>
            <StatBox label="Speed"      value={<span style={{ color:T.text, fontWeight:700 }}>{data.speed}<span style={{ fontSize:10, color:T.text3 }}> km/h</span></span>}/>
            <StatBox label="GPS"        value={data.latitude===0&&data.longitude===0
                ? <span style={{ color:"#dc2626", fontSize:11 }}>⚠ No Fix</span>
                : <span style={{ color:"#16a34a", fontSize:11 }}>{data.latitude.toFixed(4)}, {data.longitude.toFixed(4)}</span>}/>
            <StatBox label="Satellites" value={<span style={{ color:T.text, fontWeight:700 }}>{data.satelites}<span style={{ fontSize:10, color:T.text3 }}> sats</span></span>}/>
            <StatBox label="Alarm"      value={<span style={{ color:data.alarm?"#dc2626":"#16a34a", fontWeight:700, fontSize:12 }}>{data.alarm?"🚨 ACTIVE":"Clear"}</span>}/>
            <StatBox label="Moving"     value={<span style={{ color:data.move?"#d97706":T.text3, fontWeight:700, fontSize:12 }}>{data.move?"▶ Yes":"■ No"}</span>}/>
        </div>
        <div style={{ marginTop:10, color:T.text3, fontSize:10 }}>Device time: {data.time}</div>
    </div>
);

const WifiCard = ({ data, receivedAt }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderTop:"3px solid #8b5cf6", borderRadius:10, padding:16, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"#8b5cf6" }}/>
                <span style={{ color:T.text2, fontSize:11, fontWeight:700, letterSpacing:0.8 }}>WIFI STATUS</span>
            </div>
            <span style={{ color:T.text3, fontSize:11 }}>{timeSince(receivedAt)}</span>
        </div>
        <div style={{ marginBottom:10 }}>
            <div style={{ color:"#8b5cf6", fontWeight:700, fontSize:14 }}>📶 {data.config?.ssid}</div>
            <div style={{ color:T.text3, fontSize:11, marginTop:3 }}>CH {data.config?.channel} · {data.config?.macaddr}</div>
        </div>
        <div style={{ fontSize:11, color:T.text2, marginBottom:8 }}>
            Clients: <span style={{ background:"#ede9fe", color:"#8b5cf6", padding:"1px 8px", borderRadius:10, fontWeight:700 }}>{data.clients_num}</span>
        </div>
        {data.clients_info?.map(c => (
            <div key={c.client_id} style={{ background:T.surface2, borderRadius:7, padding:"7px 10px", marginBottom:5, border:`1px solid ${T.border}` }}>
                <div style={{ color:T.text, fontSize:12, fontWeight:600 }}>{c.device_name==="*" ? "Unknown Device" : c.device_name}</div>
                <div style={{ color:T.text3, fontSize:10, marginTop:2 }}>{c.ip_address} · {c.mac_address}</div>
            </div>
        ))}
    </div>
);

const RfidCard = ({ data, receivedAt }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderTop:"3px solid #d97706", borderRadius:10, padding:16, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"#d97706" }}/>
                <span style={{ color:T.text2, fontSize:11, fontWeight:700, letterSpacing:0.8 }}>RFID SCAN</span>
            </div>
            <span style={{ color:T.text3, fontSize:11 }}>{timeSince(receivedAt)}</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <StatBox label="User ID"   value={<span style={{ color:"#d97706", fontSize:11, fontFamily:"monospace" }}>{data.userID}</span>}/>
            <StatBox label="Station"   value={<span style={{ color:T.text, fontWeight:700 }}>{data.stationID}</span>}/>
            <StatBox label="Status"    value={<span style={{ color:data.status===0?"#16a34a":"#dc2626", fontWeight:700 }}>{data.status===0?"✓ OK":"✗ Error"}</span>}/>
            <StatBox label="Scan Time" value={<span style={{ color:T.text2, fontSize:11 }}>{data.time?.split(" ")[1]}</span>}/>
        </div>
    </div>
);

const LoginCard = ({ data, receivedAt }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderTop:"3px solid #16a34a", borderRadius:10, padding:16, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"#16a34a" }}/>
                <span style={{ color:T.text2, fontSize:11, fontWeight:700, letterSpacing:0.8 }}>DEVICE LOGIN</span>
            </div>
            <span style={{ color:T.text3, fontSize:11 }}>{timeSince(receivedAt)}</span>
        </div>
        <div style={{ color:"#16a34a", fontSize:13 }}>✓ Online: <span style={{ color:T.text, fontWeight:700 }}>{data}</span></div>
    </div>
);

const MessageRow = ({ msg, isSelected, onClick }) => {
    const m = TYPE_META[msg.type] || TYPE_META.unknown;
    return (
        <div onClick={onClick} style={{ padding:"9px 14px", borderBottom:`1px solid ${T.border}`, cursor:"pointer", background:isSelected?"#f0f9ff":"transparent", borderLeft:isSelected?`3px solid ${m.color}`:"3px solid transparent" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <Badge type={msg.type}/>
                <span style={{ color:T.text3, fontSize:10 }}>{new Date(msg.receivedAt).toLocaleTimeString()}</span>
            </div>
            <div style={{ color:T.text3, fontSize:10, marginTop:3, fontFamily:"monospace", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{msg.topic}</div>
        </div>
    );
};

const MapAutoCenter = ({ devices }) => {
    const map = useMap();
    useEffect(() => {
        const withGPS = devices.filter(d => d.hasGPS);
        if (withGPS.length === 1) map.setView([withGPS[0].lat, withGPS[0].lng], 14);
        else if (withGPS.length > 1) map.fitBounds(L.latLngBounds(withGPS.map(d => [d.lat, d.lng])), { padding:[40,40] });
    }, [devices]);
    return null;
};

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
    const [bridgeUrl, setBridgeUrl]   = useState("ws://localhost:4001");
    const [status, setStatus]         = useState("disconnected");
    const [messages, setMessages]     = useState([]);
    const [selected, setSelected]     = useState(null);
    const [activeTab, setActiveTab]   = useState("dashboard");
    const [showDebug, setShowDebug]   = useState(false);
    const [debugLogs, setDebugLogs]   = useState([]);
    const [devices, setDevices]       = useState({});
    const [latestData, setLatestData] = useState({ heartbeat:null, wifi:null, rfid:[], login:null });

    const wsRef       = useRef(null);
    const debugEndRef = useRef(null);
    const colorMap    = useRef({});
    const colorIdx    = useRef(0);
    const reconnTimer = useRef(null);

    const getColor = (imei) => {
        if (!colorMap.current[imei]) colorMap.current[imei] = PIN_COLORS[colorIdx.current++ % PIN_COLORS.length];
        return colorMap.current[imei];
    };

    const addLog = useCallback((level, msg) => {
        setDebugLogs(p => [...p.slice(-299), { time: new Date().toLocaleTimeString(), level, msg }]);
        setTimeout(() => debugEndRef.current?.scrollIntoView({ behavior:"smooth" }), 50);
    }, []);

    const connect = useCallback(() => {
        if (wsRef.current) wsRef.current.close();
        clearTimeout(reconnTimer.current);
        setStatus("connecting");
        addLog("info", `Connecting to bridge → ${bridgeUrl}`);

        let ws;
        try {
            ws = new WebSocket(bridgeUrl);
        } catch(e) {
            addLog("error", `WebSocket error: ${e.message}`);
            setStatus("error");
            return;
        }

        ws.onopen = () => {
            addLog("success", "✅ Bridge connected! Receiving MQTT data...");
            setStatus("connected");
        };

        ws.onclose = (e) => {
            addLog("warn", `🔴 Bridge disconnected (code ${e.code}). Retrying in 5s...`);
            setStatus("disconnected");
            // auto-reconnect
            reconnTimer.current = setTimeout(() => {
                addLog("info", "🔄 Auto-reconnecting...");
                connect();
            }, 5000);
        };

        ws.onerror = () => {
            addLog("error", "❌ WebSocket error — is server.js running? (node server.js)");
            setStatus("error");
        };

        ws.onmessage = (event) => {
            let packet;
            try { packet = JSON.parse(event.data); }
            catch { addLog("warn", `Bad packet: ${event.data.slice(0,60)}`); return; }

            const { topic, payload, receivedAt } = packet;
            const type = getTopicType(topic);
            addLog("msg", `📨 [${type}] ${topic}`);

            let parsed = null;
            try { parsed = JSON.parse(payload); } catch { parsed = payload; }

            const msg = { id: Date.now() + Math.random(), topic, raw: payload, parsed, type, receivedAt };
            setMessages(p => [msg, ...p].slice(0, 200));

            // Update per-device map for heartbeat
            if (type === "heartbeat" && parsed?.imei) {
                const imei = parsed.imei;
                setDevices(prev => {
                    const ex = prev[imei] || { trail:[] };
                    const hasGPS = parsed.latitude !== 0 || parsed.longitude !== 0;
                    const newTrail = hasGPS
                        ? [...(ex.trail || []), [parsed.latitude, parsed.longitude]].slice(-50)
                        : ex.trail || [];
                    return {
                        ...prev,
                        [imei]: {
                            imei, hasGPS,
                            lat:       hasGPS ? parsed.latitude  : (ex.lat  || 0),
                            lng:       hasGPS ? parsed.longitude : (ex.lng  || 0),
                            battery:   parsed.battery,
                            gsm:       parsed.gsm,
                            speed:     parsed.speed,
                            acc:       parsed.acc,
                            alarm:     parsed.alarm,
                            move:      parsed.move,
                            satelites: parsed.satelites,
                            time:      parsed.time,
                            receivedAt,
                            trail:     newTrail,
                            color:     getColor(imei),
                        }
                    };
                });
            }

            setLatestData(prev => {
                if (type === "heartbeat") return { ...prev, heartbeat: { data:parsed, receivedAt } };
                if (type === "wifi")      return { ...prev, wifi:      { data:parsed, receivedAt } };
                if (type === "login")     return { ...prev, login:     { data:parsed, receivedAt } };
                if (type === "rfid")      return { ...prev, rfid: [{ data:parsed, receivedAt }, ...prev.rfid].slice(0,5) };
                return prev;
            });
        };

        wsRef.current = ws;
    }, [bridgeUrl, addLog]);

    const disconnect = () => {
        clearTimeout(reconnTimer.current);
        addLog("warn", "Manual disconnect");
        wsRef.current?.close();
        setStatus("disconnected");
    };

    const SC = { connected:"#16a34a", connecting:"#d97706", disconnected:"#dc2626", error:"#dc2626" };
    const LC = { info:"#64748b", success:"#16a34a", warn:"#d97706", error:"#dc2626", msg:"#0ea5e9" };

    const deviceList  = Object.values(devices);
    const onlineCount = deviceList.filter(d => (Date.now() - new Date(d.receivedAt)) / 1000 < 120).length;

    return (
        <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:T.bg, color:T.text, fontFamily:"'JetBrains Mono','Fira Code',monospace" }}>
            <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:${T.bg}}
        ::-webkit-scrollbar-thumb{background:${T.border2};border-radius:3px}
        input,select{outline:none}
        button{cursor:pointer}
        button:hover{opacity:0.85}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes ripple{0%{transform:scale(1);opacity:0.6}100%{transform:scale(2.2);opacity:0}}
        .leaflet-container{height:100%!important;width:100%!important}
      `}</style>

            {/* ── Top Bar ── */}
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"0 16px", height:48, background:T.topbar, flexShrink:0 }}>
                <span style={{ color:"#38bdf8", fontWeight:900, fontSize:15, letterSpacing:2 }}>TRANSITTAG</span>
                <span style={{ color:"#c9c9c9", fontSize:11 }}>DASHBOARD</span>
                <div style={{ flex:1 }}/>
                {deviceList.length > 0 && (
                    <div style={{ display:"flex", gap:8 }}>
            <span style={{ background:"#1e293b", color:"#94a3b8", fontSize:10, padding:"3px 10px", borderRadius:20 }}>
              {deviceList.length} device{deviceList.length !== 1 ? "s" : ""}
            </span>
                        <span style={{ background:"#14532d", color:"#4ade80", fontSize:10, padding:"3px 10px", borderRadius:20 }}>
              {onlineCount} online
            </span>
                    </div>
                )}
                <button onClick={() => setShowDebug(p => !p)} style={{ background:showDebug?"#78350f22":"#1e293b", border:`1px solid ${showDebug?"#d97706":"#334155"}`, color:showDebug?"#d97706":"#64748b", borderRadius:6, padding:"4px 12px", fontSize:10, letterSpacing:1, fontFamily:"inherit", fontWeight:700 }}>
                    🐛 DEBUG
                </button>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:SC[status], animation:status==="connecting"?"blink 1s infinite":"none" }}/>
                    <span style={{ color:SC[status], fontSize:11, textTransform:"uppercase", letterSpacing:1 }}>{status}</span>
                </div>
            </div>

            <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

                {/* ── Sidebar ── */}
                <div style={{ width:230, background:T.surface, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", flexShrink:0 }}>

                    {/* ── Bridge Connection (simplified) ── */}
                    <div style={{ padding:16, borderBottom:`1px solid ${T.border}` }}>
                        <div style={{ color:T.text3, fontSize:10, letterSpacing:1, fontWeight:700, marginBottom:12 }}>BRIDGE</div>

                        {/* Info box */}
                        <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:"8px 10px", marginBottom:12 }}>
                            <div style={{ color:"#0369a1", fontSize:10, fontWeight:700, marginBottom:4 }}>HOW IT WORKS</div>
                            <div style={{ color:"#0284c7", fontSize:10, lineHeight:1.5 }}>
                                Run <span style={{ background:"#0ea5e922", padding:"1px 5px", borderRadius:3, fontFamily:"monospace" }}>node server.js</span> in your terminal first. It connects to MQTT and forwards data here.
                            </div>
                        </div>

                        <div style={{ marginBottom:10 }}>
                            <div style={{ color:T.text3, fontSize:9, marginBottom:4, letterSpacing:0.5 }}>BRIDGE URL</div>
                            <input
                                value={bridgeUrl}
                                onChange={e => setBridgeUrl(e.target.value)}
                                placeholder="ws://localhost:4001"
                                style={{ width:"100%", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, fontSize:12, fontFamily:"monospace" }}
                            />
                        </div>

                        {/* Status indicator */}
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, padding:"6px 10px", background:T.surface2, borderRadius:8, border:`1px solid ${T.border}` }}>
                            <div style={{ width:8, height:8, borderRadius:"50%", background:SC[status], flexShrink:0, animation:status==="connecting"?"blink 1s infinite":"none" }}/>
                            <div>
                                <div style={{ color:SC[status], fontSize:11, fontWeight:700, textTransform:"uppercase" }}>{status}</div>
                                <div style={{ color:T.text3, fontSize:9 }}>
                                    {status==="connected"   && "Receiving live MQTT data"}
                                    {status==="connecting"  && "Connecting to bridge..."}
                                    {status==="disconnected"&& "Not connected"}
                                    {status==="error"       && "Check if server.js is running"}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={status === "connected" ? disconnect : connect}
                            style={{ width:"100%", padding:"9px 0", background:status==="connected"?"#fef2f2":"#eff6ff", border:`1.5px solid ${status==="connected"?"#dc2626":"#0ea5e9"}`, color:status==="connected"?"#dc2626":"#0ea5e9", borderRadius:8, fontWeight:700, fontSize:12, letterSpacing:1, fontFamily:"inherit" }}
                        >
                            {status==="connected" ? "DISCONNECT" : status==="connecting" ? "CONNECTING..." : "CONNECT"}
                        </button>
                    </div>

                    {/* ── Message List ── */}
                    <div style={{ padding:"9px 14px 6px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:6, alignItems:"center" }}>
                        <span style={{ color:T.text2, fontSize:10, fontWeight:700, letterSpacing:1 }}>MESSAGES</span>
                        <span style={{ background:T.surface2, color:T.text3, padding:"1px 7px", borderRadius:10, fontSize:9 }}>{messages.length}</span>
                        {messages.length > 0 && (
                            <button onClick={() => setMessages([])} style={{ marginLeft:"auto", background:"transparent", border:"none", color:T.text3, fontSize:9, padding:0, fontFamily:"inherit" }}>
                                clear
                            </button>
                        )}
                    </div>
                    <div style={{ flex:1, overflowY:"auto" }}>
                        {messages.length === 0
                            ? <div style={{ color:T.text3, fontSize:11, textAlign:"center", marginTop:30, padding:"0 16px" }}>
                                No messages yet.<br/>
                                <span style={{ fontSize:10 }}>Connect to see live data.</span>
                            </div>
                            : messages.map(m => (
                                <MessageRow key={m.id} msg={m}
                                            isSelected={selected?.id === m.id}
                                            onClick={() => { setSelected(m); setActiveTab("json"); }}/>
                            ))
                        }
                    </div>
                </div>

                {/* ── Main Panel ── */}
                <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

                    {/* Tabs */}
                    <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, background:T.surface, flexShrink:0 }}>
                        {["dashboard","map","json"].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding:"10px 20px", background:"transparent", border:"none", borderBottom:activeTab===tab?"2px solid #0ea5e9":"2px solid transparent", color:activeTab===tab?"#0ea5e9":T.text2, fontWeight:700, fontSize:11, letterSpacing:1, textTransform:"uppercase", fontFamily:"inherit" }}>
                                {tab}
                                {tab==="map" && deviceList.length > 0 && (
                                    <span style={{ marginLeft:6, background:"#dbeafe", color:"#0ea5e9", fontSize:9, padding:"1px 6px", borderRadius:10 }}>{deviceList.length}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ── Dashboard Tab ── */}
                    {activeTab === "dashboard" && (
                        <div style={{ flex:1, overflowY:"auto", padding:16 }}>
                            {!latestData.heartbeat && !latestData.wifi && latestData.rfid.length === 0 && (
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"60%", color:T.text3 }}>
                                    <div style={{ fontSize:36, marginBottom:12 }}>📡</div>
                                    <div style={{ fontSize:14, color:T.text2 }}>Waiting for device data...</div>
                                    <div style={{ fontSize:11, color:T.text3, marginTop:6 }}>Connect and run <code style={{ background:T.surface2, padding:"1px 6px", borderRadius:3 }}>node server.js</code></div>
                                </div>
                            )}
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))", gap:14 }}>
                                {latestData.login     && <LoginCard     data={latestData.login.data}     receivedAt={latestData.login.receivedAt}/>}
                                {latestData.heartbeat && <HeartbeatCard data={latestData.heartbeat.data} receivedAt={latestData.heartbeat.receivedAt}/>}
                                {latestData.wifi      && <WifiCard      data={latestData.wifi.data}       receivedAt={latestData.wifi.receivedAt}/>}
                                {latestData.rfid.map((r,i) => <RfidCard key={i} data={r.data} receivedAt={r.receivedAt}/>)}
                            </div>
                        </div>
                    )}

                    {/* ── Map Tab ── */}
                    {activeTab === "map" && (
                        <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
                            {/* Legend */}
                            {deviceList.length > 0 && (
                                <div style={{ position:"absolute", top:12, right:12, zIndex:1000, background:"white", borderRadius:10, padding:"10px 14px", boxShadow:"0 2px 12px rgba(0,0,0,0.12)", minWidth:210, border:`1px solid ${T.border}`, maxHeight:280, overflowY:"auto" }}>
                                    <div style={{ color:T.text2, fontSize:10, fontWeight:700, letterSpacing:1, marginBottom:8 }}>DEVICES ({deviceList.length})</div>
                                    {deviceList.map(d => {
                                        const online = (Date.now() - new Date(d.receivedAt)) / 1000 < 120;
                                        return (
                                            <div key={d.imei} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                                                <div style={{ width:10, height:10, borderRadius:"50%", background:d.color, flexShrink:0 }}/>
                                                <div style={{ flex:1, minWidth:0 }}>
                                                    <div style={{ fontSize:10, fontWeight:700, color:T.text, fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>···{d.imei.slice(-8)}</div>
                                                    <div style={{ fontSize:9, color:T.text3 }}>{d.hasGPS ? `${d.lat.toFixed(3)}, ${d.lng.toFixed(3)}` : "No GPS"} · {d.speed}km/h</div>
                                                </div>
                                                <span style={{ fontSize:9, padding:"1px 6px", borderRadius:10, background:online?"#dcfce7":"#fee2e2", color:online?"#16a34a":"#dc2626", fontWeight:700, flexShrink:0 }}>
                          {online ? "LIVE" : "IDLE"}
                        </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <MapContainer center={NAIROBI} zoom={12} style={{ height:"100%", width:"100%" }}>
                                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
                                <MapAutoCenter devices={deviceList}/>

                                {deviceList.map(d => {
                                    const pos = (d.lat === 0 && d.lng === 0) ? null : [d.lat, d.lng];
                                    const online = (Date.now() - new Date(d.receivedAt)) / 1000 < 120;
                                    return (
                                        <span key={d.imei}>
                      {d.trail.length > 1 && (
                          <Polyline positions={d.trail} color={d.color} weight={3} opacity={0.5} dashArray="6,4"/>
                      )}
                                            <Marker position={pos || NAIROBI} icon={makeIcon(d.color, d.move, d.alarm)}>
                        <Popup>
                          <div style={{ fontFamily:"sans-serif", minWidth:190 }}>
                            <div style={{ fontWeight:700, fontSize:13, marginBottom:6, color:d.color }}>{d.imei}</div>
                              {!pos && <div style={{ background:"#fef3c7", color:"#92400e", padding:"3px 8px", borderRadius:4, fontSize:11, marginBottom:6 }}>⚠ No GPS — showing Nairobi</div>}
                              <table style={{ fontSize:11, width:"100%", borderCollapse:"collapse" }}>
                              {[
                                  ["Status",    online ? "🟢 Online" : "🔴 Idle"],
                                  ["Battery",   `${d.battery}%`],
                                  ["GSM",       d.gsm],
                                  ["Speed",     `${d.speed} km/h`],
                                  ["ACC",       d.acc],
                                  ["Moving",    d.move ? "Yes" : "No"],
                                  ["Alarm",     d.alarm ? "🚨 ACTIVE" : "Clear"],
                                  ["Sats",      d.satelites],
                                  ["Last seen", timeSince(d.receivedAt)],
                                  ["Time",      d.time],
                              ].map(([k,v]) => (
                                  <tr key={k}>
                                      <td style={{ color:"#64748b", padding:"2px 8px 2px 0", fontWeight:600 }}>{k}</td>
                                      <td style={{ color:"#0f172a" }}>{v}</td>
                                  </tr>
                              ))}
                            </table>
                          </div>
                        </Popup>
                      </Marker>
                    </span>
                                    );
                                })}

                                {deviceList.length === 0 && (
                                    <Marker position={NAIROBI}>
                                        <Popup>
                                            <div style={{ fontFamily:"sans-serif", fontSize:12 }}>
                                                <strong>Nairobi, Kenya</strong><br/>Connect to see live device pins
                                            </div>
                                        </Popup>
                                    </Marker>
                                )}
                            </MapContainer>
                        </div>
                    )}

                    {/* ── JSON Tab ── */}
                    {activeTab === "json" && (
                        <div style={{ flex:1, overflowY:"auto", padding:16 }}>
                            {selected ? (
                                <div>
                                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                                            <Badge type={selected.type}/>
                                            <span style={{ color:T.text2, fontSize:11 }}>{selected.topic}</span>
                                        </div>
                                        <span style={{ color:T.text3, fontSize:11 }}>{new Date(selected.receivedAt).toLocaleString()}</span>
                                    </div>
                                    <pre style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:16, fontSize:12, color:T.text2, lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>
                    {typeof selected.parsed === "object" ? JSON.stringify(selected.parsed, null, 2) : selected.raw}
                  </pre>
                                </div>
                            ) : (
                                <div style={{ color:T.text3, fontSize:13, textAlign:"center", marginTop:40 }}>
                                    ← Select a message from the list to view JSON
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Debug Console ── */}
                    {showDebug && (
                        <div style={{ height:210, borderTop:"1px solid #fde68a", background:"#fffbeb", display:"flex", flexDirection:"column", flexShrink:0 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 14px", borderBottom:"1px solid #fde68a" }}>
                                <span style={{ color:"#92400e", fontSize:10, fontWeight:700, letterSpacing:1 }}>🐛 DEBUG CONSOLE</span>
                                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                                    <span style={{ color:"#b45309", fontSize:10 }}>{debugLogs.length} entries</span>
                                    <button onClick={() => setDebugLogs([])} style={{ background:"transparent", border:"1px solid #fbbf24", color:"#92400e", borderRadius:4, padding:"2px 8px", fontSize:10, fontFamily:"inherit" }}>CLEAR</button>
                                </div>
                            </div>
                            <div style={{ flex:1, overflowY:"auto", padding:"8px 14px" }}>
                                {debugLogs.length === 0
                                    ? <div style={{ color:"#d97706", fontSize:11 }}>No logs. Click CONNECT.</div>
                                    : debugLogs.map((l,i) => (
                                        <div key={i} style={{ display:"flex", gap:10, marginBottom:2, fontSize:11 }}>
                                            <span style={{ color:"#b45309", flexShrink:0 }}>{l.time}</span>
                                            <span style={{ color:LC[l.level] || T.text2 }}>{l.msg}</span>
                                        </div>
                                    ))
                                }
                                <div ref={debugEndRef}/>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}