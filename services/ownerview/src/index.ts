// @playerco/ownerview - Wallet-sign auth + hole card ACL service
import { VERSION } from "@playerco/shared";
import { createApp } from "./app.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production-min-32-chars";

if (JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

const { app, authService } = createApp({ jwtSecret: JWT_SECRET });

// Start cleanup intervals
authService.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  authService.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  authService.stop();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`OwnerView service v${VERSION} listening on port ${PORT}`);
});

// Re-export for programmatic use
export { createApp } from "./app.js";
export * from "./auth/index.js";
export * from "./routes/index.js";
