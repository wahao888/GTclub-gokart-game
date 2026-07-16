import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/formula-kart/",
  plugins: [react()],
  server: { port: Number(process.env.VITE_PORT ?? 5188), strictPort: true },
  preview: { port: 4173 },
  build: { target: "es2022" }
});
