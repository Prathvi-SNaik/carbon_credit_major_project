import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const jwtSecret = process.env.JWT_SECRET || "ccf-academic-demo-secret";
const mongoMemoryVersion = process.env.MONGOMS_VERSION || "7.0.14";

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    await mongoose.connect(uri);
    console.log("MongoDB Atlas / remote connected");
    return { memory: false };
  }

  const mem = await MongoMemoryServer.create({
    binary: { version: mongoMemoryVersion },
    instance: { dbName: "carboncreditfarm-demo" }
  });

  await mongoose.connect(mem.getUri());
  console.log(`MongoDB memory server started with MongoDB ${mongoMemoryVersion} (set MONGODB_URI for Atlas)`);
  return { memory: true, mem };
}

export { jwtSecret };
