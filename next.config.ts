import type { NextConfig } from "next";
import { withAsh } from "experimental-ash/next";

const nextConfig: NextConfig = {
  // Webpack can't resolve `.js` imports to `.ts` files by default.
  // Ash's agent code uses NodeNext resolution (requires `.js` extensions),
  // but app routes import agent files through webpack. This alias tells
  // webpack to look for `.ts`/`.tsx` when it sees a `.js` import.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default withAsh(nextConfig);
