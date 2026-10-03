import { defineConfig } from "ludicord/config";

export default defineConfig({
  discord: {
    clientId: process.env.LUDICORD_DISCORD_CLIENT_ID,
    scopes: ["identify", "guilds"],
    auth: {
      required: true,
      session: "encrypted-cookie",
      proxyVerification: false,
      activityInstanceVerification: "auto",
    },
  },
  activity: {
    outsideDiscord: process.env.NODE_ENV === "development" && process.env.DISFIGHTERS_BROWSER_TEST === "true" ? "allow" : "error",
  },
  react: {
    strictMode: true,
  },
  build: {
    clientAssetWarningLimit: 512000,
  },
  imports: {
    aliases: {
      "@/components": "./components",
      "@/lib": "./lib",
      "@": ".",
    },
  },
  server: {
    port: 3173,
    host: "127.0.0.1",
    allowedHosts: true,
    allowedOrigins: "discord-activity",
    limits: { body: "2mb" },
    requestTimeout: 30000,
    shutdownTimeout: 10000,
  },
  websocket: {
    enabled: true,
    heartbeatInterval: 30000,
    maxPayload: 262144,
    compression: false,
    maxMessagesPerSecond: 120,
    maxBytesPerSecond: 524288,
    backpressureLimit: 524288,
    backpressureStrategy: "queue-latest",
    maxQueuedMessages: 64,
    reconnect: {
      enabled: true,
      attempts: 10,
      initialDelay: 500,
      maxDelay: 10000,
    },
  },
});
