import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import {
  User,
  Farm,
  FarmBoundary,
  Document,
  VerificationRequest,
  SoilReading,
  ArduinoLive,
  AIResult,
  CarbonAssessment,
  CarbonCredit,
  BlockchainTransaction,
  MarketplaceListing,
  Purchase,
  Notification,
  CropMaster,
  SoilMaster,
  FarmingPractice,
} from "./models.js";
import { auth, roles, signToken } from "./auth.js";
import { account } from "./carbonAccounting.js";
import { certifyCredit } from "./blockchain.js";
import { normalizeMobile } from "./sms.js";
import { hashPassword, checkPassword } from "./passwords.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "../uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /pdf|jpeg|jpg|png|webp/i.test(file.mimetype) || /\.(pdf|jpg|jpeg|png|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only PDF/JPG/PNG/WebP up to 5 MB"), ok);
  },
});

const AI_URL = process.env.AI_URL || "http://127.0.0.1:43122";

export const router = Router();

function ident(emailOrMobile) {
  return String(emailOrMobile || "").trim().toLowerCase();
}

function nextPath(user) {
  if (user.role === "FARMER") {
    return ["PENDING", "APPROVED"].includes(user.verificationStatus) ? "/farmer" : "/farmer/farm";
  }
  return user.role === "ADMIN" ? "/admin" : "/company";
}

router.post("/auth/register", async (req, res) => {
  const { role, fullName, companyName, email, mobile, state, district, village, pincode, location, requiredCredits, password } = req.body || {};
  if (!["FARMER", "COMPANY"].includes(role)) return res.status(400).json({ error: "Register as FARMER or COMPANY" });
  if (!email || !mobile) return res.status(400).json({ error: "Email and mobile are required" });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  const mobile10 = normalizeMobile(mobile);
  if (!mobile10) return res.status(400).json({ error: "Enter a valid 10-digit mobile number" });
  if (!fullName && !companyName) return res.status(400).json({ error: "Name is required" });
  try {
    let user = await User.findOne({ $or: [{ email: ident(email) }, { mobile: mobile10 }] });
    if (user && user.role !== role) {
      return res.status(400).json({ error: "This mobile/email is already registered as a different role" });
    }
    if (!user) {
      user = await User.create({
        role,
        fullName: fullName || companyName,
        companyName,
        email: String(email).trim().toLowerCase(),
        mobile: mobile10,
        state,
        district,
        village,
        location: location || [village, district, state].filter(Boolean).join(", "),
        pincode,
        requiredCredits,
        passwordHash: await hashPassword(password),
        verificationStatus: "NOT_SUBMITTED",
      });
    } else {
      user.fullName = fullName || companyName || user.fullName;
      user.district = district || user.district;
      user.village = village || user.village;
      user.pincode = pincode || user.pincode;
      user.passwordHash = await hashPassword(password);
      await user.save();
    }
    const token = signToken(user);
    res.json({ token, user: publicUser(user), next: nextPath(user), loggedIn: true });
  } catch (e) {
    res.status(400).json({ error: e.message.includes("dup") ? "Email or mobile already registered" : e.message });
  }
});

router.post("/auth/login", async (req, res) => {
  const { role, emailOrMobile, password } = req.body || {};
  if (!role || !String(emailOrMobile || "").trim() || !password) {
    return res.status(400).json({ error: "Role, email/mobile and password are required" });
  }
  const user = await findAccount(role, emailOrMobile);
  if (!user) return res.status(404).json({ error: "No account for that role and mobile/email. Register first." });
  const ok = await checkPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect password" });
  res.json({ token: signToken(user), user: publicUser(user), next: nextPath(user), loggedIn: true });
});

async function findAccount(role, emailOrMobile) {
  const mobile10 = normalizeMobile(emailOrMobile);
  return User.findOne({
    ...(role ? { role } : {}),
    $or: [
      { email: ident(emailOrMobile) },
      { mobile: mobile10 || String(emailOrMobile || "").replace(/\D/g, "") },
    ],
  });
}

