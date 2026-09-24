import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary path via `__dirname` at module load --
  // Next.js's default server-component bundling inlines/bundles that logic
  // with webpack, which bakes in the BUILD-time __dirname (Vercel's build
  // container path, /ROOT/dashboard/...) rather than the real deployed
  // runtime path (/var/task/dashboard/...) -- confirmed live (2026-09-24):
  // ffmpeg-static's own directory WAS present in the deployed function, but
  // ffmpegPath resolved to a path that only existed at build time. `sharp`
  // (the same "native binary resolved via __dirname" pattern) is already on
  // Next's own default serverExternalPackages list for exactly this reason;
  // ffmpeg-static isn't, so it needs to be added explicitly. This makes
  // Next.js leave it as a real Node `require()` at runtime instead of
  // webpack-bundling it, so __dirname resolves correctly.
  serverExternalPackages: ["ffmpeg-static"],
  // ffmpeg-static's binary (lib/stills.ts) is a native file that Next's
  // build-time file tracer can't reliably follow through its dynamic
  // platform-path resolution -- confirmed live via a temporary diagnostic
  // route (2026-09-24): ffmpegPath resolved correctly but existsSync() was
  // false in the deployed function, meaning still-frame extraction and
  // video creation-time reads have silently failed (caught by their own
  // try/catch, no still ever produced) since this pipeline's first real
  // production run. Root cause investigated via /investigate.
  // "/*" (single star) does NOT cross path segments under picomatch, so it
  // only matches single-segment routes like /cost-book -- confirmed live
  // (2026-09-24) it silently failed to cover /api/ffmpegdiag92384 or any
  // /inspections/[id]/* route, which is exactly where this matters. "/**"
  // matches every route including nested ones.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/ffmpeg-static/**"],
  },
};

export default nextConfig;
