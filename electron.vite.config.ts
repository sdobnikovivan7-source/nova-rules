import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

/**
 * CSP интерфейса (§12): скрипты только свои, картинки — только из локального кеша
 * (`nova-img:`, этап 5.11), сеть renderer'у не нужна — всё идёт через IPC.
 * В dev Vite нужны inline-скрипт react-refresh и websocket HMR.
 */
function csp(): Plugin {
  let dev = false;
  return {
    name: 'nova-csp',
    configResolved: (c) => void (dev = c.command === 'serve'),
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: [
            "default-src 'none'",
            `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: nova-img:",
            "font-src 'self' data:",
            `connect-src 'self'${dev ? ' ws: http://localhost:*' : ''}`,
            "worker-src 'self' blob:",
            "base-uri 'none'",
            "form-action 'none'",
            "object-src 'none'",
          ].join('; '),
        },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rolldownOptions: { input: { index: resolve(import.meta.dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      rolldownOptions: {
        input: { index: resolve(import.meta.dirname, 'src/preload/index.ts') },
        // sandbox: true допускает только CommonJS-preload
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react(), csp()],
    build: {
      // electron-vite по умолчанию не минифицирует renderer
      minify: true,
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/renderer/index.html'),
          quick: resolve(import.meta.dirname, 'src/renderer/quick.html'),
        },
      },
    },
  },
});
