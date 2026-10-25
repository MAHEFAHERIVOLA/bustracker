import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.yannel.bustracker',
  appName: 'BusTracker',
  webDir: 'www/browser',
  server: { androidScheme: 'http' }
};
export default config;
