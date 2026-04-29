import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const isCloudflareBuild = mode === "cloudflare";
  const isItchBuild = mode === "itch";

  return {
    base: isCloudflareBuild ? "/qf-arpg/" : isItchBuild ? "./" : "/",
    build: {
      outDir: isCloudflareBuild ? "dist/qf-arpg" : isItchBuild ? "dist-itch" : "dist",
    },
    server: {
      host: true,
    },
  };
});
