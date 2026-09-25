import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Polygon, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import * as turf from "@turf/turf";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "leaflet/dist/leaflet.css";
import "./index.css";

const API = "/api";

function authHeaders() {
  const t = localStorage.getItem("ccf_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
      ...(opts.headers || {}),
    },
    body: isForm ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
  return data;
}

function useUser() {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("ccf_user");
    return raw ? JSON.parse(raw) : null;
  });
  const save = (u, token) => {
    if (token) localStorage.setItem("ccf_token", token);
    localStorage.setItem("ccf_user", JSON.stringify(u));
    setUser(u);
  };
  const logout = () => {
    localStorage.removeItem("ccf_token");
    localStorage.removeItem("ccf_user");
    setUser(null);
  };
  return { user, save, logout };
}

export default function App() {
  const session = useUser();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth session={session} mode="login" />} />
        <Route path="/register" element={<Auth session={session} mode="register" />} />
        <Route path="/farmer/*" element={<Require role="FARMER" session={session}><FarmerApp session={session} /></Require>} />
        <Route path="/admin/*" element={<Require role="ADMIN" session={session}><AdminApp session={session} /></Require>} />
        <Route path="/company/*" element={<Require role="COMPANY" session={session}><CompanyApp session={session} /></Require>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

function Require({ role, session, children }) {
  if (!session.user) return <Navigate to="/login" />;
  if (session.user.role !== role) return <Navigate to="/" />;
  return children;
}

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="leaf">🌿</span>
      <span>
        <strong>CarbonCreditFarm</strong>
        <small>Farm Today · Cleaner Tomorrow</small>
      </span>
    </Link>
  );
}

function Landing() {
  return (
    <div className="page">
      <header className="topbar">
        <Brand />
        <nav>
          <a href="#about">About</a>
          <a href="#how">How it Works</a>
          <a href="#features">Features</a>
          <Link to="/login">Login</Link>
          <Link className="btn" to="/register">Register</Link>
        </nav>
      </header>
      <section className="hero">
        <div>
          <p className="kicker">AI-Driven Carbon Credit Farming Platform</p>
          <h1>Small Farms. Big Climate Impact.</h1>
          <p className="lede">
            Helping farmers earn carbon credits through sustainable farming, GPS field mapping, real soil data,
            machine-learning SOC prediction, IPCC carbon accounting and blockchain certificates.
          </p>
          <div className="row">
            <Link className="btn" to="/register">Get Started</Link>
            <a className="btn ghost" href="#how">Learn More</a>
          </div>
          <div className="pills">
            <span>AI Powered</span>
            <span>GPS Enabled</span>
            <span>Farmer Centric</span>
            <span>Blockchain Secured</span>
          </div>
        </div>
        <div className="hero-card">
          <h3>PART 1 → PART 2</h3>
          <ol>
            <li>Register with a password (no OTP on login)</li>
            <li>Farm details, documents, walk-the-boundary GPS</li>
            <li>Admin farm verification</li>
            <li>Arduino pH / moisture / temperature, ML fills the rest by place</li>
            <li>AI SOC prediction on a real WoSIS-trained model</li>
            <li>Carbon credits → blockchain → marketplace</li>
          </ol>
        </div>
      </section>
      <section id="how" className="grid-4">
        {[
          ["01", "Map the small farm", "Smartphone GPS + Leaflet + OpenStreetMap + Turf.js. No satellite classification."],
          ["02", "Read the soil", "Arduino EC20-BNC pH, moisture and temperature. ML fills EC, NPK and SOC for that GPS place."],
          ["03", "Predict SOC", "XGBoost / RF / GBM / linear models trained on ISRIC WoSIS-latest laboratory SOC."],
          ["04", "Certify & sell", "Admin verification, academic blockchain hash, company purchase of listed credits."],
        ].map(([n, t, d]) => (
          <article key={n} className="card">
            <div className="step">{n}</div>
            <h3>{t}</h3>
            <p>{d}</p>
          </article>
        ))}
      </section>
      <section id="features" className="card quote">
        <h2>Healthy Soil Today, A Brighter Tomorrow</h2>
        <p>
          Predicted SOC is not a lab measurement. Browser GPS is not survey-grade. Blockchain in this prototype is an
          academic certificate, not a compliance offset. Those limits are documented because this is a major project,
          not a marketing site.
        </p>
      </section>
      <footer className="foot">AI for Agriculture · Real Data · Small Farmers · Carbon Credits · Sustainable Future</footer>
    </div>
  );
}

