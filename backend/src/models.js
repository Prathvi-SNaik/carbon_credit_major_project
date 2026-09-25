import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["FARMER", "COMPANY", "ADMIN"], required: true },
    fullName: String,
    companyName: String,
    email: { type: String, required: true, unique: true, lowercase: true },
    mobile: { type: String, required: true, unique: true },
    state: String,
    district: String,
    village: String,
    pincode: String,
    location: String,
    requiredCredits: Number,
    passwordHash: String,
    verificationStatus: {
      type: String,
      enum: ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED", "CORRECTION_REQUIRED"],
      default: "NOT_SUBMITTED",
    },
    correctionNote: String,
  },
  { timestamps: true }
);

const otpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    identifier: String,
    code: String,
    role: String,
    expiresAt: Date,
    used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const farmSchema = new mongoose.Schema(
  {
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cropType: String,
    soilType: String,
    farmAreaAcres: Number,
    farmAreaGuntha: Number,
    farmingPractice: String,
    irrigationMethod: String,
    state: String,
    district: String,
    status: { type: String, default: "DRAFT" },
  },
  { timestamps: true }
);

const boundarySchema = new mongoose.Schema(
  {
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: "Farm" },
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    points: [{ lat: Number, lng: Number, accuracy: Number, recordedAt: Date }],
    areaSqM: Number,
    areaAcres: Number,
    areaHectares: Number,
    areaGuntha: Number,
    gpsAccuracyAvg: Number,
    status: { type: String, default: "DRAFT" },
    mappingTech: {
      type: String,
      default: "GPS + Browser Geolocation API + Leaflet + OSM + Turf.js",
    },
  },
  { timestamps: true }
);

const documentSchema = new mongoose.Schema(
  {
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: "Farm" },
    kind: { type: String, enum: ["IDENTITY", "LAND_OWNERSHIP", "FARM_IMAGE", "OTHER"] },
    originalName: String,
    path: String,
    mimeType: String,
    ocrAssist: {
      readable: Boolean,
      notes: String,
    },
  },
  { timestamps: true }
);

const verificationSchema = new mongoose.Schema(
  {
    subjectType: { type: String, enum: ["FARMER", "COMPANY", "CARBON"] },
    subjectId: mongoose.Schema.Types.ObjectId,
    farmId: mongoose.Schema.Types.ObjectId,
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CORRECTION_REQUIRED"], default: "PENDING" },
    adminNote: String,
    decidedBy: mongoose.Schema.Types.ObjectId,
    decidedAt: Date,
  },
  { timestamps: true }
);

const soilSchema = new mongoose.Schema(
  {
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: "Farm" },
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    stage: { type: String, enum: ["BEFORE_FARMING", "AFTER_FARMING"], required: true },
    inputMethod: { type: String, enum: ["MANUAL", "IOT"], default: "MANUAL" },
    moisture: Number,
    temperature: Number,
    ph: Number,
    ec: Number,
    nitrogen: Number,
    phosphorus: Number,
    potassium: Number,
    soilDepth: Number,
    measuredSocPercent: Number,
    readingDate: Date,
    dataLabel: { type: String, default: "MANUAL SOIL DATA" },
    sources: Object,
    deviceId: String,
    latitude: Number,
    longitude: Number,
  },
  { timestamps: true }
);

