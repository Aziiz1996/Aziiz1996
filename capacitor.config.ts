import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leader.study',
  appName: 'عز اللوجستيات',
  webDir: 'dist',
  // The native shells use the same secured account/session backend as the PWA.
  server: { url: 'https://aziiz1996.onrender.com', cleartext: false },
};
export default config;