function Auth({ session, mode }) {
  const nav = useNavigate();
  const [role, setRole] = useState("FARMER");
  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    email: "",
    mobile: "",
    password: "",
    state: "Karnataka",
    district: "",
    village: "",
    pincode: "",
    requiredCredits: 500,
  });
  const [ident, setIdent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function register(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api("/auth/register", { method: "POST", body: { role, ...form } });
      session.save(r.user, r.token);
      nav(r.next || "/farmer/farm");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  async function login(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api("/auth/login", { method: "POST", body: { role, emailOrMobile: ident, password } });
      session.save(r.user, r.token);
      const farmerInReviewFlow = role === "FARMER" && ["PENDING", "APPROVED"].includes(r.user.verificationStatus);
      nav(farmerInReviewFlow ? "/farmer" : (r.next || (role === "FARMER" ? "/farmer/farm" : role === "ADMIN" ? "/admin" : "/company")));
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === "register";
  return (
    <div className="page slim">
      <header className="topbar">
        <Brand />
        <Link to="/">Home</Link>
      </header>
      <div className="auth-grid">
        <form className="card" onSubmit={isRegister ? register : login}>
          <h2>{isRegister ? "Create your account" : "Login"}</h2>
          <p className="muted">
            {isRegister
              ? "Enter your details and a password. Farm GPS mapping still happens after login — no SMS OTP on this screen."
              : "Email or 10-digit mobile and password. Admin farm verification is separate from login."}
          </p>
          <div className="role-tabs">
            {(isRegister ? ["FARMER", "COMPANY"] : ["FARMER", "COMPANY", "ADMIN"]).map((r) => (
              <button type="button" key={r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>
                {r}
              </button>
            ))}
          </div>
          {isRegister && (
            <>
              {role === "COMPANY" ? (
                <label>Company name<input name="companyName" value={form.companyName} onChange={onChange} required /></label>
              ) : (
                <label>Full name<input name="fullName" value={form.fullName} onChange={onChange} required /></label>
              )}
              <label>Email<input name="email" type="email" value={form.email} onChange={onChange} required /></label>
              <label>Mobile (10 digits)<input name="mobile" inputMode="numeric" value={form.mobile} onChange={onChange} required minLength={10} maxLength={10} /></label>
              <label>Password<input name="password" type="password" value={form.password} onChange={onChange} required minLength={6} /></label>
              {role === "FARMER" && (
                <>
                  <label>State
                    <select name="state" value={form.state} onChange={onChange}>
                      {["Karnataka", "Tamil Nadu", "Andhra Pradesh", "Kerala", "Maharashtra", "Telangana"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>District<input name="district" value={form.district} onChange={onChange} required /></label>
                  <label>Village / town<input name="village" value={form.village} onChange={onChange} /></label>
                  <label>PIN code<input name="pincode" value={form.pincode} onChange={onChange} /></label>
                </>
              )}
              {role === "COMPANY" && (
                <label>Credits required<input name="requiredCredits" type="number" value={form.requiredCredits} onChange={onChange} /></label>
              )}
              <button className="btn" type="submit" disabled={busy}>Create account and continue</button>
              <p className="muted">Already registered? <Link to="/login">Login</Link></p>
            </>
          )}
          {!isRegister && (
            <>
              <label>Email or mobile<input value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="Your email or 10-digit mobile" required /></label>
              <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
              <button className="btn" type="submit" disabled={busy}>Login</button>
              <p className="muted">New farmer or company? <Link to="/register">Register</Link></p>
            </>
          )}
          {err && <p className="error">{err}</p>}
        </form>
        <aside className="card green">
          <h3>Login is not farm verification</h3>
          <p>Use a password here. After login you still map the GPS boundary and send the farm to admin. pH, moisture and temperature come from the Arduino; the rest is predicted for that place.</p>
        </aside>
      </div>
    </div>
  );
}

function FarmerApp({ session }) {
  const [farmId, setFarmId] = useState(localStorage.getItem("ccf_farm") || "");
  const [dash, setDash] = useState(null);
  useEffect(() => {
    api("/auth/me").then((d) => session.save(d.user)).catch(() => {});
    api("/farmer/dashboard").then((d) => {
      setDash(d);
      const activeFarm = d.farms.find((farm) => farm._id === farmId) || d.farms[0];
      if (activeFarm) {
        setFarmId(activeFarm._id);
        localStorage.setItem("ccf_farm", activeFarm._id);
      } else {
        setFarmId("");
        localStorage.removeItem("ccf_farm");
      }
    }).catch(console.error);
  }, []);
  return (
    <Shell session={session} items={[
      ["Dashboard", "/farmer"],
      ["My Farm", "/farmer/farm"],
      ["Documents", "/farmer/documents"],
      ["GPS Mapping", "/farmer/gps"],
      ["Soil Readings", "/farmer/soil"],
      ["AI Analysis", "/farmer/ai"],
      ["Carbon Credits", "/farmer/credits"],
      ["Notifications", "/farmer/notifications"],
    ]}>
      <Routes>
        <Route path="" element={<FarmerHome dash={dash} farmId={farmId} session={session} />} />
        <Route path="farm" element={<FarmForm farmId={farmId} setFarmId={setFarmId} />} />
        <Route path="documents" element={<Docs farmId={farmId} />} />
        <Route path="gps" element={<GpsMap farmId={farmId} session={session} />} />
        <Route path="soil" element={<SoilForm farmId={farmId} status={session.user.verificationStatus} />} />
        <Route path="ai" element={<AiPanel farmId={farmId} />} />
        <Route path="credits" element={<CreditsPanel />} />
        <Route path="notifications" element={<NotifPanel />} />
      </Routes>
    </Shell>
  );
}

function Shell({ session, items, children }) {
  const loc = useLocation();
  useEffect(() => {
    api("/auth/me").then((d) => session.save(d.user)).catch(() => {});
  }, [loc.pathname]);
  return (
    <div className="app">
      <aside className="side">
        <Brand />
        {items.map(([l, to]) => (
          <Link key={to} className={loc.pathname === to ? "nav on" : "nav"} to={to}>{l}</Link>
        ))}
        <button className="nav" onClick={session.logout}>Logout</button>
      </aside>
      <main>
        <div className="crumb">{session.user.fullName || session.user.companyName} · {session.user.role} · {session.user.verificationStatus}</div>
        {children}
      </main>
    </div>
  );
}

function FarmerHome({ dash, farmId, session }) {
  const [msg, setMsg] = useState("");
  if (!dash) return <p>Loading dashboard…</p>;
  const u = dash.user;
  async function sendVerify() {
    setMsg("");
    try {
      const r = await api("/verification/farmer", { method: "POST", body: { farmId } });
      if (r.user) session.save(r.user);
      setMsg(r.message || "Sent to admin.");
    } catch (ex) {
      setMsg(ex.message);
    }
  }
  return (
    <>
      <h1>Welcome, {u.fullName}</h1>
      <p className="muted">{u.district}, {u.state} · verification: {u.verificationStatus}</p>
      <div className="stats">
        <Stat n={dash.stats.farms} l="Farm registered" />
        <Stat n={dash.stats.documents} l="Documents" />
        <Stat n={dash.stats.soilReadings} l="Soil readings" />
        <Stat n={dash.stats.credits.toFixed?.(2) || dash.stats.credits} l="Verified credits" />
      </div>
      <div className="split">
        <article className="card">
          <h3>Recent activity</h3>
          <ul>
            {dash.notifications.map((n) => (
              <li key={n._id}><strong>{n.title}</strong> — {n.body}</li>
            ))}
            {!dash.notifications.length && <li>No activity yet. Start with farm details.</li>}
          </ul>
        </article>
        <article className="card">
          {u.verificationStatus === "APPROVED" ? (
            <>
              <h3>Farm approved</h3>
              <p>Your farm has been approved by admin. Continue with soil readings to begin carbon analysis.</p>
              <Link className="btn" to="/farmer/soil">Continue to soil readings</Link>
            </>
          ) : u.verificationStatus === "PENDING" ? (
            <>
              <h3>Verification pending</h3>
              <p>Your farm details and GPS boundary are with admin for review. You can continue after approval.</p>
            </>
          ) : (
            <>
              <h3>Next step</h3>
              <ol>
                <li>Enter basic farm information</li>
                <li>Upload Aadhaar / land / farm image</li>
                <li>Walk the boundary with GPS</li>
                <li>Send verification to admin</li>
              </ol>
              <button className="btn" type="button" onClick={sendVerify}>Send / resend verification to admin</button>
            </>
          )}
          {msg && <p className={msg.startsWith("Sent") || msg.includes("PENDING") ? "ok" : "error"}>{msg}</p>}
        </article>
      </div>
    </>
  );
}

function Stat({ n, l }) {
  return (
    <div className="stat">
      <b>{n}</b>
      <span>{l}</span>
    </div>
  );
}

function FarmForm({ farmId, setFarmId }) {
  const nav = useNavigate();
  const [masters, setMasters] = useState({ crops: [], soils: [], practices: [] });
  const [form, setForm] = useState({
    cropType: "Paddy (Rice)",
    soilType: "Alluvial",
    farmAreaGuntha: 2,
    farmAreaAcres: 0.05,
    farmingPractice: "Organic",
    irrigationMethod: "Rainfed",
    state: "Karnataka",
    district: "",
  });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api("/masters").then(setMasters);
    api("/farms/mine").then((d) => {
      if (d.farms[0]) {
        const f = d.farms[0];
        const guntha = f.farmAreaGuntha || (f.farmAreaAcres ? Number((f.farmAreaAcres * 40).toFixed(2)) : 2);
        setForm({ ...form, ...f, farmAreaGuntha: guntha, farmAreaAcres: guntha / 40 });
        setFarmId(d.farms[0]._id);
        localStorage.setItem("ccf_farm", d.farms[0]._id);
      }
    });
  }, []);
  function setGuntha(g) {
    const farmAreaGuntha = Number(g);
    setForm({ ...form, farmAreaGuntha, farmAreaAcres: farmAreaGuntha / 40 });
  }
  async function save(e) {
    e.preventDefault();
    const body = { ...form, farmAreaAcres: form.farmAreaGuntha / 40 };
    const r = farmId
      ? await api(`/farms/${farmId}`, { method: "PUT", body })
      : await api("/farms", { method: "POST", body });
    setFarmId(r.farm._id);
    localStorage.setItem("ccf_farm", r.farm._id);
    setMsg("Farm saved.");
    nav("/farmer/documents");
  }
  return (
    <form className="card form" onSubmit={save}>
      <h2>Basic farm information</h2>
      <p className="muted">2 guntha is a valid small parcel (about 202 m² / 0.05 acre).</p>
      <label>Crop type
        <select value={form.cropType} onChange={(e) => setForm({ ...form, cropType: e.target.value })}>
          {masters.crops.map((c) => <option key={c._id}>{c.name}</option>)}
        </select>
      </label>
      <label>Soil type
        <select value={form.soilType} onChange={(e) => setForm({ ...form, soilType: e.target.value })}>
          {masters.soils.map((c) => <option key={c._id}>{c.name}</option>)}
        </select>
      </label>
      <label>Farm area (guntha)
        <input type="number" step="0.1" min="0.5" value={form.farmAreaGuntha} onChange={(e) => setGuntha(e.target.value)} />
      </label>
      <p className="muted">{form.farmAreaGuntha} guntha = {(form.farmAreaGuntha / 40).toFixed(3)} acres = {(form.farmAreaGuntha * 101.1714105).toFixed(0)} m²</p>
      <label>Farming practice
        <select value={form.farmingPractice} onChange={(e) => setForm({ ...form, farmingPractice: e.target.value })}>
          {masters.practices.map((c) => <option key={c._id}>{c.name}</option>)}
        </select>
      </label>
      <label>Irrigation method
        <select value={form.irrigationMethod} onChange={(e) => setForm({ ...form, irrigationMethod: e.target.value })}>
          {["Rainfed", "Canal", "Drip", "Sprinkler", "Well"].map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <button className="btn" type="submit">Next — documents</button>
      {msg && <p className="ok">{msg}</p>}
    </form>
  );
}

function Docs({ farmId }) {
  const nav = useNavigate();
  const [docs, setDocs] = useState([]);
  const [msg, setMsg] = useState("");
  const refresh = () => api(`/documents?farmId=${farmId}`).then((d) => setDocs(d.documents));
  useEffect(() => { if (farmId) refresh(); }, [farmId]);
  async function send(kind, file) {
    if (!farmId) {
      setMsg("Save farm details first, then upload documents.");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      fd.append("farmId", farmId);
      const data = await api("/documents", { method: "POST", body: fd });
      setMsg(data.note);
      refresh();
    } catch (ex) {
      setMsg(ex.message);
    }
  }
  return (
    <div className="card">
      <h2>Upload required documents</h2>
      <p className="muted">AI/OCR only assists from the filename. Admin decides.</p>
      {[
        ["IDENTITY", "Aadhaar / identity"],
        ["LAND_OWNERSHIP", "Land ownership"],
        ["FARM_IMAGE", "Farm image"],
      ].map(([kind, label]) => (
        <label key={kind} className="upload">
          {label}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => e.target.files[0] && send(kind, e.target.files[0])} />
        </label>
      ))}
      <ul>
        {docs.map((d) => (
          <li key={d._id}>{d.kind} — {d.originalName} {d.ocrAssist?.notes && <em>({d.ocrAssist.notes})</em>}</li>
        ))}
      </ul>
      {msg && <p className="ok">{msg}</p>}
      <button className="btn" type="button" disabled={docs.length < 1} onClick={() => nav("/farmer/gps")}>Next — map 2 guntha boundary</button>
    </div>
  );
}

const GUNTHA_M2 = 101.1714105;

function GpsMap({ farmId, session }) {
  const nav = useNavigate();
  const [points, setPoints] = useState([]);
  const [recording, setRecording] = useState(false);
  const [tapMode, setTapMode] = useState(true);
  const [acc, setAcc] = useState(null);
  const [msg, setMsg] = useState("");

  const [tileFallback, setTileFallback] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState(null);
  const [searchError, setSearchError] = useState("");
  const watchRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const tileCount = document.querySelectorAll(".leaflet-tile").length;
      if (tileCount === 0) setTileFallback(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const area = useMemo(() => {
    if (points.length < 3) return null;
    const ring = [...points.map((p) => [p.lng, p.lat]), [points[0].lng, points[0].lat]];
    try {
      const sqm = turf.area(turf.polygon([ring]));
      return { sqm, ha: sqm / 10000, acres: sqm / 4046.8564224, guntha: sqm / GUNTHA_M2 };
    } catch {
      return null;
    }
  }, [points]);

  function addPoint(lat, lng, accuracy) {

    setPoints((prev) => {
      const last = prev[prev.length - 1];
      if (last) {
        const dist = turf.distance(turf.point([last.lng, last.lat]), turf.point([lng, lat]), { units: "meters" });
        if (dist < 0.35) return prev;
      }
      return [...prev, { lat, lng, accuracy, recordedAt: new Date().toISOString() }];
    });
  }

  function start() {
    if (!navigator.geolocation) {
      setMsg("Geolocation is not available. Tap the four corners of your 2-gunta plot on the map.");
      setTapMode(true);
      return;
    }
    setRecording(true);
    setTapMode(false);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setAcc(accuracy);
        addPoint(latitude, longitude, accuracy);
      },
      (err) => {
        setMsg(err.message + " — tap corners on the map instead.");
        setTapMode(true);
      },
      { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 }
    );
  }
  function stop() {
    setRecording(false);
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
  }
  async function confirm() {
    if (!farmId) {
      setMsg("Save farm details first.");
      return false;
    }
    if (!area || area.guntha < 0.4) {
      setMsg("Need a closed polygon. For 2 guntha, mark at least 3–4 corners.");
      return false;
    }
    try {
      await api("/boundaries", {
        method: "POST",
        body: {
          farmId,
          points,
          areaSqM: area.sqm,
          areaAcres: area.acres,
          areaHectares: area.ha,
          areaGuntha: area.guntha,
          gpsAccuracyAvg: acc,
        },
      });

      setMsg(`Boundary saved: ${area.guntha.toFixed(2)} guntha. Press Next to send for admin verification.`);
      return true;
    } catch (ex) {
      setMsg(ex.message);
      return false;
    }
  }
  async function next() {
    try {
      const ok = await confirm();
      if (!ok) return;
      const r = await api("/verification/farmer", { method: "POST", body: { farmId } });
      if (r.user) session.save(r.user);
      nav("/farmer");
    } catch (ex) {
      setMsg(ex.message);
    }
  }

  const center = searchTarget ? [searchTarget.lat, searchTarget.lon] : (points[0] ? [points[0].lat, points[0].lng] : [12.2958, 76.6394]);
  const smallOk = area && area.guntha >= 0.8 && area.guntha <= 6;

  async function searchLocation() {
    const q = searchQuery.trim();
    if (!q) {
      setSearchError("Enter a place name or address.");
      return;
    }
    setSearchError("");
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!Array.isArray(data) || !data[0]) {
        setSearchError("Location not found. Try a broader place name.");
        return;
      }
      const place = data[0];
      setSearchTarget({ lat: Number(place.lat), lon: Number(place.lon), display: place.display_name });
      setMsg(`Focused on: ${place.display_name}`);
    } catch (ex) {
      setSearchError("Could not search that location right now.");
    }
  }

  return (
    <div className="card">
      <h2>GPS farm boundary — small land (2 guntha)</h2>
      <p className="muted">
        2 guntha ≈ 202 m² (about 14 m × 14 m). Walk slowly around the plot, or tap each corner on the map.
        Leaflet + OpenStreetMap + Turf.js. No satellite land-cover classification.
      </p>
      <div className="search-row">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search village, district, or address"
          aria-label="Search location"
        />
        <button className="btn" type="button" onClick={searchLocation}>Search</button>
      </div>
      {searchError && <p className="error">{searchError}</p>}
      {searchTarget && <p className="ok">Focused on: {searchTarget.display}</p>}
      <div className="map-wrap">
        {tileFallback ? (
          <div className="map-fallback-graphic" role="img" aria-label="Map fallback">
            <svg viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">
              <rect width="800" height="400" fill="#dfeee6"/>
              <path d="M0 90 L200 50 L420 100 L800 40 L800 400 L0 400 Z" fill="#cfe5d6"/>
              <path d="M0 260 L180 220 L340 280 L540 220 L800 300 L800 400 L0 400 Z" fill="#c7ddd0"/>
              <path d="M70 40 L120 350" stroke="#e9d7a8" strokeWidth="24" strokeLinecap="round" fill="none" opacity="0.9"/>
              <path d="M250 20 L340 370" stroke="#e9d7a8" strokeWidth="18" strokeLinecap="round" fill="none" opacity="0.8"/>
              <path d="M500 10 L620 360" stroke="#e9d7a8" strokeWidth="20" strokeLinecap="round" fill="none" opacity="0.8"/>
              <path d="M40 140 L760 120" stroke="#bfd8c8" strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.9"/>
              <path d="M90 220 L690 250" stroke="#bfd8c8" strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.9"/>
              <path d="M120 330 L680 340" stroke="#bfd8c8" strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.9"/>
              {searchTarget && (
                <circle cx={180 + ((searchTarget.lon - 72) * 1200)} cy={180 + ((12.5 - searchTarget.lat) * 1200)} r="12" fill="#1a6b45" opacity="0.9" />
              )}
              <text x="30" y="38" fill="#0b3d2e" fontSize="24" fontWeight="700">Map view</text>
              <text x="30" y="64" fill="#0b3d2e" fontSize="14">Tap corners to trace the 2-guntha plot</text>
            </svg>
            <div className="map-fallback-label">Map tiles unavailable — tap the plot corners on this map.</div>
          </div>
        ) : (
          <MapContainer center={center} zoom={20} maxZoom={22} style={{ height: 400, width: "100%" }}>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={22}
              maxNativeZoom={19}
              eventHandlers={{ tileerror: () => setTileFallback(true) }}
            />
            {points.length > 1 && <Polygon positions={points.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#1a6b45" }} />}
            {points.map((p, i) => (
              <CircleMarker key={i} center={[p.lat, p.lng]} radius={6} pathOptions={{ color: "#0b3d2e" }} />
            ))}
            {searchTarget && <CircleMarker center={[searchTarget.lat, searchTarget.lon]} radius={8} pathOptions={{ color: "#0f766e" }} />}
            <Recenter center={searchTarget ? [searchTarget.lat, searchTarget.lon] : (points.at(-1) ? [points.at(-1).lat, points.at(-1).lng] : center)} zoom={20} />
            <MapClick enabled={tapMode && !recording} onAdd={(lat, lng) => addPoint(lat, lng, null)} />
          </MapContainer>
        )}
      </div>
      <div className="row">
        {!recording ? <button className="btn danger" type="button" onClick={start}>Start walking GPS</button> : <button className="btn" type="button" onClick={stop}>Stop walk</button>}
        <button className="btn ghost" type="button" onClick={() => setTapMode((v) => !v)}>{tapMode ? "Tap-corners on" : "Enable tap corners"}</button>
        <button className="btn ghost" type="button" onClick={() => setPoints((p) => p.slice(0, -1))}>Delete last point</button>
        <button className="btn ghost" type="button" onClick={() => { setPoints([]); }}>Clear</button>
        <button className="btn" type="button" disabled={!area} onClick={confirm}>Save boundary</button>
        <button className="btn" type="button" disabled={!area} onClick={next}>Next — send to admin</button>
      </div>
      {acc != null && (
        <p className={acc > 8 ? "warn" : "ok"}>
          GPS accuracy: ±{acc.toFixed(1)} m
          {acc > 8 ? " — for a 2-gunta plot, tap the four corners on the map for a cleaner boundary." : ""}
        </p>
      )}
      {area && (
        <ul className="area">
          <li>{area.sqm.toFixed(1)} m²</li>
          <li>{area.ha.toFixed(4)} ha</li>
          <li>{area.acres.toFixed(4)} acres</li>
          <li>{area.guntha.toFixed(2)} guntha {smallOk ? "(small-land OK, including 2 guntha)" : ""}</li>
        </ul>
      )}
      <p className="muted">Points: {points.length} · Tap the map to drop corners if walking GPS jumps.</p>
      {msg && <p className="ok">{msg}</p>}
    </div>
  );
}

function MapClick({ enabled, onAdd }) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom || map.getZoom()); }, [center, zoom, map]);
  return null;
}

