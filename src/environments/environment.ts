export const environment = {
  production: false,
  // The browser only communicates with the application API. Supabase
  // credentials must exist only in the backend environment.
  // Angular's development proxy forwards this to the local backend. This also
  // keeps a public frontend tunnel from exposing a browser-to-backend CORS gap.
  apiUrl: '/api',
  liffId: '2011232013-WuKeRoWW', // LIFF ID is public; keep secrets in backend/.env only.
  
  // App Information
  appName: 'Smart Appointment System',
  version: '1.0.0',
  
  // Features Toggle
  features: {
    lineIntegration: false, // The backend reports whether LINE is configured.
    emailNotification: false,
    smsNotification: false
  }
};
