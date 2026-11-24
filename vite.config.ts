import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { validatePublicEnv } from "./scripts/validate-public-env.mjs";
export default defineConfig(({ mode }) => {
  validatePublicEnv(loadEnv(mode, process.cwd(), "VITE_"));
  return { plugins: [react()], base: "./" };
});