function SoilForm({ farmId, status }) {
  const [stage, setStage] = useState("BEFORE_FARMING");
  const [live, setLive] = useState(null);
  const [readings, setReadings] = useState([]);
  const [properties, setProperties] = useState(null);
  const [propertyError, setPropertyError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    api("/soil-readings").then((d) => setReadings(d.readings));
    api(`/iot/latest?farmId=${farmId || ""}`).then((d) => setLive(d.live)).catch(() => {});
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [farmId]);
  useEffect(() => {
    if (status !== "APPROVED" || !farmId || live?.ph == null) {
      setProperties(null);
      setPropertyError("");
      return;
    }
    let current = true;
    setProperties(null);
    setPropertyError("");
    api("/soil-readings/from-sensors", {
      method: "POST",
      body: { farmId, stage, soilDepth: 15, preview: true },
    }).then((result) => {
      if (current) setProperties(result.properties);
    }).catch((ex) => {
      if (current) setPropertyError(ex.message);
    });
    return () => { current = false; };
  }, [farmId, stage, status, live?.ph, live?.moisture, live?.temperature]);

  async function simulate() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api("/iot/simulate", { method: "POST", body: { farmId } });
      setLive(r.live);
      setMsg(r.note);
    } catch (ex) {
      setMsg(ex.message);
    } finally {
      setBusy(false);
    }
  }

  async function capture(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await api("/soil-readings/from-sensors", { method: "POST", body: { farmId, stage, soilDepth: 15 } });
      setProperties(r.filled.properties || r.filled);
      setMsg(`Saved ${stage}: Arduino pH ${r.live.ph}, moisture ${r.live.moisture}%, ${r.live.temperature}°C. Location-based model filled EC/NPK/SOC.`);
      refresh();
    } catch (ex) {
      setMsg(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Soil station — Arduino + place-based ML</h2>
      <p className="muted">
        Hardware: <strong>EC20-BNC pH</strong> (BNC → PH-4502C → A0), capacitive moisture (A1), temperature (LM35/DS18B20).
        Flash <code>arduino/soil_station/soil_station.ino</code> and run <code>python arduino/serial_bridge.py</code>.
        EC, N, P, K, texture and SOC are predicted from GPS location, soil type, season and those three live sensors.
      </p>
      {status !== "APPROVED" && <p className="warn">Admin farm approval is required before storing carbon-analysis readings.</p>}
      <div className="stats">
        <Stat n={live?.ph ?? "—"} l="pH (EC20-BNC)" />
        <Stat n={live?.moisture != null ? `${live.moisture}%` : "—"} l="Moisture" />
        <Stat n={live?.temperature != null ? `${live.temperature}°C` : "—"} l="Temperature" />
        <Stat n={live?.deviceId || "offline"} l="Arduino" />
      </div>
      <div className="row">
        <button className="btn ghost" type="button" disabled={busy} onClick={simulate}>Simulate Arduino packet</button>
        <button className="btn" type="button" disabled={busy} onClick={refresh}>Refresh live sensors</button>
      </div>
      <div className="role-tabs">
        {["BEFORE_FARMING", "AFTER_FARMING"].map((s) => (
          <button type="button" key={s} className={stage === s ? "on" : ""} onClick={() => setStage(s)}>{s.replace("_", " ")}</button>
        ))}
      </div>
      <div className="card inner">
        <h3>Automatic estimates � {stage.replace("_", " ")}</h3>
        <p className="muted">Based on mapped farm location, soil type, season, and latest Arduino pH, moisture, and temperature. Estimates are not lab results.</p>
        {properties ? (
          <div className="stats">
            <Stat n={`${Number(properties.ec).toFixed(2)} dS/m`} l="EC estimate" />
            <Stat n={`${Number(properties.nitrogen).toFixed(1)} kg/ha`} l="N estimate" />
            <Stat n={`${Number(properties.phosphorus).toFixed(1)} kg/ha`} l="P estimate" />
            <Stat n={`${Number(properties.potassium).toFixed(1)} kg/ha`} l="K estimate" />
          </div>
        ) : (
          <p className={propertyError ? "warn" : "muted"}>{propertyError || (status !== "APPROVED" ? "Admin approval is required to generate soil estimates." : live?.ph == null ? "Waiting for an Arduino reading. Connect the station or press Simulate Arduino." : "Calculating estimates�")}</p>
        )}
      </div>
      <form onSubmit={capture}>
        <button className="btn" type="submit" disabled={busy || status !== "APPROVED"}>Save {stage.replace("_", " ")} from Arduino + ML</button>
      </form>
      {msg && <p className={String(msg).toLowerCase().includes("save") || String(msg).includes("Simulated") ? "ok" : "error"}>{msg}</p>}
      <table>
        <thead><tr><th>Stage</th><th>Source</th><th>pH</th><th>Moist</th><th>Temp</th><th>EC</th><th>N</th><th>P</th><th>K</th><th>SOC</th></tr></thead>
        <tbody>
          {readings.map((r) => (
            <tr key={r._id}>
              <td>{r.stage}</td>
              <td>{r.dataLabel}</td>
              <td>{r.ph}</td>
              <td>{r.moisture}</td>
              <td>{r.temperature}</td>
              <td>{r.ec}</td>
              <td>{r.nitrogen}</td>
              <td>{r.phosphorus}</td>
              <td>{r.potassium}</td>
              <td>{r.measuredSocPercent}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AiPanel({ farmId }) {
  const [out, setOut] = useState(null);
  const [model, setModel] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/ai/model").then(setModel).catch(() => {}); }, []);
  async function run() {
    setErr("");
    try {
      setOut(await api("/ai/analyze", { method: "POST", body: { farmId } }));
    } catch (ex) {
      setErr(ex.message);
    }
  }
  const imp = out?.ai?.feature_importance || [];
  return (
    <div>
      <div className="card">
        <h2>AI soil carbon analysis</h2>
        <p className="muted">The model predicts <strong>SOC (%)</strong> from laboratory-compatible soil features. Carbon accounting is a separate IPCC module.</p>
        <button className="btn" type="button" onClick={run}>Run AI analysis</button>
        {err && <p className="error">{err}</p>}
        {out && (
          <div className="stats">
            <Stat n={`${out.ai.predicted_soc_percent}%`} l="Predicted SOC (after)" />
            <Stat n={out.assessment.socChange != null ? `${out.assessment.socChange.toFixed(3)}%` : "—"} l="SOC change" />
            <Stat n={out.assessment.co2eTonnesPerHa != null ? `${out.assessment.co2eTonnesPerHa} t/ha` : "—"} l="Estimated CO₂e" />
            <Stat n={out.assessment.estimatedCredits ?? "—"} l="Eligible credits" />
          </div>
        )}
      </div>
      {imp.length > 0 && (
        <div className="card">
          <h3>Top contributing factors</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={imp} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="feature" width={160} />
              <Tooltip />
              <Bar dataKey="importance" fill="#1a6b45" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="card">
        <h3>AI model information</h3>
        {model ? (
          <ul>
            <li>Model: {model.model_name}</li>
            <li>Training dataset: {model.training_dataset}</li>
            <li>Rows used: {model.n_rows_used}</li>
            <li>R² (test): {model.metrics_test?.R2?.toFixed(3)}</li>
            <li>MAE: {model.metrics_test?.MAE?.toFixed(3)}</li>
            <li>RMSE: {model.metrics_test?.RMSE?.toFixed(3)}</li>
            <li>Target: {model.target_definition}</li>
          </ul>
        ) : <p>Start the Python AI service to load live metrics.</p>}
      </div>
      {out?.assessment && (
        <div className="card">
          <h3>Carbon accounting (separate from AI)</h3>
          <p>{out.assessment.methodology}</p>
          <p>Status: {out.assessment.verificationStatus} · {out.assessment.eligibilityStatus}</p>
          <p>SOC before ({out.assessment.socBeforeSource}): {out.assessment.socBefore} · after ({out.assessment.socAfterSource}): {out.assessment.socAfter}</p>
        </div>
      )}
    </div>
  );
}

function CreditsPanel() {
  const [data, setData] = useState({ credits: [], assessments: [] });
  const [tx, setTx] = useState(null);
  useEffect(() => { api("/carbon").then(setData); }, []);
  return (
    <div className="card">
      <h2>Carbon credits</h2>
      <table>
        <thead><tr><th>Project</th><th>Qty</th><th>Status</th><th>Certificate</th></tr></thead>
        <tbody>
          {data.credits.map((c) => (
            <tr key={c._id}>
              <td>{c.projectName}</td>
              <td>{c.quantity}</td>
              <td><span className="badge">{c.verificationStatus}</span></td>
              <td>
                {c.certificateId ? (
                  <button className="linkish" type="button" onClick={() => api(`/blockchain/${c._id}`).then((d) => setTx(d.tx))}>View on blockchain</button>
                ) : "Pending admin"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tx && (
        <pre className="cert">{JSON.stringify(tx, null, 2)}</pre>
      )}
    </div>
  );
}

function NotifPanel() {
  const [n, setN] = useState([]);
  useEffect(() => { api("/notifications").then((d) => setN(d.notifications)); }, []);
  return (
    <div className="card">
      <h2>Notifications</h2>
      <ul>{n.map((x) => <li key={x._id}><strong>{x.title}</strong> — {x.body}</li>)}</ul>
      {!n.length && <p>No notifications.</p>}
    </div>
  );
}

function AdminApp({ session }) {
  return (
    <Shell session={session} items={[
      ["Dashboard", "/admin"],
      ["Farmer requests", "/admin/farmers"],
      ["Company requests", "/admin/companies"],
      ["Carbon / AI", "/admin/carbon"],
      ["Marketplace", "/admin/market"],
    ]}>
      <Routes>
        <Route path="" element={<AdminHome />} />
        <Route path="farmers" element={<RequestQueue type="FARMER" />} />
        <Route path="companies" element={<RequestQueue type="COMPANY" />} />
        <Route path="carbon" element={<AdminCarbon />} />
        <Route path="market" element={<Market />} />
      </Routes>
    </Shell>
  );
}

function AdminHome() {
  const [d, setD] = useState(null);
  useEffect(() => { api("/admin/overview").then(setD); }, []);
  if (!d) return <p>Loading…</p>;
  return (
    <>
      <h1>Admin dashboard</h1>
      <div className="stats">
        <Stat n={d.farmerReq} l="Farmer requests" />
        <Stat n={d.companyReq} l="Company requests" />
        <Stat n={d.verifiedFarmers} l="Verified farmers" />
        <Stat n={d.verifiedCompanies} l="Verified companies" />
      </div>
      <div className="card">
        <h3>Recent requests</h3>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            {d.recent.map((r) => (
              <tr key={r._id}><td>{r.subject?.fullName || r.subject?.companyName}</td><td>{r.subjectType}</td><td>{r.status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RequestQueue({ type }) {
  const [tab, setTab] = useState("PENDING");
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [correctionRequest, setCorrectionRequest] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyRequest, setBusyRequest] = useState("");
  const load = () => api(`/admin/requests?type=${type}&status=${tab}`).then((d) => setRows(d.requests));
  useEffect(() => { load(); }, [tab, type]);
  async function decide(requestId, status, note = "") {
    if (status === "CORRECTION_REQUIRED" && !note.trim()) {
      setActionError("Enter the correction required before sending this request back.");
      return;
    }
    setBusyRequest(requestId);
    setActionError("");
    try {
      await api("/admin/decide", { method: "POST", body: { requestId, status, adminNote: note.trim() } });
      await load();
      setDetail(null);
      setCorrectionRequest(null);
      setAdminNote("");
    } catch (ex) {
      setActionError(ex.message);
    } finally {
      setBusyRequest("");
    }
  }
  return (
    <div>
      <div className="role-tabs">
        {["PENDING", "APPROVED", "REJECTED", "CORRECTION_REQUIRED"].map((t) => (
          <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Location</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {!rows.length && (
              <tr><td colSpan={4}>No {tab.toLowerCase()} {type.toLowerCase()} verification requests.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{r.subject?.fullName || r.subject?.companyName || "Unknown account"}</td>
                <td>{r.subject?.district || r.subject?.location}</td>
                <td>{r.status}</td>
                <td>
                  {type === "FARMER" && r.subject && (
                    <button type="button" className="linkish" onClick={() => api(`/admin/farmer/${r.subject.id}`).then(setDetail).catch((e) => alert(e.message))}>View</button>
                  )}
                  {r.status === "PENDING" && (
                    <>
                      <button type="button" className="btn" onClick={() => decide(r._id, "APPROVED")}>Approve</button>
                      <button type="button" className="btn ghost" onClick={() => { setCorrectionRequest(r); setAdminNote(""); setActionError(""); }}>Correction</button>
                      <button type="button" className="btn danger" onClick={() => decide(r._id, "REJECTED")}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {correctionRequest && (
        <div className="card" role="dialog" aria-modal="true" aria-labelledby="correction-title">
          <h3 id="correction-title">Request corrections � {correctionRequest.subject?.fullName || correctionRequest.subject?.companyName || "applicant"}</h3>
          <label>
            Explain what needs to be corrected
            <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={4} required />
          </label>
          {actionError && <p className="error">{actionError}</p>}
          <div className="row">
            <button type="button" className="btn" disabled={busyRequest === correctionRequest._id} onClick={() => decide(correctionRequest._id, "CORRECTION_REQUIRED", adminNote)}>
              {busyRequest === correctionRequest._id ? "Sending�" : "Send correction request"}
            </button>
            <button type="button" className="btn ghost" disabled={busyRequest === correctionRequest._id} onClick={() => { setCorrectionRequest(null); setActionError(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {detail && (
        <div className="card">
          <h3>Verify farmer — {detail.user.fullName}</h3>
          <p>{detail.user.district}, {detail.user.state}</p>
          {detail.boundaries[0] && (
            <MapContainer center={[detail.boundaries[0].points[0].lat, detail.boundaries[0].points[0].lng]} zoom={17} style={{ height: 280 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={22}
              maxNativeZoom={19} />
              <Polygon positions={detail.boundaries[0].points.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#1a6b45" }} />
            </MapContainer>
          )}
          <p>Documents: {detail.documents.map((d) => d.kind).join(", ") || "none"}</p>
          <p>GPS accuracy: {detail.boundaries[0]?.gpsAccuracyAvg} m · area {detail.boundaries[0]?.areaAcres?.toFixed?.(3)} acres</p>
        </div>
      )}
    </div>
  );
}

function AdminCarbon() {
  const [data, setData] = useState({ assessments: [], credits: [] });
  const [hist, setHist] = useState([]);
  useEffect(() => {
    api("/carbon").then(setData);
    api("/ai/history").then((d) => setHist(d.results));
  }, []);
  async function verify(id, approve) {
    await api("/admin/carbon/verify", { method: "POST", body: { assessmentId: id, approve } });
    api("/carbon").then(setData);
  }
  return (
    <div className="card">
      <h2>AI predictions & carbon assessments</h2>
      <p className="muted">Distinguish PREDICTED (AI) · ESTIMATED (accounting) · VERIFIED (admin + chain).</p>
      <table>
        <thead><tr><th>SOC after</th><th>Change</th><th>CO2e/ha</th><th>Credits</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {data.assessments.map((a) => (
            <tr key={a._id}>
              <td>{a.socAfter} ({a.socAfterSource})</td>
              <td>{a.socChange}</td>
              <td>{a.co2eTonnesPerHa}</td>
              <td>{a.estimatedCredits}</td>
              <td>{a.verificationStatus}</td>
              <td>
                {a.verificationStatus !== "VERIFIED" && (
                  <>
                    <button className="btn" type="button" onClick={() => verify(a._id, true)}>Certify on chain</button>
                    <button className="btn danger" type="button" onClick={() => verify(a._id, false)}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Prediction history</h3>
      <ul>{hist.map((h) => <li key={h._id}>{h.modelName} v{h.modelVersion} → {h.predictedSocPercent}% SOC ({h.status})</li>)}</ul>
    </div>
  );
}

function CompanyApp({ session }) {
  return (
    <Shell session={session} items={[
      ["Dashboard", "/company"],
      ["Marketplace", "/company/market"],
      ["Purchases", "/company/purchases"],
    ]}>
      <Routes>
        <Route path="" element={<CompanyHome session={session} />} />
        <Route path="market" element={<Market buy />} />
        <Route path="purchases" element={<Purchases />} />
      </Routes>
    </Shell>
  );
}

function CompanyHome({ session }) {
  const u = session.user;
  async function request() {
    try {
      const r = await api("/verification/company", { method: "POST", body: {} });
      if (r.user) session.save(r.user);
      else session.save({ ...u, verificationStatus: "PENDING" });
    } catch (ex) {
      alert(ex.message);
    }
  }
  return (
    <div>
      <h1>{u.companyName}</h1>
      <div className="stats">
        <Stat n={u.requiredCredits || 0} l="Credits required" />
        <Stat n={u.verificationStatus} l="Status" />
      </div>
      {["NOT_SUBMITTED", "REJECTED", "CORRECTION_REQUIRED"].includes(u.verificationStatus) && (
        <button className="btn" type="button" onClick={request}>Send verification request</button>
      )}
      {u.verificationStatus === "PENDING" && <p className="ok">Waiting for admin approval.</p>}
      {u.verificationStatus === "APPROVED" && <p className="ok">Company verified. You can buy listed credits.</p>}
    </div>
  );
}

function Market({ buy }) {
  const [listings, setListings] = useState([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/marketplace").then((d) => setListings(d.listings)); }, []);
  async function purchase(id) {
    try {
      const r = await api("/purchases", { method: "POST", body: { listingId: id } });
      setMsg(`Purchase successful. Tx ${r.purchase.transactionId}`);
      api("/marketplace").then((d) => setListings(d.listings));
    } catch (e) {
      setMsg(e.message);
    }
  }
  return (
    <div className="card">
      <h2>Carbon credit marketplace</h2>
      <p className="muted">Only admin-verified, blockchain-certified credits are listed.</p>
      <div className="market">
        {listings.map((l) => (
          <article key={l._id} className="card inner">
            <h3>{l.projectName}</h3>
            <p>{l.location} · {l.crop}</p>
            <p>{l.quantity} credits · ₹{l.priceInr}</p>
            <p className="muted">{l.txHash}</p>
            {buy && <button className="btn" type="button" onClick={() => purchase(l._id)}>Buy now</button>}
          </article>
        ))}
        {!listings.length && <p>No verified listings yet.</p>}
      </div>
      {msg && <p className="ok">{msg}</p>}
    </div>
  );
}

function Purchases() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api("/purchases").then((d) => setRows(d.purchases)); }, []);
  return (
    <div className="card">
      <h2>Purchase history</h2>
      <table>
        <thead><tr><th>ID</th><th>Qty</th><th>Total</th><th>Chain</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p._id}><td>{p.transactionId}</td><td>{p.quantity}</td><td>₹{p.totalInr}</td><td>{p.blockchainTxHash}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
