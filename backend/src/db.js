import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const jwtSecret = process.env.JWT_SECRET || "ccf-academic-demo-secret";

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    await mongoose.connect(uri);
    console.log("MongoDB Atlas / remote connected");
    return { memory: false };
  }
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  console.log("MongoDB memory server (set MONGODB_URI for Atlas)");
  return { memory: true, mem };
}

export { jwtSecret };
