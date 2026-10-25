import type { NextConfig } from "next";

const noFrames = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Thumbnails, avatars and banners travel through Server Actions. Video
      // files never do: they stream to /api/uploads, which has no such cap.
      bodySizeLimit: "12mb",
    },
  },
  async rewrites() {
    // Channels live at /@handle. "@" opens a parallel-route slot when it
    // starts a folder name, so the page itself sits at /c/[handle].
    return [{ source: "/@:handle", destination: "/c/:handle" }];
  },
  async headers() {
    // Everything may not be framed except the embed player, which exists to be.
    return [{ source: "/((?!embed/).*)", headers: noFrames }];
  },
};

export default nextConfig;
