import {
  User,
  CropMaster,
  SoilMaster,
  FarmingPractice,
} from "./models.js";
import { DEMO_PASSWORDS, hashPassword } from "./passwords.js";

export async function seed() {
  if ((await User.countDocuments()) === 0) {
    await User.create([
      {
        role: "ADMIN",
        fullName: "Administrator",
        email: "admin@carboncreditfarm.in",
        mobile: "9999900000",
        passwordHash: await hashPassword(DEMO_PASSWORDS.ADMIN),
        verificationStatus: "APPROVED",
      },
      {
        role: "FARMER",
        fullName: "Ramesh Kumar",
        email: "ramesh@example.com",
        mobile: "9876543210",
        state: "Karnataka",
        district: "Mysuru",
        passwordHash: await hashPassword(DEMO_PASSWORDS.FARMER),
        verificationStatus: "NOT_SUBMITTED",
      },
      {
        role: "COMPANY",
        fullName: "GreenTech Pvt. Ltd.",
        companyName: "GreenTech Pvt. Ltd.",
        email: "buy@greentech.example",
        mobile: "9888800001",
        location: "Bengaluru, Karnataka",
        requiredCredits: 500,
        passwordHash: await hashPassword(DEMO_PASSWORDS.COMPANY),
        verificationStatus: "NOT_SUBMITTED",
      },
    ]);
    console.log("Seeded demo users (password login — no OTP)");
  } else {
    const pairs = [
      ["admin@carboncreditfarm.in", DEMO_PASSWORDS.ADMIN],
      ["ramesh@example.com", DEMO_PASSWORDS.FARMER],
      ["buy@greentech.example", DEMO_PASSWORDS.COMPANY],
    ];
    for (const [email, pw] of pairs) {
      const u = await User.findOne({ email });
      if (u && !u.passwordHash) {
        u.passwordHash = await hashPassword(pw);
        await u.save();
      }
    }
  }
  if ((await CropMaster.countDocuments()) === 0) {
    await CropMaster.create(
      ["Paddy (Rice)", "Ragi", "Maize", "Wheat", "Sugarcane", "Cotton", "Groundnut", "Millet", "Pulses", "Coffee", "Arecanut"].map((name) => ({ name }))
    );
    await SoilMaster.create([
      { name: "Alluvial", textureHint: "loam" },
      { name: "Black (Regur)", textureHint: "clay" },
      { name: "Red", textureHint: "sandy_clay_loam" },
      { name: "Laterite", textureHint: "clay_loam" },
      { name: "Sandy", textureHint: "sand" },
      { name: "Clayey", textureHint: "clay" },
      { name: "Forest", textureHint: "silt_loam" },
      { name: "Coastal", textureHint: "sandy_loam" },
    ]);
    await FarmingPractice.create(["Organic", "Conventional", "Conservation tillage", "Agroforestry", "Integrated"].map((name) => ({ name })));
  }
}
