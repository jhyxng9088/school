import path from 'node:path'
import { defineConfig } from 'vite'
import baseConfig from './vite.config.js'
import { patchE2EBoardFixtureSource } from './src/e2e-board-fixture-patch.js'

function e2eBoardFixturePlugin() {
  return {
    name: 'school-e2e-board-fixture',
    transform(code, id) {
      const next = patchE2EBoardFixtureSource(code, id)
      return next === code ? null : { code: next, map: null }
    },
  }
}

export default defineConfig({
  ...baseConfig,
  plugins: [...(baseConfig.plugins || []), e2eBoardFixturePlugin()],
  build: {
    ...(baseConfig.build || {}),
    outDir: 'dist-e2e',
    emptyOutDir: true,
    rollupOptions: {
      ...(baseConfig.build?.rollupOptions || {}),
      input: {
        main: path.resolve('index.html'),
        boardSheetE2E: path.resolve('e2e-board-sheet.html'),
        navigationE2E: path.resolve('e2e-navigation.html'),
      },
    },
  },
})
