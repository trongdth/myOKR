import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tauri-apps/plugin-store": path.resolve(__dirname, "src/mocks/store.ts"),
      "@tauri-apps/api/core": path.resolve(__dirname, "src/mocks/tauri-api.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "src/mocks/dialog.ts"),
      "@tauri-apps/plugin-fs": path.resolve(__dirname, "src/mocks/fs.ts"),
      "@tauri-apps/plugin-notification": path.resolve(__dirname, "src/mocks/notification.ts"),
    },
  },
  server: {
    port: 5173,
  },
});
