# ระบบนัดคิวผู้ป่วย | Smart Appointment System

เว็บแอปสำหรับเจ้าหน้าที่โรงพยาบาลใช้จัดการใบนัดผู้ป่วย พร้อมระบบเชื่อมต่อ LINE สำหรับผู้ป่วยและระบบแจ้งเตือนอัตโนมัติ

A hospital appointment management web app for staff and administrators, with LINE LIFF patient features and scheduled appointment reminders.

## ความสามารถ | Features

- **Admin & Staff portals:** แยกสิทธิ์ผู้ดูแลระบบและเจ้าหน้าที่ พร้อมจัดการบัญชีเจ้าหน้าที่และบังคับเปลี่ยนรหัสผ่านเมื่อเข้าใช้ครั้งแรก
- **Appointment management:** ค้นหาผู้ป่วย ออกใบนัด ดูสถานะ ยืนยันการมารับบริการ และเลื่อนนัด
- **Booking safeguards:** ป้องกันใบนัดซ้ำ ผู้ป่วยมีใบนัดค้างหลายใบ และการจองเกินโควตาแพทย์ต่อวัน
- **LINE integration:** ผูกบัญชีผู้ป่วยผ่าน LIFF, check-in และส่งการแจ้งเตือนใบนัดผ่าน LINE
- **Dashboards & reports:** สรุปข้อมูลตามวันที่ แผนก และสถานะ พร้อมดาวน์โหลดรายงาน PDF ฝั่งผู้ดูแล
- **Automated reminders:** ส่งการแจ้งเตือนตามกำหนดผ่าน Vercel Cron

## Tech stack

- **Frontend:** Angular 21, TypeScript, RxJS
- **Backend:** Node.js, Express, TypeScript
- **Database:** Supabase / PostgreSQL
- **Messaging:** LINE Messaging API and LIFF
- **Hosting:** Vercel (frontend, API routes, and scheduled cron)

The browser communicates with the application API. Supabase credentials and LINE secrets belong in the backend environment only.

## Run locally

Requirements: Node.js 22 or newer and npm.

1. ติดตั้ง dependencies ที่ root ของโปรเจกต์:

   ~~~bash
   npm install
   ~~~

2. ติดตั้ง backend dependencies จาก root:

   ~~~bash
   npm --prefix backend install
   ~~~

3. ตั้ง environment variables ใน backend/.env สำหรับเครื่องพัฒนา (ไฟล์นี้เป็นความลับและไม่อยู่ใน Git)

   Required: SUPABASE_URL, SUPABASE_SECRET_KEY (หรือ legacy SUPABASE_SERVICE_ROLE_KEY), JWT_SECRET (อย่างน้อย 32 ตัวอักษร), LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, และ LINE_LIFF_CHANNEL_ID.

   Optional: PORT, FRONTEND_ORIGINS, JWT_EXPIRES_IN. ตั้ง CRON_SECRET เมื่อเปิดใช้ Vercel Cron.

4. เปิด backend ใน Terminal แรก จาก root ของโปรเจกต์:

   ~~~bash
   npm --prefix backend run dev
   ~~~

5. เปิด frontend ใน Terminal ที่สอง จาก root ของโปรเจกต์:

   ~~~bash
   npm start
   ~~~

   Frontend runs at http://localhost:4200 and the development proxy forwards /api requests to the backend at http://localhost:3001.

ตรวจ environment ก่อนเริ่ม backend ได้ด้วย npm --prefix backend run check:env จาก root.

## Build and deploy

~~~bash
npm run vercel-build
~~~

The Vercel build runs the Angular production build and compiles the backend. Configure backend secrets in the Vercel project's Environment Variables; do not commit .env files or secret values. The application expects the Supabase project schema and database functions to be provisioned separately.

## Project layout

~~~text
src/                 Angular application
backend/src/         Express API, authentication, LINE, and reminders
api/                 Vercel API entry point
public/              Static frontend assets
~~~

Database SQL scripts and local database backups are maintained outside this GitHub repository.