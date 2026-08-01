import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // 전부 한 덩어리(1MB+)로 묶이면 첫 화면이 뜰 때까지 그 전부를 받아야 한다.
        // 무거운 라이브러리를 분리해 두면 초기 로드가 빨라지고, 앱 코드만 바뀌었을 때
        // 라이브러리 청크는 브라우저 캐시를 그대로 재사용한다.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react';
          }
          if (id.includes('@fullcalendar')) return 'fullcalendar';
          if (id.includes('@supabase')) return 'supabase';
          return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
