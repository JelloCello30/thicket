import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      PGLITE_DIR: "memory://",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      STRIPE_SECRET_KEY: "sk_test_51_fake_key_for_signature_tests_only",
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret_for_tabmind_tests",
      STRIPE_PRICE_PRO_MONTHLY: "price_test_monthly",
      STRIPE_PRICE_PRO_YEARLY: "price_test_yearly",
    },
  },
});
