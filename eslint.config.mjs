import tseslint from "typescript-eslint";

/**
 * Correctness-focused lint shared by every workspace. Style is Prettier's
 * job; this catches real mistakes without slowing the loop down.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/drizzle/**",
      "**/release/**",
      "**/*.config.*",
      "**/next-env.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/triple-slash-reference": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