const arduinoLiveSchema = new mongoose.Schema(
  {
    farmId: { type: mongoose.Schema.Types.ObjectId, ref: "Farm" },
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deviceId: { type: String, default: "ARDUINO-01" },
    ph: Number,
    moisture: Number,
    temperature: Number,
    raw: Object,
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const aiResultSchema = new mongoose.Schema(
  {
    farmId: mongoose.Schema.Types.ObjectId,
    farmerId: mongoose.Schema.Types.ObjectId,
    soilReadingAfterId: mongoose.Schema.Types.ObjectId,
    predictedSocPercent: Number,
    modelName: String,
    modelVersion: String,
    datasetVersion: String,
    metrics: Object,
    featureImportance: Array,
    uncertaintyStd: Number,
    featuresUsed: Object,
    status: { type: String, default: "PREDICTED" },
  },
  { timestamps: true }
);

const carbonSchema = new mongoose.Schema(
  {
    farmId: mongoose.Schema.Types.ObjectId,
    farmerId: mongoose.Schema.Types.ObjectId,
    socBefore: Number,
    socAfter: Number,
    socChange: Number,
    socBeforeSource: String,
    socAfterSource: String,
    bulkDensity: Number,
    depthCm: Number,
    coarseFragmentFraction: Number,
    carbonStockBefore: Number,
    carbonStockAfter: Number,
    carbonStockChange: Number,
    co2eTonnesPerHa: Number,
    areaHa: Number,
    estimatedCredits: Number,
    eligibilityStatus: String,
    verificationStatus: { type: String, default: "ESTIMATED" },
    methodology: String,
    assumptions: Array,
  },
  { timestamps: true }
);

const creditSchema = new mongoose.Schema(
  {
    farmId: mongoose.Schema.Types.ObjectId,
    farmerId: mongoose.Schema.Types.ObjectId,
    carbonAssessmentId: mongoose.Schema.Types.ObjectId,
    quantity: Number,
    remaining: Number,
    priceInr: Number,
    crop: String,
    location: String,
    projectName: String,
    verificationStatus: { type: String, default: "PENDING_ADMIN" },
    listed: { type: Boolean, default: false },
    certificateId: String,
  },
  { timestamps: true }
);

const chainTxSchema = new mongoose.Schema(
  {
    creditId: mongoose.Schema.Types.ObjectId,
    txHash: String,
    blockNumber: Number,
    certificateHash: String,
    payloadHash: String,
    network: String,
    mode: { type: String, enum: ["GANACHE", "ACADEMIC_LEDGER"] },
  },
  { timestamps: true }
);

const listingSchema = new mongoose.Schema(
  {
    creditId: { type: mongoose.Schema.Types.ObjectId, ref: "CarbonCredit" },
    farmId: mongoose.Schema.Types.ObjectId,
    projectName: String,
    crop: String,
    location: String,
    quantity: Number,
    priceInr: Number,
    verificationStatus: String,
    txHash: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const purchaseSchema = new mongoose.Schema(
  {
    companyId: mongoose.Schema.Types.ObjectId,
    listingId: mongoose.Schema.Types.ObjectId,
    creditId: mongoose.Schema.Types.ObjectId,
    quantity: Number,
    priceInr: Number,
    totalInr: Number,
    transactionId: String,
    blockchainTxHash: String,
  },
  { timestamps: true }
);

const notifSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    title: String,
    body: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
export const Otp = mongoose.model("Otp", otpSchema);
export const Farm = mongoose.model("Farm", farmSchema);
export const FarmBoundary = mongoose.model("FarmBoundary", boundarySchema);
export const Document = mongoose.model("DocumentFile", documentSchema);
export const VerificationRequest = mongoose.model("VerificationRequest", verificationSchema);
export const SoilReading = mongoose.model("SoilReading", soilSchema);
export const ArduinoLive = mongoose.model("ArduinoLive", arduinoLiveSchema);
export const AIResult = mongoose.model("AIResult", aiResultSchema);
export const CarbonAssessment = mongoose.model("CarbonAssessment", carbonSchema);
export const CarbonCredit = mongoose.model("CarbonCredit", creditSchema);
export const BlockchainTransaction = mongoose.model("BlockchainTransaction", chainTxSchema);
export const MarketplaceListing = mongoose.model("MarketplaceListing", listingSchema);
export const Purchase = mongoose.model("Purchase", purchaseSchema);
export const Notification = mongoose.model("Notification", notifSchema);

export const CropMaster = mongoose.model(
  "CropMaster",
  new mongoose.Schema({ name: String, aliases: [String] })
);
export const SoilMaster = mongoose.model(
  "SoilMaster",
  new mongoose.Schema({ name: String, textureHint: String })
);
export const FarmingPractice = mongoose.model(
  "FarmingPractice",
  new mongoose.Schema({ name: String })
);
