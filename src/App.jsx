import { useState, useRef, useCallback } from "react";

const getTopicType = (topic) => {
  if (topic.includes("/heartbeat/")) return "heartbeat";
  if (topic.includes("/wifi/"))      return "wifi";
  if (topic.includes("/rfid/"))      return "rfid";
  if (topic.includes("/login/"))     return "login";
  return "unknown";
};

const timeSince = (dateStr) => {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const BatteryBar = ({ level }) => {
  const pct = Math.min(100, Math.max(0, level));
  const color = pct > 50 ? "#22c55e" : pct > 20 ? "#f59e0b" : "#ef4444";
  return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 48, height: 22, border: `2px solid ${color}`, borderRadius: 4, position: "relative", display: "flex", alignItems: "center", padding: "2px" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.5s" }} />
          <div style={{ position: "absolute", right: -6, top: "50%", transform: "translateY(-50%)", width: 4, height: 10, background: color, borderRadius: "0 2px 2px 0" }} />
        </div>
        <span style={{ color, fontWeight: 700, fontSize: 13 }}>{pct}%</span>
      </div>
  );
};

const SignalBars = ({ level }) => {
  const bars = 5;
  const active = Math.round((level / 31) * bars);
  return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 18 }}>
        {Array.from({ length: bars }).map((_, i) => (
            <div key={i} style={{ width: 5, height: 4 + i * 3, borderRadius: 2, background: i < active ? "#06b6d4" : "#334155" }} />
        ))}
        <span style={{ color: "#06b6d4", fontSize: 12, marginLeft: 4 }}>{level}</span>
      </div>
  );
};

const TYPE_COLORS = {
  heartbeat: { border: "#06b6d4", text: "#06b6d4" },
  wifi:      { border: "#8b5cf6", text: "#8b5cf6" },
  rfid:      { border: "#f59e0b", text: "#f59e0b" },
  login:     { border: "#22c55e", text: "#22c55e" },
  unknown:   { border: "#64748b", text: "#64748b" },
};

const Badge = ({ type }) => {
  const c = TYPE_COLORS[type] || TYPE_COLORS.unknown;
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "2px 8px", borderRadius: 4, border: `1px solid ${c.border}`, color: c.text, textTransform: "uppercase" }}>{type}</span>;
};

const StatBox = ({ label, value }) => (
    <div style={{ background: "#0f172a", borderRadius: 8, padding: "8px 10px", border: "1px solid #1e293b" }}>
      <div style={{ color: "#475569", fontSize: 10, letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div>{value}</div>
    </div>
);

const HeartbeatCard = ({ data, receivedAt }) => (
    <div style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)", border: "1px solid #06b6d422", borderRadius: 12, padding: 16, boxShadow: "0 0 20px #06b6d411" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#06b6d4", boxShadow: "0 0 8px #06b6d4" }} />
          <span style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 1 }}>HEARTBEAT</span>
        </div>
        <span style={{ color: "#475569", fontSize: 11 }}>{timeSince(receivedAt)}</span>
      </div>
      <div style={{ color: "#e2e8f0", fontSize: 12, marginBottom: 12 }}>IMEI: <span style={{ color: "#06b6d4" }}>{data.imei}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatBox label="Battery"    value={<BatteryBar level={data.battery} />} />
        <StatBox label="GSM Signal" value={<SignalBars level={data.gsm} />} />
        <StatBox label="ACC"        value={<span style={{ color: data.acc === "ACC ON" ? "#22c55e" : "#ef4444", fontWeight: 700, fontSize: 13 }}>{data.acc}</span>} />
        <StatBox label="Speed"      value={<span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 16 }}>{data.speed} <span style={{ fontSize: 11, color: "#64748b" }}>km/h</span></span>} />
        <StatBox label="GPS"        value={data.latitude === 0 && data.longitude === 0 ? <span style={{ color: "#ef4444", fontSize: 12 }}>⚠ No Fix</span> : <span style={{ color: "#22c55e", fontSize: 12 }}>{data.latitude.toFixed(5)}, {data.longitude.toFixed(5)}</span>} />
        <StatBox label="Satellites" value={<span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 16 }}>{data.satelites} <span style={{ fontSize: 11, color: "#64748b" }}>sats</span></span>} />
        <StatBox label="Alarm"      value={<span style={{ color: data.alarm ? "#ef4444" : "#22c55e", fontWeight: 700, fontSize: 13 }}>{data.alarm ? "🚨 ACTIVE" : "Clear"}</span>} />
        <StatBox label="Moving"     value={<span style={{ color: data.move ? "#f59e0b" : "#64748b", fontWeight: 700, fontSize: 13 }}>{data.move ? "▶ Yes" : "■ No"}</span>} />
      </div>
      <div style={{ marginTop: 12, color: "#475569", fontSize: 11 }}>Device time: <span style={{ color: "#64748b" }}>{data.time}</span></div>
    </div>
);

