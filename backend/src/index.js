import express from "express";
import cors from "cors";
import { connectDb } from "./db.js";
import { router } from "./routes.js";
import { seed } from "./seed.js";

const PORT = Number(process.env.PORT || 43121);
const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use("/api", router);
app.get("/health", (_req, res) => res.json({ ok: true, service: "carboncreditfarm-backend" }));

await connectDb();
await seed();
app.listen(PORT, "0.0.0.0", () => console.log(`API http://127.0.0.1:${PORT}`));
