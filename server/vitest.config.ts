import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes nunca usam o banco de dados real.
    env: { DB_PATH: ':memory:' },
  },
});
