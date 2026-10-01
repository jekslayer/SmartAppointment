import * as crypto from 'crypto';

const DEFAULT_JWT_EXPIRES_IN = 43_200;

interface TokenPayload {
  id: string;
  employee_id?: string;
  username?: string;
  role: string;
  full_name: string;
  must_change_password?: boolean;
  iat?: number;
  exp?: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf-8');
}

function createSignature(header: string, payload: string): string {
  // Read environment values at call time so dotenv/test setup can initialize
  // configuration before tokens are generated, regardless of module order.
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${header}.${payload}`);
  return base64UrlEncode(hmac.digest('base64'));
}

function tokenLifetimeSeconds() {
  const configured = Number(process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN);
  if (!Number.isSafeInteger(configured) || configured < 1 || configured > 31_536_000) {
    throw new Error('JWT_EXPIRES_IN must be an integer between 1 and 31536000 seconds');
  }
  return configured;
}

export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + tokenLifetimeSeconds()
  };
  
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signature = createSignature(header, encodedPayload);
  
  return `${header}.${encodedPayload}.${signature}`;
}

export function verifyToken(token: string): TokenPayload {
  if (typeof token !== 'string' || token.length > 8_192) {
    throw new Error('Invalid token format');
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error('Invalid token format');
  }

  const [header, payload, signature] = parts;
  let decodedHeader: unknown;
  let decoded: TokenPayload;
  try {
    decodedHeader = JSON.parse(base64UrlDecode(header));
    decoded = JSON.parse(base64UrlDecode(payload)) as TokenPayload;
  } catch {
    throw new Error('Invalid token payload');
  }
  if (!decodedHeader || typeof decodedHeader !== 'object'
      || (decodedHeader as { alg?: string }).alg !== 'HS256'
      || (decodedHeader as { typ?: string }).typ !== 'JWT') {
    throw new Error('Invalid token algorithm');
  }
  const expectedSignature = createSignature(header, payload);

  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw new Error('Invalid token signature');
  }

  if (!decoded || typeof decoded.id !== 'string' || !decoded.id
      || !['admin', 'staff'].includes(decoded.role) || typeof decoded.full_name !== 'string'
      || !Number.isSafeInteger(decoded.iat) || !Number.isSafeInteger(decoded.exp)
      || (decoded.iat as number) > Math.floor(Date.now() / 1000) + 60
      || (decoded.exp as number) <= Math.floor(Date.now() / 1000)
      || (decoded.exp as number) <= (decoded.iat as number)) {
    throw new Error('Token expired');
  }

  return decoded;
}