router.get("/auth/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

router.get("/masters", async (_req, res) => {
  const [crops, soils, practices] = await Promise.all([
    CropMaster.find(),
    SoilMaster.find(),
    FarmingPractice.find(),
  ]);
  res.json({ crops, soils, practices });
});

router.post("/farms", auth, roles("FARMER"), async (req, res) => {
  const farm = await Farm.create({ ...req.body, farmerId: req.user._id });
  await Notification.create({ userId: req.user._id, title: "Farm details saved", body: `${farm.cropType || "Farm"} profile updated.` });
  res.json({ farm });
});

router.get("/farms/mine", auth, roles("FARMER"), async (req, res) => {
  const farms = await Farm.find({ farmerId: req.user._id }).sort({ updatedAt: -1 });
  res.json({ farms });
});

router.put("/farms/:id", auth, roles("FARMER"), async (req, res) => {
  const farm = await Farm.findOneAndUpdate({ _id: req.params.id, farmerId: req.user._id }, req.body, { new: true });
  if (!farm) return res.status(404).json({ error: "Farm not found" });
  res.json({ farm });
});

router.post("/documents", auth, roles("FARMER"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File required" });
  const ocr = assistOcr(req.file);
  const doc = await Document.create({
    farmerId: req.user._id,
    farmId: req.body.farmId,
    kind: req.body.kind,
    originalName: req.file.originalname,
    path: req.file.path,
    mimeType: req.file.mimetype,
    ocrAssist: ocr,
  });
  res.json({ document: doc, note: "OCR/filename assist only — admin makes the verification decision." });
});

router.get("/documents", auth, async (req, res) => {
  const q = req.user.role === "ADMIN" ? {} : { farmerId: req.user._id };
  if (req.query.farmId) q.farmId = req.query.farmId;
  const documents = await Document.find(q).sort({ createdAt: -1 });
  res.json({ documents });
});

router.get("/documents/:id/file", auth, async (req, res) => {
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  if (req.user.role !== "ADMIN" && String(doc.farmerId) !== String(req.user._id)) return res.status(403).json({ error: "Forbidden" });
  res.sendFile(doc.path);
});

router.post("/boundaries", auth, roles("FARMER"), async (req, res) => {
  const { farmId, points, areaSqM, areaAcres, areaHectares, areaGuntha, gpsAccuracyAvg } = req.body || {};
  if (!Array.isArray(points) || points.length < 3) return res.status(400).json({ error: "Need at least 3 GPS points" });
  const boundary = await FarmBoundary.findOneAndUpdate(
    { farmId, farmerId: req.user._id },
    {
      farmId,
      farmerId: req.user._id,
      points,
      areaSqM,
      areaAcres,
      areaHectares,
      areaGuntha,
      gpsAccuracyAvg,
      status: "CONFIRMED",
    },
    { upsert: true, new: true }
  );
  res.json({ boundary });
});

router.get("/boundaries/:farmId", auth, async (req, res) => {
  const boundary = await FarmBoundary.findOne({ farmId: req.params.farmId });
  res.json({ boundary });
});

router.post("/verification/farmer", auth, roles("FARMER"), async (req, res) => {
  let farm = null;
  if (req.body?.farmId) {
    farm = await Farm.findOne({ _id: req.body.farmId, farmerId: req.user._id });
  }
  if (!farm) farm = await Farm.findOne({ farmerId: req.user._id }).sort({ updatedAt: -1 });
  if (!farm) return res.status(404).json({ error: "Farm not found. Save farm details first." });
  let docs = await Document.find({ farmId: farm._id });
  if (!docs.length) docs = await Document.find({ farmerId: req.user._id });
  const boundary = await FarmBoundary.findOne({ farmId: farm._id, farmerId: req.user._id })
    || await FarmBoundary.findOne({ farmerId: req.user._id }).sort({ updatedAt: -1 });
  const missing = [];
  if (docs.length < 1) missing.push("upload at least one identity or land document");
  if (!boundary || !boundary.points || boundary.points.length < 3) missing.push("save the GPS / 2-guntha boundary");
  if (missing.length) return res.status(400).json({ error: `Cannot send for verification: ${missing.join("; ")}.` });
  if (boundary.status !== "CONFIRMED") {
    boundary.status = "CONFIRMED";
    await boundary.save();
  }
  farm.status = "PENDING_VERIFICATION";
  await farm.save();
  req.user.verificationStatus = "PENDING";
  await req.user.save();
  const vr = await VerificationRequest.findOneAndUpdate(
    { subjectType: "FARMER", subjectId: req.user._id, farmId: farm._id, status: "PENDING" },
    { subjectType: "FARMER", subjectId: req.user._id, farmId: farm._id, status: "PENDING" },
    { upsert: true, new: true }
  );
  res.json({ request: vr, user: publicUser(req.user), message: "Sent to admin. Status is PENDING." });
});

router.post("/verification/company", auth, roles("COMPANY"), async (req, res) => {
  req.user.verificationStatus = "PENDING";
  await req.user.save();
  const vr = await VerificationRequest.findOneAndUpdate(
    { subjectType: "COMPANY", subjectId: req.user._id, status: "PENDING" },
    { subjectType: "COMPANY", subjectId: req.user._id, status: "PENDING" },
    { upsert: true, new: true }
  );
  res.json({ request: vr, user: publicUser(req.user), message: "Sent to admin. Status is PENDING." });
});

router.get("/admin/requests", auth, roles("ADMIN"), async (req, res) => {
  const { type, status } = req.query;
  const q = {};
  if (type) q.subjectType = type;
  if (status) q.status = status;
  const requests = await VerificationRequest.find(q).sort({ createdAt: -1 }).limit(200);
  const ids = requests.map((r) => r.subjectId);
  const users = await User.find({ _id: { $in: ids } });
  const umap = Object.fromEntries(users.map((u) => [String(u._id), u]));
  res.json({
    requests: requests.map((r) => ({ ...r.toObject(), subject: publicUser(umap[String(r.subjectId)]) })),
  });
});

router.get("/admin/overview", auth, roles("ADMIN"), async (_req, res) => {
  const [farmerReq, companyReq, verifiedFarmers, verifiedCompanies] = await Promise.all([
    VerificationRequest.countDocuments({ subjectType: "FARMER" }),
    VerificationRequest.countDocuments({ subjectType: "COMPANY" }),
    User.countDocuments({ role: "FARMER", verificationStatus: "APPROVED" }),
    User.countDocuments({ role: "COMPANY", verificationStatus: "APPROVED" }),
  ]);
  const recent = await VerificationRequest.find().sort({ createdAt: -1 }).limit(8);
  const users = await User.find({ _id: { $in: recent.map((r) => r.subjectId) } });
  const umap = Object.fromEntries(users.map((u) => [String(u._id), u]));
  res.json({
    farmerReq,
    companyReq,
    verifiedFarmers,
    verifiedCompanies,
    recent: recent.map((r) => ({ ...r.toObject(), subject: publicUser(umap[String(r.subjectId)]) })),
  });
});

router.get("/admin/farmer/:id", auth, roles("ADMIN"), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "Farmer not found" });
  const farms = await Farm.find({ farmerId: user._id });
  const farmIds = farms.map((f) => f._id);
  const [documents, boundaries, soils, ai, carbon] = await Promise.all([
    Document.find({ farmerId: user._id }),
    FarmBoundary.find({ farmerId: user._id }),
    SoilReading.find({ farmerId: user._id }),
    AIResult.find({ farmerId: user._id }),
    CarbonAssessment.find({ farmerId: user._id }),
  ]);
  res.json({ user: publicUser(user), farms, documents, boundaries, soils, ai, carbon, farmIds });
});