const WifiCard = ({ data, receivedAt }) => (
    <div style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)", border: "1px solid #8b5cf622", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6", boxShadow: "0 0 8px #8b5cf6" }} />
          <span style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 1 }}>WIFI STATUS</span>
        </div>
        <span style={{ color: "#475569", fontSize: 11 }}>{timeSince(receivedAt)}</span>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 15 }}>📶 {data.config?.ssid}</div>
        <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>CH {data.config?.channel} · MAC {data.config?.macaddr}</div>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 8 }}>
        CONNECTED CLIENTS <span style={{ background: "#8b5cf633", color: "#8b5cf6", padding: "1px 8px", borderRadius: 10, fontWeight: 700 }}>{data.clients_num}</span>
      </div>
      {data.clients_info?.map((c) => (
          <div key={c.client_id} style={{ background: "#0f172a", borderRadius: 8, padding: "8px 12px", marginBottom: 6, border: "1px solid #1e293b" }}>
            <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{c.device_name === "*" ? "Unknown Device" : c.device_name}</div>
            <div style={{ color: "#475569", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>{c.ip_address} · {c.mac_address}</div>
          </div>
      ))}
    </div>
);

const RfidCard = ({ data, receivedAt }) => (
    <div style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)", border: "1px solid #f59e0b22", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b" }} />
          <span style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 1 }}>RFID SCAN</span>
        </div>
        <span style={{ color: "#475569", fontSize: 11 }}>{timeSince(receivedAt)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatBox label="User ID"   value={<span style={{ color: "#f59e0b", fontSize: 11, fontFamily: "monospace" }}>{data.userID}</span>} />
        <StatBox label="Station"   value={<span style={{ color: "#f8fafc", fontWeight: 700 }}>{data.stationID}</span>} />
        <StatBox label="Status"    value={<span style={{ color: data.status === 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{data.status === 0 ? "✓ OK" : "✗ Error"}</span>} />
        <StatBox label="Scan Time" value={<span style={{ color: "#94a3b8", fontSize: 11 }}>{data.time?.split(" ")[1]}</span>} />
      </div>
    </div>
);

const LoginCard = ({ data, receivedAt }) => (
    <div style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)", border: "1px solid #22c55e22", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
          <span style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 1 }}>DEVICE LOGIN</span>
        </div>
        <span style={{ color: "#475569", fontSize: 11 }}>{timeSince(receivedAt)}</span>
      </div>
      <div style={{ color: "#22c55e", fontFamily: "monospace", fontSize: 13 }}>
        ✓ Device online: <span style={{ color: "#e2e8f0" }}>{data}</span>
      </div>
    </div>
);

