import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
