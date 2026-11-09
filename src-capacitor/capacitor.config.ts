import { defineCapacitorConfig } from '@quasar/app-vite/capacitor';

export default defineCapacitorConfig({
  appId: 'com.taskmanager.app',
  appName: 'taskmanager',
  plugins: {
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
    SocialLogin: { providers: { google: true, facebook: false, apple: false, twitter: false } }
  }
});
