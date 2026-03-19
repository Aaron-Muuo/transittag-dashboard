// ─── GPS Simulator ────────────────────────────────────────────────────────────
//
// Simulates devices driving real Nairobi routes.
// Injects heartbeat packets into the same WebSocket broadcast stream
// as real MQTT data — the dashboard treats them identically.
//
// Usage in server.js:
//   import { startSimulator } from "./gpsSimulator.js";
//   startSimulator(broadcast);
//
// To stop simulation: comment out the startSimulator(broadcast) line
// ─────────────────────────────────────────────────────────────────────────────

const SIM_INTERVAL_MS    = 3000; // milliseconds between heartbeat ticks
const STEPS_PER_WAYPOINT = 10;   // interpolation steps between each waypoint pair

// ─── Real Nairobi road waypoints [latitude, longitude] ───────────────────────
const ROUTES = {

    // Route A: CBD → Westlands → Parklands → CBD
    CBD_WESTLANDS: [
        [-1.2833, 36.8172], // Kencom Bus Stop / CBD
        [-1.2815, 36.8153], // University Way
        [-1.2801, 36.8134], // Museum Hill roundabout
        [-1.2789, 36.8098], // Westlands roundabout
        [-1.2756, 36.8063], // Sarit Centre
        [-1.2712, 36.8045], // Parklands Road
        [-1.2698, 36.8071], // Mpaka Road
        [-1.2731, 36.8101], // Ring Road Westlands
        [-1.2789, 36.8098], // back to Westlands roundabout
        [-1.2815, 36.8134], // Museum Hill
        [-1.2833, 36.8172], // back to CBD
    ],

    // Route B: CBD → Ngong Road → Karen → CBD
    CBD_KAREN: [
        [-1.2921, 36.8219], // Nairobi CBD
        [-1.2976, 36.8145], // Haile Selassie roundabout
        [-1.3012, 36.8067], // Community / Ngong Rd
        [-1.3089, 36.7998], // Prestige Plaza
        [-1.3201, 36.7934], // Dagoretti Corner
        [-1.3312, 36.7845], // Karen Hardy
        [-1.3401, 36.7756], // Karen shops
        [-1.3312, 36.7845], // Karen Hardy (return)
        [-1.3201, 36.7934], // Dagoretti Corner
        [-1.3089, 36.7998], // Prestige Plaza
        [-1.2921, 36.8219], // back to CBD
    ],

    // Route C: CBD → Thika Road → Garden City → CBD
    CBD_THIKA: [
        [-1.2833, 36.8219], // CBD
        [-1.2756, 36.8298], // Globe roundabout
        [-1.2645, 36.8367], // Pangani
        [-1.2534, 36.8456], // Muthaiga Road junction
        [-1.2423, 36.8534], // Thika Road / Allsops
        [-1.2312, 36.8623], // Garden City Mall
        [-1.2423, 36.8534], // Allsops (return)
        [-1.2534, 36.8456], // Muthaiga
        [-1.2645, 36.8367], // Pangani
        [-1.2756, 36.8298], // Globe roundabout
        [-1.2833, 36.8219], // back to CBD
    ],
};

// ─── Simulated devices ────────────────────────────────────────────────────────
const SIM_DEVICES = [
    { imei:"SIM-001-WESTLANDS", route: ROUTES.CBD_WESTLANDS, battery:85, gsm:24 },
    { imei:"SIM-002-KAREN",     route: ROUTES.CBD_KAREN,     battery:62, gsm:18 },
    { imei:"SIM-003-THIKA",     route: ROUTES.CBD_THIKA,     battery:91, gsm:27 },
];

// ─── Math helpers ─────────────────────────────────────────────────────────────

// Linear interpolation between two [lat,lng] points at fraction t (0..1)
const lerp = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
];

// Compass bearing in degrees from point a → b
const bearing = ([lat1, lng1], [lat2, lng2]) => {
    const toRad = (x) => (x * Math.PI) / 180;
    const dLng  = toRad(lng2 - lng1);
    const y     = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x     = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
        - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
    return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
};

// Approximate speed in km/h between two coords over totalSeconds
const approxSpeed = ([lat1, lng1], [lat2, lng2], totalSeconds) => {
    const R     = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat  = toRad(lat2 - lat1);
    const dLng  = toRad(lng2 - lng1);
    const a     = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const km    = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round((km / totalSeconds) * 3600);
};

// ─── Main export ──────────────────────────────────────────────────────────────
export function startSimulator(broadcast) {
    // Initialise per-device state, stagger starting waypoints so they
    // don't all begin at the same position
    const state = SIM_DEVICES.map((d, i) => ({
        ...d,
        waypointIndex: i % d.route.length,
        step:          0,
        battery:       d.battery,
        gsm:           d.gsm,
    }));

    console.log(`\n🗺️  GPS Simulator ACTIVE — ${SIM_DEVICES.length} devices`);
    state.forEach((d) => console.log(`   📍 ${d.imei}`));
    console.log(`   ⏱  Heartbeat every ${SIM_INTERVAL_MS / 1000}s`);
    console.log(`   💡 To disable: comment out startSimulator(broadcast) in server.js\n`);

    const timer = setInterval(() => {
        state.forEach((device) => {
            const route   = device.route;
            const curr    = route[device.waypointIndex];
            const nextIdx = (device.waypointIndex + 1) % route.length;
            const next    = route[nextIdx];

            // Smooth position between waypoints
            const t   = device.step / STEPS_PER_WAYPOINT;
            const pos = lerp(curr, next, t);

            // Small random jitter (~5m) so the trail looks natural
            const lat = pos[0] + (Math.random() - 0.5) * 0.00009;
            const lng = pos[1] + (Math.random() - 0.5) * 0.00009;

            const angle       = bearing(curr, next);
            const travelSecs  = (SIM_INTERVAL_MS / 1000) * STEPS_PER_WAYPOINT;
            const speed       = approxSpeed(curr, next, travelSecs);

            // Slowly drain battery (~10% chance per tick)
            if (Math.random() < 0.1) device.battery = Math.max(10, device.battery - 1);
            // Vary GSM signal slightly
            device.gsm = Math.min(31, Math.max(5, device.gsm + Math.round((Math.random() - 0.5) * 2)));

            const heartbeat = {
                header:    "5858",
                cmd:       "80",
                imei:      device.imei,
                gsm:       device.gsm,
                time:      new Date().toISOString().replace("T", " ").slice(0, 19),
                latitude:  parseFloat(lat.toFixed(6)),
                longitude: parseFloat(lng.toFixed(6)),
                acc:       "ACC ON",
                alarm:     false,
                move:      true,
                speed,
                angle,
                satelites: Math.floor(Math.random() * 4) + 8, // 8–11 sats
                battery:   device.battery,
                type:      "TRANSITTAG-SIM",
                gps_speed: speed,
            };

            const topic   = `/topic/transittag/heartbeat/${device.imei}`;
            const payload = JSON.stringify(heartbeat);

            console.log(
                `🗺️  SIM [${device.imei.slice(-3)}] ` +
                `${lat.toFixed(4)}, ${lng.toFixed(4)} ` +
                `${speed}km/h ↗${angle}° 🔋${device.battery}%`
            );

            broadcast(topic, payload);

            // Advance interpolation step — move to next waypoint when done
            device.step++;
            if (device.step >= STEPS_PER_WAYPOINT) {
                device.step = 0;
                device.waypointIndex = nextIdx;
            }
        });
    }, SIM_INTERVAL_MS);

    // Return the timer so server.js can cancel it if needed
    return timer;
}