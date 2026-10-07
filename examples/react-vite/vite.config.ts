import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import llmtsc from "llmtsc/vite";

export default defineConfig({
  plugins: [llmtsc(), react()],
});