router.post("/admin/decide", auth, roles("ADMIN"), async (req, res) => {
  const { requestId, status, adminNote } = req.body || {};
  if (!["APPROVED", "REJECTED", "CORRECTION_REQUIRED"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const vr = await VerificationRequest.findById(requestId);
  if (!vr) return res.status(404).json({ error: "Request not found" });
  vr.status = status;
  vr.adminNote = adminNote;
  vr.decidedBy = req.user._id;
  vr.decidedAt = new Date();
  await vr.save();
  const u = await User.findById(vr.subjectId);
  if (!u) return res.status(404).json({ error: "Farmer/company account missing" });
  u.verificationStatus = status === "CORRECTION_REQUIRED" ? "CORRECTION_REQUIRED" : status;
  u.correctionNote = adminNote || "";
  await u.save();
  if (vr.farmId) {
    await Farm.findByIdAndUpdate(vr.farmId, {
      status: status === "APPROVED" ? "APPROVED" : status,
    });
  }
  await Notification.create({
    userId: u._id,
    title: `Verification ${status}`,
    body: adminNote || `Your ${vr.subjectType.toLowerCase()} request was ${status.toLowerCase()}.`,
  });
  res.json({ request: vr, user: publicUser(u) });
});

router.post("/soil-readings", auth, roles("FARMER"), async (req, res) => {
  if (req.user.verificationStatus !== "APPROVED") {
    return res.status(403).json({ error: "Admin must approve your farm before carbon-analysis soil readings." });
  }
  const method = req.body.inputMethod || "MANUAL";
  const reading = await SoilReading.create({
    ...req.body,
    farmerId: req.user._id,
    inputMethod: method,
    dataLabel: req.body.dataLabel || (method === "IOT" ? "ARDUINO + ML SOIL DATA" : "MANUAL SOIL DATA"),
    readingDate: req.body.readingDate || new Date(),
  });
  res.json({ reading });
});

const IOT_KEY = process.env.IOT_API_KEY || "arduino-dev-key";

router.post("/iot/arduino", async (req, res) => {
  const { farmId, farmerId, deviceId, apiKey, ph, moisture, temperature, raw } = req.body || {};
  if (apiKey !== IOT_KEY) return res.status(401).json({ error: "Bad Arduino API key" });
  const live = await ArduinoLive.create({
    farmId: farmId || undefined,
    farmerId: farmerId || undefined,
    deviceId: deviceId || "ARDUINO-01",
    ph: Number(ph),
    moisture: Number(moisture),
    temperature: Number(temperature),
    raw: raw || req.body,
    receivedAt: new Date(),
  });
  res.json({ live, note: "pH (EC20-BNC), moisture and temperature stored from Arduino." });
});

router.get("/iot/latest", auth, async (req, res) => {
  const q = { };
  if (req.query.farmId) q.farmId = req.query.farmId;
  else if (req.user.role !== "ADMIN") q.farmerId = req.user._id;
  let live = await ArduinoLive.findOne(q).sort({ receivedAt: -1 });
  if (!live && req.query.farmId) live = await ArduinoLive.findOne({ deviceId: req.query.deviceId || "ARDUINO-01" }).sort({ receivedAt: -1 });
  if (!live) live = await ArduinoLive.findOne({ deviceId: req.query.deviceId || "ARDUINO-01" }).sort({ receivedAt: -1 });
  res.json({ live });
});

router.post("/iot/simulate", auth, roles("FARMER"), async (req, res) => {
  const farmId = req.body.farmId;
  const ph = Number((6.4 + Math.random() * 1.2).toFixed(2));
  const moisture = Number((18 + Math.random() * 22).toFixed(1));
  const temperature = Number((24 + Math.random() * 8).toFixed(1));
  const live = await ArduinoLive.create({
    farmId,
    farmerId: req.user._id,
    deviceId: "ARDUINO-SIM",
    ph,
    moisture,
    temperature,
    raw: { simulated: true, probe: "EC20-BNC + capacitive moisture + DS18B20/LM35" },
    receivedAt: new Date(),
  });
  res.json({ live, note: "Simulated Arduino packet (use USB serial bridge when the board is plugged in)." });
});

router.post("/soil-readings/from-sensors", auth, roles("FARMER"), async (req, res) => {
  if (req.user.verificationStatus !== "APPROVED") {
    return res.status(403).json({ error: "Admin must approve your farm before soil readings." });
  }
  const farm = req.body.farmId
    ? await Farm.findOne({ _id: req.body.farmId, farmerId: req.user._id })
    : await Farm.findOne({ farmerId: req.user._id }).sort({ updatedAt: -1 });
  if (!farm) return res.status(404).json({ error: "Save farm details first." });
  const live = await ArduinoLive.findOne({ $or: [{ farmId: farm._id }, { farmerId: req.user._id }] }).sort({ receivedAt: -1 });
  if (!live || live.ph == null) {
    return res.status(400).json({ error: "No Arduino reading yet. Connect EC20-BNC pH, moisture and temperature, or press Simulate Arduino." });
  }
  const boundary = await FarmBoundary.findOne({ farmId: farm._id });
  const lat = boundary?.points?.[0]?.lat ?? req.body.latitude;
  const lng = boundary?.points?.[0]?.lng ?? req.body.longitude;
  let filled;
  try {
    const r = await fetch(`${AI_URL}/ai/fill-properties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ph: live.ph,
        moisture: live.moisture,
        temperature: live.temperature,
        latitude: lat,
        longitude: lng,
        state: farm.state,
        district: farm.district,
        soil_type: farm.soilType,
        farming_practice: farm.farmingPractice,
        irrigation: farm.irrigationMethod,
        crop: farm.cropType,
        month: new Date().getMonth() + 1,
        soil_depth: req.body.soilDepth || 15,
      }),
    });
    filled = await r.json();
    if (!r.ok) return res.status(502).json({ error: filled.detail || filled.error || "ML fill service error" });
  } catch (e) {
    return res.status(503).json({ error: "AI service is not running", detail: String(e) });
  }
  const props = filled.properties || filled;
  if (req.body.preview) {
    return res.json({ live, properties: props, place: filled.place, dataset: filled.dataset, modelName: filled.model_name });
  }
  const reading = await SoilReading.create({
    farmId: farm._id,
    farmerId: req.user._id,
    stage: req.body.stage || "BEFORE_FARMING",
    inputMethod: "IOT",
    ph: live.ph,
    moisture: live.moisture,
    temperature: live.temperature,
    ec: props.ec,
    nitrogen: props.nitrogen,
    phosphorus: props.phosphorus,
    potassium: props.potassium,
    soilDepth: req.body.soilDepth || 15,
    measuredSocPercent: props.soc_percent,
    latitude: lat,
    longitude: lng,
    deviceId: live.deviceId,
    sources: {
      arduino: ["ph", "moisture", "temperature"],
      ml: ["ec", "nitrogen", "phosphorus", "potassium", "clay_pct", "sand_pct", "silt_pct", "soc_percent"],
      place: { state: farm.state, district: farm.district, latitude: lat, longitude: lng, soilType: farm.soilType },
      model: filled.model_name,
    },
    dataLabel: "ARDUINO pH/MOISTURE/TEMP + ML PLACE-BASED FILL",
    readingDate: new Date(),
  });
  res.json({ reading, live, filled });
});

router.get("/soil-readings", auth, async (req, res) => {
  const q = req.user.role === "ADMIN" ? {} : { farmerId: req.user._id };
  if (req.query.farmId) q.farmId = req.query.farmId;
  const readings = await SoilReading.find(q).sort({ createdAt: -1 });
  res.json({ readings });
});

router.post("/ai/analyze", auth, roles("FARMER"), async (req, res) => {
  if (req.user.verificationStatus !== "APPROVED") {
    return res.status(403).json({ error: "Only approved farmers can run AI analysis." });
  }
  const farm = await Farm.findOne({ _id: req.body.farmId, farmerId: req.user._id });
  const after = await SoilReading.findOne({ farmId: farm._id, stage: "AFTER_FARMING" }).sort({ createdAt: -1 });
  const before = await SoilReading.findOne({ farmId: farm._id, stage: "BEFORE_FARMING" }).sort({ createdAt: -1 });
  if (!after) return res.status(400).json({ error: "Enter an AFTER_FARMING soil reading first." });
  const boundary = await FarmBoundary.findOne({ farmId: farm._id });
  const lat = boundary?.points?.[0]?.lat;
  const lng = boundary?.points?.[0]?.lng;
  const payload = {
    ph: after.ph,
    ec: after.ec,
    n_g_kg: after.nitrogen != null ? after.nitrogen / 100 : undefined,
    depth_cm: after.soilDepth,
    soil_type: farm.soilType,
    latitude: lat,
    longitude: lng,
    country: "India",
    continent: "Asia",
    bulk_density: req.body.bulkDensity || 1.3,
  };
  let ai;
  try {
    const r = await fetch(`${AI_URL}/ai/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    ai = await r.json();
    if (!r.ok) return res.status(502).json({ error: ai.detail || ai.error || "AI service error" });
  } catch (e) {
    return res.status(503).json({ error: "AI service is not running", detail: String(e) });
  }

  const socAfterPred = ai.predicted_soc_percent;
  const socAfterSource = "PREDICTED";
  let socBefore = before?.measuredSocPercent;
  let socBeforeSource = before?.measuredSocPercent != null ? "MEASURED" : null;
  if (socBefore == null && before) {
    const beforePred = await fetch(`${AI_URL}/ai/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ph: before.ph,
        ec: before.ec,
        depth_cm: before.soilDepth,
        soil_type: farm.soilType,
        latitude: lat,
        longitude: lng,
        country: "India",
        bulk_density: req.body.bulkDensity || 1.3,
      }),
    }).then((x) => x.json());
    socBefore = beforePred.predicted_soc_percent;
    socBeforeSource = "PREDICTED";
  }

  const result = await AIResult.create({
    farmId: farm._id,
    farmerId: req.user._id,
    soilReadingAfterId: after._id,
    predictedSocPercent: socAfterPred,
    modelName: ai.model_name,
    modelVersion: ai.model_version,
    datasetVersion: ai.dataset_version,
    metrics: ai.metrics,
    featureImportance: ai.feature_importance,
    uncertaintyStd: ai.uncertainty_std,
    featuresUsed: ai.features_sent,
    status: "PREDICTED",
  });

  const areaHa = boundary?.areaHectares || (farm.farmAreaAcres ? farm.farmAreaAcres * 0.404686 : 0);
  const carbon = account({
    socBefore,
    socAfter: socAfterPred,
    socBeforeSource,
    socAfterSource,
    bulkDensity: req.body.bulkDensity || 1.3,
    depthCm: after.soilDepth || 20,
    areaHa,
  });
  const assessment = await CarbonAssessment.create({ ...carbon, farmId: farm._id, farmerId: req.user._id });

  const credit = await CarbonCredit.create({
    farmId: farm._id,
    farmerId: req.user._id,
    carbonAssessmentId: assessment._id,
    quantity: carbon.estimatedCredits || 0,
    remaining: carbon.estimatedCredits || 0,
    priceInr: req.body.priceInr || 500,
    crop: farm.cropType,
    location: `${farm.district || ""}, ${farm.state || "Karnataka"}`.replace(/^, /, ""),
    projectName: req.body.projectName || `${farm.cropType || "Farm"} — ${farm.district || "Karnataka"}`,
    verificationStatus: "PENDING_ADMIN",
  });

  res.json({ ai, result, assessment, credit });
});

router.get("/ai/history", auth, async (req, res) => {
  const q = req.user.role === "ADMIN" ? {} : { farmerId: req.user._id };
  const results = await AIResult.find(q).sort({ createdAt: -1 }).limit(100);
  res.json({ results });
});

router.get("/ai/model", auth, async (_req, res) => {
  try {
    const r = await fetch(`${AI_URL}/ai/model`);
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(503).json({ error: "AI service offline", detail: String(e) });
  }
});

router.get("/carbon", auth, async (req, res) => {
  const q = req.user.role === "ADMIN" ? {} : { farmerId: req.user._id };
  const assessments = await CarbonAssessment.find(q).sort({ createdAt: -1 });
  const credits = await CarbonCredit.find(q).sort({ createdAt: -1 });
  res.json({ assessments, credits });
});

router.post("/admin/carbon/verify", auth, roles("ADMIN"), async (req, res) => {
  const { assessmentId, approve } = req.body || {};
  const assessment = await CarbonAssessment.findById(assessmentId);
  if (!assessment) return res.status(404).json({ error: "Assessment not found" });
  assessment.verificationStatus = approve ? "VERIFIED" : "REJECTED";
  await assessment.save();
  const credit = await CarbonCredit.findOne({ carbonAssessmentId: assessment._id });
  if (credit && approve) {
    credit.verificationStatus = "VERIFIED";
    const chain = certifyCredit(credit);
    await BlockchainTransaction.create({
      creditId: credit._id,
      txHash: chain.txHash,
      blockNumber: chain.blockNumber,
      certificateHash: chain.certificateHash,
      payloadHash: chain.payloadHash,
      network: chain.network,
      mode: chain.mode,
    });
    credit.certificateId = chain.certificateHash;
    credit.listed = true;
    await credit.save();
    await MarketplaceListing.create({
      creditId: credit._id,
      farmId: credit.farmId,
      projectName: credit.projectName,
      crop: credit.crop,
      location: credit.location,
      quantity: credit.remaining,
      priceInr: credit.priceInr,
      verificationStatus: "VERIFIED",
      txHash: chain.txHash,
      active: true,
    });
    await Notification.create({
      userId: credit.farmerId,
      title: "Carbon credit certified",
      body: `Blockchain certificate ${chain.txHash.slice(0, 18)}… listed on the marketplace.`,
    });
    return res.json({ assessment, credit, chain });
  }
  if (credit) {
    credit.verificationStatus = "REJECTED";
    await credit.save();
  }
  res.json({ assessment, credit });
});

router.get("/blockchain/:creditId", auth, async (req, res) => {
  const tx = await BlockchainTransaction.findOne({ creditId: req.params.creditId });
  res.json({ tx });
});

router.get("/marketplace", auth, async (req, res) => {
  const q = { active: true };
  if (req.query.crop && req.query.crop !== "All Crops") q.crop = req.query.crop;
  if (req.query.location) q.location = new RegExp(req.query.location, "i");
  const listings = await MarketplaceListing.find(q).sort({ createdAt: -1 });
  res.json({ listings });
});

router.post("/purchases", auth, roles("COMPANY"), async (req, res) => {
  if (req.user.verificationStatus !== "APPROVED") {
    return res.status(403).json({ error: "Company must be admin-approved to purchase credits." });
  }
  const listing = await MarketplaceListing.findById(req.body.listingId);
  if (!listing || !listing.active) return res.status(404).json({ error: "Listing unavailable" });
  const qty = Number(req.body.quantity || listing.quantity);
  if (qty > listing.quantity) return res.status(400).json({ error: "Quantity exceeds listing" });
  listing.quantity -= qty;
  if (listing.quantity <= 0) listing.active = false;
  await listing.save();
  const credit = await CarbonCredit.findById(listing.creditId);
  credit.remaining = Math.max(0, (credit.remaining || 0) - qty);
  await credit.save();
  const purchase = await Purchase.create({
    companyId: req.user._id,
    listingId: listing._id,
    creditId: credit._id,
    quantity: qty,
    priceInr: listing.priceInr,
    totalInr: qty * listing.priceInr,
    transactionId: "CCF" + randomUUID().slice(0, 8).toUpperCase(),
    blockchainTxHash: listing.txHash,
  });
  res.json({ purchase });
});

router.get("/purchases", auth, roles("COMPANY", "ADMIN"), async (req, res) => {
  const q = req.user.role === "ADMIN" ? {} : { companyId: req.user._id };
  const purchases = await Purchase.find(q).sort({ createdAt: -1 });
  res.json({ purchases });
});

async function farmerActivityNotifications(userId, limit = 50) {
  const [notifications, credits] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit),
    CarbonCredit.find({ farmerId: userId }).select("_id"),
  ]);
  const purchases = credits.length
    ? await Purchase.find({ creditId: { $in: credits.map((credit) => credit._id) } })
        .sort({ createdAt: -1 })
        .limit(limit)
    : [];
  const purchaseNotifications = purchases.map((purchase) => ({
    _id: "purchase-" + purchase._id,
    title: "Credit purchase recorded",
    body:
      Number(purchase.quantity).toFixed(3) +
      " of your credits were purchased for ₹" +
      Number(purchase.totalInr).toFixed(2) +
      ". Demo payment record only; no bank transfer was made. Transaction ID: " +
      purchase.transactionId +
      ".",
    createdAt: purchase.createdAt,
  }));
  return [...notifications.map((notification) => notification.toObject()), ...purchaseNotifications]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

router.get("/notifications", auth, async (req, res) => {
  const notifications =
    req.user.role === "FARMER"
      ? await farmerActivityNotifications(req.user._id, 50)
      : await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ notifications });
});

router.get("/farmer/dashboard", auth, roles("FARMER"), async (req, res) => {
  const farms = await Farm.find({ farmerId: req.user._id });
  const farmIds = farms.map((f) => f._id);
  const [docs, boundaries, soils, credits, notifs] = await Promise.all([
    Document.countDocuments({ farmerId: req.user._id }),
    FarmBoundary.find({ farmerId: req.user._id }),
    SoilReading.find({ farmerId: req.user._id }),
    CarbonCredit.find({ farmerId: req.user._id }),
    farmerActivityNotifications(req.user._id, 8),
  ]);
  res.json({
    user: publicUser(req.user),
    farms,
    stats: {
      farms: farms.length,
      documents: docs,
      soilReadings: soils.length,
      credits: credits.reduce((s, c) => s + (c.verificationStatus === "VERIFIED" ? c.quantity : 0), 0),
    },
    boundaries,
    soils,
    credits,
    notifications: notifs,
  });
});

function assistOcr(file) {
  const name = (file.originalname || "").toLowerCase();
  const readable = /\.(jpg|jpeg|png|pdf|webp)$/.test(name);
  const hints = [];
  if (name.includes("aadhaar") || name.includes("aadhar") || name.includes("id")) hints.push("Filename suggests identity document.");
  if (name.includes("land") || name.includes("patta") || name.includes("rtc")) hints.push("Filename suggests land record.");
  return { readable, notes: hints.join(" ") || "File accepted. Admin must visually verify." };
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: String(u._id),
    role: u.role,
    fullName: u.fullName,
    companyName: u.companyName,
    email: u.email,
    mobile: u.mobile,
    state: u.state,
    district: u.district,
    village: u.village,
    pincode: u.pincode,
    location: u.location,
    requiredCredits: u.requiredCredits,
    verificationStatus: u.verificationStatus,
    correctionNote: u.correctionNote,
  };
}
