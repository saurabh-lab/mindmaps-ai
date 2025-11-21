import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Support both standard API_KEY and Vite-prefixed VITE_API_KEY
  const apiKey = env.API_KEY || env.VITE_API_KEY || '';
  
  return {
    plugins: [react()],
    define: {
      // Safely polyfill process.env.API_KEY. 
      'process.env.API_KEY': JSON.stringify(apiKey) 
    }
  };
});