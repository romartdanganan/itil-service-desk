import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't auto-generate AGENTS.md/CLAUDE.md on every dev/build run: this
  // repo is kept free of any sign that AI tooling was involved.
  agentRules: false,
};

export default nextConfig;
