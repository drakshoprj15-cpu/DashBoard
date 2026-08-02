import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Convenção já usada em todo o projeto: parâmetros exigidos pela
      // assinatura do framework (ex.: `_prev` em useActionState, `_request`
      // em route handlers) mas não usados na implementação levam `_` na
      // frente. O padrão do ESLint só ignora automaticamente quando um
      // parâmetro posterior é usado — aqui cobre também o caso de todos
      // os parâmetros virem prefixados.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
