import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import "./src/lib/env";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  typedRoutes: true,
};

export default withNextIntl(nextConfig);
