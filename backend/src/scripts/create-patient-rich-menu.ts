import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { getClient } from '../db/supabase';

const LINE_API = 'https://api.line.me/v2/bot';
const LINE_DATA_API = 'https://api-data.line.me/v2/bot';
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

async function lineRequest(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response;
}

async function main() {
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');
  const richMenu = {
    size: { width: 2500, height: 1686 }, selected: true,
    name: 'patient-appointment-menu', chatBarText: 'เมนูใบนัด',
    areas: [
      { bounds: { x: 0, y: 0, width: 833, height: 1686 }, action: { type: 'postback', data: 'action=request_reschedule', displayText: 'เลื่อนนัด' } },
      { bounds: { x: 833, y: 0, width: 834, height: 1686 }, action: { type: 'postback', data: 'action=view_appointment', displayText: 'ดูใบนัด' } },
      { bounds: { x: 1667, y: 0, width: 833, height: 1686 }, action: { type: 'postback', data: 'action=department_contacts', displayText: 'ติดต่อแผนก' } }
    ]
  };
  const createResponse = await lineRequest(`${LINE_API}/richmenu`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(richMenu)
  });
  const { richMenuId } = await createResponse.json() as { richMenuId: string };
  const imagePath = path.resolve(__dirname, '../../assets/patient-rich-menu.png');
  const image = await fs.readFile(imagePath);
  await lineRequest(`${LINE_DATA_API}/richmenu/${richMenuId}/content`, {
    method: 'POST', headers: { 'Content-Type': 'image/png' }, body: image
  });

  const { data: links, error } = await getClient().from('patient_line_links').select('line_user_id');
  if (error) throw error;
  for (let offset = 0; offset < (links?.length || 0); offset += 500) {
    const userIds = links!.slice(offset, offset + 500).map(link => link.line_user_id);
    await lineRequest(`${LINE_API}/richmenu/bulk/link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ richMenuId, userIds })
    });
  }
  console.log(`Rich Menu created and linked. Set LINE_PATIENT_RICH_MENU_ID=${richMenuId} in Vercel environment variables, then redeploy.`);
}

main().catch(error => { console.error(error); process.exit(1); });
