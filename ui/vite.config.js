// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 🌟 關鍵設置：允許外部存取 🌟
    // port: 5173 // 預設 port，可選
    // 允許特定外部主機（例如透過 ngrok 暴露的 hostname）存取 dev server
    // 若你有多個 host，可改成陣列：['host1', 'host2']
    allowedHosts: [
      'doria-unmottled-ian.ngrok-free.dev'
    ]
  }
});