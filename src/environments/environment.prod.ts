export const environment = {
  production: true,
  // Set this to the deployed application API URL during release.
  apiUrl: '/api',
  liffId: '2011232013-WuKeRoWW', // LIFF ID is public; keep secrets in backend/.env only.
  
  // App Information
  appName: 'Smart Appointment System',
  version: '1.0.0',
  
  // Features Toggle
  features: {
    lineIntegration: false, // Enable only after backend /api/line/status reports configured.
    emailNotification: false,
    smsNotification: false
  }
};
