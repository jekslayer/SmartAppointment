import 'dotenv/config';

const required = [
  'SUPABASE_URL',
  'JWT_SECRET',
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_LIFF_CHANNEL_ID'
];
const missing = required.filter((name) => !process.env[name]?.trim());
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey?.trim()) missing.push('SUPABASE_SECRET_KEY');
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must contain at least 32 characters.');
  process.exit(1);
}
if (process.env.SUPABASE_URL && !/^https:\/\/.+\.supabase\.co$/i.test(process.env.SUPABASE_URL)) {
  console.error('SUPABASE_URL must be a valid HTTPS Supabase project URL.');
  process.exit(1);
}
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Environment configuration is complete. No secret values were printed.');