const MessageRow = ({ msg, isSelected, onClick }) => {
  const c = TYPE_COLORS[msg.type] || TYPE_COLORS.unknown;
  return (
      <div onClick={onClick} style={{ padding: "10px 14px", borderBottom: "1px solid #0f172a", cursor: "pointer", background: isSelected ? "#1e293b" : "transparent", borderLeft: isSelected ? `3px solid ${c.border}` : "3px solid transparent", transition: "all 0.15s" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Badge type={msg.type} />
          <span style={{ color: "#475569", fontSize: 10 }}>{new Date(msg.receivedAt).toLocaleTimeString()}</span>
        </div>
        <div style={{ color: "#64748b", fontSize: 10, marginTop: 4, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.topic}</div>
      </div>
  );
};

export default function App() {
  const [wsUrl, setWsUrl]         = useState("ws://localhost:4001");
  const [status, setStatus]       = useState("disconnected");
  const [messages, setMessages]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [latestData, setLatestData] = useState({ heartbeat: null, wifi: null, rfid: [], login: null });
  const wsRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setStatus("connecting");
    setMessages([]);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen  = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("error");

    ws.onmessage = (event) => {
      const { topic, payload, receivedAt } = JSON.parse(event.data);
      const type = getTopicType(topic);
      let parsed = null;
      try { parsed = JSON.parse(payload); } catch { parsed = payload; }

      const msg = { id: Date.now() + Math.random(), topic, raw: payload, parsed, type, receivedAt };
      setMessages(prev => [msg, ...prev].slice(0, 200));
      setLatestData(prev => {
        if (type === "heartbeat") return { ...prev, heartbeat: { data: parsed, receivedAt } };
        if (type === "wifi")      return { ...prev, wifi:      { data: parsed, receivedAt } };
        if (type === "login")     return { ...prev, login:     { data: parsed, receivedAt } };
        if (type === "rfid")      return { ...prev, rfid: [{ data: parsed, receivedAt }, ...prev.rfid].slice(0, 5) };
        return prev;
      });
    };
  }, [wsUrl]);

  const disconnect = () => { wsRef.current?.close(); setStatus("disconnected"); };

  const STATUS_COLORS = { connected: "#22c55e", connecting: "#f59e0b", disconnected: "#ef4444", error: "#ef4444" };

  return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0f1a", color: "#e2e8f0", fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
        <style>{`* { box-sizing:border-box;margin:0;padding:0 } ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0f172a} ::-webkit-scrollbar-thumb{background:#334155;border-radius:2px} input{outline:none} @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#0f172a", borderBottom: "1px solid #1e293b", flexShrink: 0 }}>
          <span style={{ color: "#06b6d4", fontWeight: 900, fontSize: 14, letterSpacing: 2 }}>TRANSITTAG</span>
          <span style={{ color: "#334155", fontSize: 12 }}>DASHBOARD</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[status], boxShadow: status === "connected" ? `0 0 8px ${STATUS_COLORS[status]}` : "none", animation: status === "connecting" ? "blink 1s infinite" : "none" }} />
            <span style={{ color: STATUS_COLORS[status], fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>{status}</span>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Sidebar */}
          <div style={{ width: 240, background: "#0f172a", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ padding: 14, borderBottom: "1px solid #1e293b" }}>
              <div style={{ color: "#475569", fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>BRIDGE CONNECTION</div>
              <input value={wsUrl} onChange={e => setWsUrl(e.target.value)}
                     style={{ width: "100%", background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 6, padding: "5px 8px", color: "#e2e8f0", fontSize: 11, fontFamily: "inherit", marginBottom: 6 }} />
              <div style={{ color: "#334155", fontSize: 10, marginBottom: 10 }}>Start bridge first: <span style={{ color: "#06b6d4" }}>node server.js</span></div>
              <button onClick={status === "connected" ? disconnect : connect} style={{ width: "100%", padding: "8px 0", background: status === "connected" ? "#ef444422" : "#06b6d422", border: `1px solid ${status === "connected" ? "#ef4444" : "#06b6d4"}`, color: status === "connected" ? "#ef4444" : "#06b6d4", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, letterSpacing: 1, fontFamily: "inherit" }}>
                {status === "connected" ? "DISCONNECT" : status === "connecting" ? "CONNECTING..." : "CONNECT"}
              </button>
            </div>

            <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #1e293b" }}>
              <span style={{ color: "#475569", fontSize: 10, letterSpacing: 1 }}>MESSAGES </span>
              <span style={{ background: "#1e293b", color: "#64748b", padding: "1px 6px", borderRadius: 8, fontSize: 9 }}>{messages.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {messages.length === 0
                  ? <div style={{ color: "#334155", fontSize: 11, textAlign: "center", marginTop: 30 }}>No messages yet</div>
                  : messages.map(m => <MessageRow key={m.id} msg={m} isSelected={selected?.id === m.id} onClick={() => { setSelected(m); setActiveTab("json"); }} />)
              }
            </div>
          </div>

          {/* Main */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#0f172a", flexShrink: 0 }}>
              {["dashboard", "json"].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "10px 20px", background: "transparent", border: "none", borderBottom: activeTab === tab ? "2px solid #06b6d4" : "2px solid transparent", color: activeTab === tab ? "#06b6d4" : "#475569", cursor: "pointer", fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontFamily: "inherit" }}>{tab}</button>
              ))}
            </div>

            {activeTab === "dashboard" && (
                <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                  {!latestData.heartbeat && !latestData.wifi && latestData.rfid.length === 0 && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", color: "#334155" }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
                        <div style={{ fontSize: 13 }}>Run <span style={{ color: "#06b6d4" }}>node server.js</span> then click Connect</div>
                      </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
                    {latestData.login     && <LoginCard     data={latestData.login.data}     receivedAt={latestData.login.receivedAt} />}
                    {latestData.heartbeat && <HeartbeatCard data={latestData.heartbeat.data} receivedAt={latestData.heartbeat.receivedAt} />}
                    {latestData.wifi      && <WifiCard      data={latestData.wifi.data}       receivedAt={latestData.wifi.receivedAt} />}
                    {latestData.rfid.map((r, i) => <RfidCard key={i} data={r.data} receivedAt={r.receivedAt} />)}
                  </div>
                </div>
            )}

            {activeTab === "json" && (
                <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                  {selected ? (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <Badge type={selected.type} />
                            <span style={{ color: "#475569", fontSize: 11 }}>{selected.topic}</span>
                          </div>
                          <span style={{ color: "#475569", fontSize: 11 }}>{new Date(selected.receivedAt).toLocaleString()}</span>
                        </div>
                        <pre style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 16, fontSize: 12, color: "#94a3b8", lineHeight: 1.7, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {typeof selected.parsed === "object" ? JSON.stringify(selected.parsed, null, 2) : selected.raw}
                  </pre>
                      </div>
                  ) : (
                      <div style={{ color: "#334155", fontSize: 13, textAlign: "center", marginTop: 40 }}>← Click a message to view its JSON</div>
                  )}
                </div>
            )}
          </div>
        </div>
      </div>
  );
}