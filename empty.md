# สรุปการปรับระบบให้ตรงขอบเขตโครงงาน



> เอกสารนี้บันทึกการปรับโค้ด ณ วันที่ 23 สิงหาคม 2026 เพื่อให้ระบบใบนัดอัจฉริยะทำหน้าที่เป็นระบบเสริมสำหรับการจัดการใบนัดและ LINE Official Account เท่านั้น

## หลักการใช้งานที่ยึดเป็นขอบเขต

ระบบไม่ได้เชื่อมต่อหรือแก้ไขข้อมูลจริงของโรงพยาบาล ระบบใช้ฐานข้อมูลของโครงงานเองเพื่อเก็บข้อมูลจำลองสำหรับการสาธิตและทดสอบการทำงานของปลั๊กอินใบนัด ข้อมูลผู้ป่วย แพทย์ และแผนกใช้เป็นข้อมูลประกอบการค้นหาและออกใบนัด ไม่ใช่ระบบจัดการข้อมูลหลักของโรงพยาบาล

ขอบเขตที่คงไว้มีดังนี้

- เจ้าหน้าที่ค้นหาผู้ป่วยจากชื่อ, HN หรือเลขบัตรประชาชน แล้วออกใบนัดได้
- เจ้าหน้าที่ดูรายการนัดและบันทึกสถานะ `completed` หรือ `no_show` ได้
- ผู้ป่วยรับใบนัดและการแจ้งเตือนผ่าน LINE OA รวมถึงยืนยันนัดหรือขอเลื่อนนัดผ่าน postback
- ผู้ดูแลระบบดูสถิติใบนัด, สถานะใบนัด, แผนกที่มีนัด, ตั้งค่าจำนวนรับนัดต่อวันของแพทย์ และแก้ไขข้อความ LINE ได้

## สิ่งที่ปรับในหน้าบ้าน

### เส้นทางการใช้งาน

แก้ `src/app/app.routes.ts` ให้เหลือหน้าที่อยู่ในขอบเขต

- `/dashboard` สำหรับเจ้าหน้าที่
- `/staff/new-appointment` สำหรับออกใบนัด
- `/admin-dashboard` สำหรับภาพรวมของผู้ดูแลระบบ
- `/admin/capacity` สำหรับตั้งค่าจำนวนผู้ป่วยที่แพทย์รับได้ต่อวัน
- `/admin/notifications` สำหรับตั้งค่าข้อความ LINE

นำเส้นทางจัดการข้อมูลหลักของโรงพยาบาลออกแล้ว ได้แก่ `/admin/staff`, `/admin/staff/new`, `/admin/patients` และ `/admin/departments`

### แดชบอร์ดผู้ดูแลระบบ

ปรับ `src/app/pages/admin-dashboard/` ให้แสดงเฉพาะข้อมูลการนัดหมายที่สอดคล้องกับขอบเขต

- จำนวนใบนัดในวันที่เลือก
- จำนวนแผนกที่มีนัด
- กราฟจำนวนใบนัดย้อนหลัง 7 วัน
- สถานะใบนัดของวันที่เลือก
- รายการแผนกที่มีนัด

นำการแสดงและเมนูจัดการจำนวนผู้ป่วยทั้งหมดและจำนวนเจ้าหน้าที่ออกแล้ว

### หน้าตั้งค่าจำนวนรับนัด

ปรับ `src/app/pages/admin-departments/` จากหน้าจัดการแผนกและแพทย์ เป็นหน้าตั้งค่าจำนวนรับนัดต่อวันเท่านั้น

- อ่านรายชื่อแพทย์และแผนกเพื่อแสดงประกอบ
- แก้ไขได้เฉพาะ `max_patients_per_day`
- ไม่สามารถเพิ่ม, ลบ หรือแก้ไขชื่อแพทย์/แผนกได้

### หน้าตั้งค่าการแจ้งเตือน

ปรับเมนูใน `src/app/pages/admin-notifications/` ให้เหลือ ภาพรวม, ตั้งค่าจำนวนรับนัด และการแจ้งเตือน

ยังรองรับการตั้งค่าข้อความใบนัด, ข้อความเตือนนัด และจำนวนวันแจ้งเตือนล่วงหน้า

### ฟังก์ชันนอกขอบเขตที่นำออก

ลบหน้า source ของการจัดการข้อมูลหลักออกแล้ว

- `src/app/pages/admin-patients/`
- `src/app/pages/admin-staff/`
- `src/app/pages/admin-staff-new/`

ปุ่มแก้ไขประวัติผู้ป่วยในหน้าออกใบนัดถูกปิด และ API ไม่อนุญาตให้แก้ไขข้อมูลผู้ป่วยจากหน้านี้

## สิ่งที่ปรับใน Backend

### จำกัดสิทธิ์การเขียนข้อมูล

แก้ `backend/src/routes/data.routes.ts` ให้ API อนุญาตการเขียนข้อมูลเฉพาะกรณีต่อไปนี้

- เจ้าหน้าที่สร้างใบนัดใหม่ในตาราง `appointments`
- เจ้าหน้าที่เปลี่ยนสถานะใบนัดเป็น `completed` หรือ `no_show`
- ผู้ดูแลระบบแก้เฉพาะ `max_patients_per_day` ของแพทย์ โดยค่าต้องเป็นจำนวนเต็มมากกว่า 0
- ผู้ดูแลระบบจัดการเทมเพลตข้อความในตาราง `line_messages`

จึงไม่สามารถใช้ API นี้เพื่อเพิ่ม, แก้ไข หรือลบผู้ป่วย, แผนก, แพทย์ หรือบัญชีเจ้าหน้าที่ได้

### นำ API เก่าที่เกินขอบเขตออก

ลบ route source และยกเลิกการ mount ใน `backend/src/index.ts` สำหรับ API ต่อไปนี้

- `appointments.routes.ts`
- `departments.routes.ts`
- `doctors.routes.ts`
- `notifications.routes.ts`
- `patients.routes.ts`
- `users.routes.ts`

หลัง build แล้ว `backend/dist/routes/` เหลือเฉพาะ route ที่ใช้จริงคือ `auth`, `dashboard`, `data` และ `line`

### LINE Official Account

คง `backend/src/routes/line.routes.ts` ไว้สำหรับความสามารถที่อยู่ในขอบเขต

- รับ LINE webhook และตรวจสอบลายเซ็น
- บันทึกการตอบกลับจากผู้ป่วย
- ยืนยันนัดหรือขอเลื่อนนัดผ่าน LINE postback
- ผูก LINE user ID กับข้อมูลผู้ป่วยจำลองเมื่อผ่านขั้นตอนที่ระบบกำหนด
- ส่งข้อความใบนัดและข้อความแจ้งเตือนเมื่อกำหนดค่า LINE API แล้ว

## การตรวจสอบหลังแก้ไข

ตรวจสอบแล้ว

- `npm.cmd run build` ฝั่ง Angular ผ่าน
- `npx.cmd tsc --noEmit` ในโฟลเดอร์ `backend` ผ่าน
- build backend ด้วย `npm.cmd --prefix backend run build` ผ่านหลังหยุด backend
- แก้ข้อผิดพลาด Angular `TS7006` ในหน้า `admin-departments.component.ts` โดยกำหนด type `DoctorCapacity` ให้ callback parameter แล้ว

## เงื่อนไขก่อนนำไปใช้งานจริง

ระบบสามารถนำไป deploy เพื่อใช้งานตามขอบเขตโครงงานได้ เมื่อปฏิบัติตามเงื่อนไขต่อไปนี้

1. ใช้ Supabase project หรือฐานข้อมูลที่แยกสำหรับโครงงานเท่านั้น ห้ามตั้งค่า `SUPABASE_URL` หรือ key ให้ชี้ไปยังฐานข้อมูลจริงของโรงพยาบาล
2. ใช้ข้อมูลผู้ป่วย, แพทย์ และแผนกที่จำลองหรือไม่สามารถระบุตัวบุคคลได้ ห้ามนำข้อมูลสุขภาพจริงมาใส่ในระบบโดยไม่มีการอนุมัติและมาตรการคุ้มครองข้อมูล
3. เก็บ `SUPABASE_SECRET_KEY`, `JWT_SECRET`, `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN` ไว้เฉพาะใน `backend/.env` และไม่ commit ไฟล์นี้ขึ้น repository
4. ตั้งค่า `FRONTEND_ORIGINS` ให้เป็นโดเมนเว็บที่อนุญาตจริงก่อน deploy
5. ตั้งค่า LINE webhook ให้ชี้มาที่ `POST /api/line/webhook` ผ่าน HTTPS และทดสอบกับบัญชี/ข้อมูลจำลองก่อนเปิดใช้
6. ทดสอบขั้นตอนค้นหาผู้ป่วย, ออกใบนัด, การแจ้งเตือน, ยืนยันนัด, ขอเลื่อนนัด และการตั้งค่าจำนวนรับนัดทุกครั้งหลัง deploy

## ข้อสังเกต

โครงงานนี้ทำหน้าที่เป็นต้นแบบระบบเสริม ไม่ใช่ Hospital Information System (HIS) และไม่ได้มี API เชื่อมต่อ HIS จริง การเชื่อมต่อข้อมูลจริงในอนาคตต้องออกแบบสิทธิ์, การยินยอม, การเข้ารหัส, audit log และข้อตกลงกับโรงพยาบาลแยกต่างหากก่อนดำเนินการ

## บันทึกการปรับปรุงเพิ่มเติม — หน้าผู้ดูแลระบบ (23 สิงหาคม 2026)

ส่วนนี้เป็นข้อมูลเพิ่มเติมจากบันทึกข้างต้น และใช้แทนรายละเอียดเดิมเฉพาะเรื่องการจัดการผู้ใช้งานระบบ

### หน้าตั้งค่าจำนวนรับนัด

- ปรับหน้าตั้งค่าจำนวนรับนัดให้เป็นรายการแพทย์ที่อ่านง่าย โดยแสดงชื่อ แผนก จำนวนรับนัดต่อวัน และปุ่มบันทึกในแต่ละรายการ
- รายการที่มีการแก้ไขจะแสดงสถานะ `มีการแก้ไข` และเปิดปุ่มบันทึกเฉพาะรายการนั้น
- รองรับการแสดงผลบนมือถือ และยังคงตรวจสอบว่าจำนวนรับนัดต้องเป็นจำนวนเต็มตั้งแต่ 1 คนต่อวัน

### หน้าผู้ใช้งานระบบ

- เพิ่มเส้นทาง `/admin/users` สำหรับผู้ดูแลระบบ
- แสดงและจัดการเฉพาะบัญชีเจ้าหน้าที่ (`staff`) ที่สร้างในระบบ ไม่แสดงบัญชีผู้ดูแลระบบ (`admin`)
- เพิ่มบัญชีเจ้าหน้าที่ได้ด้วยรหัสพนักงานและชื่อ-นามสกุล
- ระบบกำหนดรหัสผ่านเริ่มต้นเป็น `123456` โดยอัตโนมัติ และบังคับให้ผู้ใช้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก
- ผู้ดูแลระบบรีเซ็ตรหัสผ่านเจ้าหน้าที่ได้
- การลดจำนวนผู้ใช้ใช้วิธีปิดใช้งานบัญชี (`is_active = false`) แทนการลบถาวร เพื่อไม่กระทบประวัติการใช้งาน และสามารถเปิดใช้งานกลับได้

### ความปลอดภัยของ API ผู้ใช้

- เพิ่ม API `/api/users` และบังคับให้เรียกใช้ได้เฉพาะผู้ที่มีสิทธิ์ `admin`
- API รายชื่อ, รีเซ็ตรหัสผ่าน และเปลี่ยนสถานะบัญชี กรองให้ทำงานกับ `staff` เท่านั้น จึงไม่สามารถจัดการบัญชีแอดมินผ่านหน้าเว็บหรือเรียก API โดยตรงได้
- API ไม่ส่งข้อมูลรหัสผ่านกลับไปยังหน้าเว็บ

### การจัดหน้าผู้ดูแลระบบ

- จัดลำดับเมนูให้เหมือนกันทุกหน้า: ภาพรวม → ผู้ใช้งานระบบ → ตั้งค่าจำนวนรับนัด → การแจ้งเตือน
- ปรับขนาดแท็บ การ์ด หัวข้อ ปุ่ม และระยะห่างของหน้าผู้ใช้งานระบบให้เท่ากับหน้าตั้งค่าจำนวนรับนัด
- ปรับหน้าการแจ้งเตือนให้ใช้สเกลเดียวกับหน้าแอดมินอื่น ทั้งแท็บ การ์ด หัวข้อ ช่องข้อความ และปุ่ม

### การตรวจสอบ

- ตรวจ Angular build ด้วย `npm.cmd run build`
- ตรวจ TypeScript ฝั่ง backend ด้วย `npx.cmd tsc --noEmit` ในโฟลเดอร์ `backend`
- ก่อนใช้งานฟังก์ชันผู้ใช้บนระบบจริง ต้อง deploy/restart backend เพื่อให้ route `/api/users` เวอร์ชันใหม่ทำงาน

## บันทึกการปรับปรุงเพิ่มเติม — หน้าสำหรับเจ้าหน้าที่ (23 สิงหาคม 2026)

ส่วนนี้เพิ่มต่อจากบันทึกเดิม โดยไม่ลบหรือแก้ไขข้อมูลข้างต้น

### รีเซ็ตรหัสผ่านของผู้ใช้งาน

- ช่องกำหนดรหัสผ่านใหม่ในหน้าผู้ใช้งานระบบของผู้ดูแล แสดงอักขระรหัสผ่านขณะพิมพ์ เพื่อให้ผู้ดูแลตรวจสอบค่าที่กรอกได้

### เข้าสู่ระบบครั้งแรกและเปลี่ยนรหัสผ่าน

- หน้าแดชบอร์ดของเจ้าหน้าที่ถูกโหลดพร้อมแอปแทนการโหลดแบบ lazy-load ในเส้นทาง `/dashboard`
- ลดโอกาสเกิดข้อผิดพลาด `Failed to fetch dynamically imported module` หลังเจ้าหน้าที่เปลี่ยนรหัสผ่านครั้งแรกและระบบนำทางเข้าแดชบอร์ด
- API `POST /api/auth/change-password` ยังคงเปลี่ยนรหัสผ่านตาม token ของผู้ที่เข้าสู่ระบบ และล้างสถานะ `must_change_password` ตามเดิม

### ออกใบนัด: แผนก แพทย์ และจำนวนคิว

- หน้าสร้างใบนัดโหลดรายชื่อแผนกและแพทย์ที่เปิดใช้งานจากตาราง `departments` และ `doctors` แทนรายชื่อที่เขียนตายตัวในหน้าเว็บ
- เมื่อเลือกแผนก ระบบแสดงเฉพาะแพทย์ในแผนกนั้น
- เมื่อเลือกแพทย์และวันนัด ระบบนับใบนัดของแพทย์คนนั้นในวันดังกล่าว โดยไม่นับรายการที่มีสถานะ `cancelled`
- แสดงจำนวนคิวในรูปแบบ `จำนวนที่จอง / จำนวนสูงสุด` และข้อความจำนวนผู้ป่วยที่รับได้อีก เช่น `1 / 10` และ `รับผู้ป่วยได้อีก 9 คน`
- ระบบไม่อนุญาตให้ดำเนินการต่อหากแพทย์ที่เลือกมีจำนวนคิวครบตาม `max_patients_per_day`
- แผนก `โรคทั่วไป` ถูกจัดไว้เป็นตัวเลือกแรกเสมอ และใช้ช่องกรอกชื่อแพทย์ เพราะเป็นแผนกแพทย์หมุนเวียน จึงไม่ต้องเลือกแพทย์จากรายชื่อหรือแสดงจำนวนคิว

### ค้นหาผู้ป่วยก่อนออกใบนัด

- จำกัดการค้นหาผู้ป่วยไว้ที่ชื่อ-นามสกุล, HN และเลขบัตรประชาชน
- ปรับข้อความแนะนำบนหน้าจอให้ตรงกับเงื่อนไขการค้นหาจริง และไม่ระบุเบอร์โทรศัพท์เป็นเงื่อนไขค้นหา

### ข้อมูลแพทย์ในฐานข้อมูล

- จัดเตรียมคำสั่ง SQL สำหรับเพิ่มแพทย์ที่ขาดในแผนก `ศัลยกรรม` และ `สูติ-นรีเวช` โดยตั้งจำนวนรับนัดเริ่มต้น 10 คนต่อวัน และตรวจไม่ให้เพิ่มซ้ำ
- คำสั่ง SQL ดังกล่าวเป็นคำสั่งที่จัดเตรียมให้รันใน Supabase SQL Editor เท่านั้น ยังไม่ถือว่าถูกดำเนินการจนกว่าจะมีการรันบนฐานข้อมูลเป้าหมาย

### การตรวจสอบหลังปรับปรุง

- ตรวจ Angular build ด้วย `cmd /c npm run build` หลังการปรับหน้าสร้างใบนัดและการจัดการการโหลดแดชบอร์ด โดยคำสั่งทำงานสำเร็จ

## สถานะการเชื่อม LINE Messaging API และฐานข้อมูลจริง — 23 สิงหาคม 2026

ส่วนนี้บันทึกผลการดำเนินงานและการทดสอบต่อจากข้อมูลเดิม โดยไม่ลบหรือแก้ไขเนื้อหาก่อนหน้า

### สิ่งที่ทำสำเร็จ

#### 1. การส่งใบนัดจากหน้าเว็บไปยัง LINE

- เพิ่ม flow `สร้างใบนัดและแจ้ง LINE` จากหน้าสร้างใบนัดของเจ้าหน้าที่
- หน้าเว็บเรียก endpoint `POST /api/data/appointments/create-and-notify` แทนการบันทึกใบนัดเพียงอย่างเดียว
- Backend ตรวจสิทธิ์ผู้ใช้ระดับ `staff` หรือ `admin` ก่อนดำเนินการ
- Backend บันทึกใบนัดก่อนเสมอ แล้วจึงพยายามส่ง LINE Push Message
- หาก LINE ส่งไม่สำเร็จ ใบนัดจะยังคงถูกบันทึกไว้ และหน้าเว็บจะแจ้งสถานะที่เหมาะสมแก่เจ้าหน้าที่
- รองรับกรณีผู้ป่วยยังไม่ผูก LINE, LINE ยังไม่ได้ตั้งค่า และการส่ง LINE ล้มเหลว
- ข้อความใบนัดถูกอ่านจาก template `appointment_created` ในตาราง `line_messages` ที่ผู้ดูแลแก้ไขได้จากหน้า Notification
- เมื่อส่งสำเร็จ ระบบบันทึกผลลง `line_message_deliveries` และกำหนด `appointments.line_sent_at`

ไฟล์โค้ดที่เกี่ยวข้อง:

- `backend/src/routes/data.routes.ts`
- `backend/src/routes/line.routes.ts`
- `src/app/core/services/supabase.service.ts`
- `src/app/pages/new-appointment/new-appointment.component.ts`

#### 2. การทดสอบ LINE แบบใช้งานจริงบนเครื่องพัฒนา

- รัน backend ด้วย `npm run dev` ที่ `http://localhost:3001`
- รัน Angular frontend ที่ `http://localhost:4200`
- ใช้ ngrok tunnel ชั่วคราวเพื่อเปิด webhook URL แบบ HTTPS ไปยัง backend ในเครื่อง
- ตั้งค่า LINE webhook เป็น `/api/line/webhook` และ LINE Developers Console ตรวจสอบ URL ผ่าน (`Verify: Success`)
- เพิ่ม LINE Official Account เป็นเพื่อนและได้รับข้อความต้อนรับจาก backend จริง แสดงว่า webhook, signature validation และ reply message ทำงาน
- ผูก `line_user_id` ของบัญชีทดสอบกับผู้ป่วยจำลองหนึ่งราย แล้วทดสอบออกใบนัดจากหน้าเว็บ
- ผลการทดสอบ: ใบนัดถูกส่งถึง LINE ของบัญชีทดสอบจริงสำเร็จ

#### 3. ฐานข้อมูล Supabase จริง

- ตรวจผ่าน Supabase Dashboard และ SQL Editor แบบอ่านอย่างเดียว ไม่มีการแก้ไขข้อมูลหรือ schema ระหว่างการตรวจ
- ตารางจริงที่เกี่ยวข้องกับระบบ LINE มีครบ: `line_messages`, `line_webhook_events`, `line_message_deliveries`
- ตารางหลักมี `patients.line_user_id` และ `appointments.line_sent_at` ตรงกับ flow การส่งใบนัดปัจจุบัน
- สถานะจากฐานข้อมูลหลังทดสอบ:
  - webhook events: 1
  - ส่ง LINE สำเร็จ: 1
  - ส่ง LINE ล้มเหลว: 0
  - ใบนัดที่มี `line_sent_at`: 1
- โครงสร้างฐานข้อมูลจริงมี 10 ตาราง: `appointment_reminders`, `appointments`, `departments`, `doctors`, `line_message_deliveries`, `line_messages`, `line_webhook_events`, `patients`, `system_logs`, `users`

### สิ่งที่ยังไม่ได้ทำ

#### 1. ระบบแจ้งเตือนก่อนถึงวันนัด

- หน้าแอดมินตั้งข้อความแจ้งเตือนและจำนวนวันล่วงหน้าได้แล้ว
- ยังไม่มี scheduler/cron job ใน backend ที่ค้นหาใบนัดตามกำหนด, ส่งข้อความเตือน และป้องกันการส่งซ้ำ

#### 2. การผูก LINE ของผู้ป่วยแบบอัตโนมัติ

- ปัจจุบันการทดสอบใช้การนำ `line_user_id` ไปผูกกับข้อมูลผู้ป่วยจำลองด้วยตนเอง
- สำหรับโปรเจกต์จบ แนวทางที่แนะนำคือ QR กลาง + LIFF:
  1. ผู้ป่วยสแกน QR กลาง
  2. LIFF รับรองบัญชี LINE ของผู้ป่วย
  3. ผู้ป่วยกรอก HN และวันเดือนปีเกิดเพื่อตรวจข้อมูลจำลอง
  4. ระบบบันทึกความสัมพันธ์ `HN ↔ line_user_id` อัตโนมัติ
- ยังไม่ได้สร้าง LINE Login Channel, LIFF App, หน้า LIFF, ตารางเชื่อม HN กับ LINE หรือ QR flow
- สำหรับใช้งานจริง ควรแยกตารางเชื่อม เช่น `patient_line_links` ออกจากฐานข้อมูลโรงพยาบาล และตรวจข้อมูล รพ. แบบ read-only

#### 3. การนำไปใช้งานจริง

- ngrok ใช้เฉพาะการทดสอบ ไม่เหมาะกับการใช้งานจริง เพราะ URL เปลี่ยนได้และ backend ต้องเปิดเครื่องตลอด
- ต้อง deploy backend ไปยัง HTTPS public domain แบบถาวรก่อนใช้งานจริง เพื่อรับ LINE webhook และทำ scheduler ได้ต่อเนื่อง
- ระบบจริงควรเพิ่ม OTP หรือการยืนยันตัวตนที่รัดกุมกว่า HN + วันเกิด ก่อนผูก LINE กับผู้ป่วย

### ประเด็นที่ควรแก้ไขในอนาคต

- Supabase Advisor แจ้งว่า `patients`, `departments`, `doctors`, `line_messages`, `system_logs` และ `users` ยังปิด RLS อยู่; บางตารางมี policy แต่ policy จะไม่มีผลจนกว่าจะเปิด RLS
- ตาราง LINE log เปิด RLS แล้วแต่ไม่มี policy ซึ่งเหมาะกับการเขียนผ่าน backend ที่ใช้ secret key เท่านั้น
- ตาราง `users` มีทั้ง `must_change_password` และ field เก่า `require_password_change`; โค้ดรองรับอยู่ แต่ควรวางแผนรวม field ในภายหลัง
- Dashboard แสดงว่าไม่มี migration history และไม่มี scheduled backup จึงควรวางแผน migration และ backup ก่อนนำไปใช้งานจริง
- Production Angular build ยังล้มเหลวจาก CSS budget เดิมของโปรเจกต์ โดยเฉพาะ `admin-departments.component.css`; development build และ TypeScript type-check ผ่าน

### สถานะปัจจุบัน

- Flow หลัก `เจ้าหน้าที่ออกใบนัด -> backend บันทึก -> LINE ส่งข้อความถึงผู้ป่วย` ผ่านการทดสอบจริงแล้ว
- ระบบอยู่ในสถานะ prototype/โครงงานทดสอบ เหมาะสำหรับพัฒนาต่อเป็น QR กลาง + LIFF เพื่อกำจัดขั้นตอน copy `line_user_id`

## บันทึกการทดสอบ QR กลาง + LIFF — 24 สิงหาคม 2026

ส่วนนี้บันทึกการตั้งค่าและผลทดสอบจริงต่อจากข้อมูลเดิม โดยไม่แก้ไขหรือลบข้อมูลข้างต้น

### สิ่งที่ตั้งค่าใน LINE Developers Console

- สร้าง LINE Login Channel ชื่อ `Smart Appointment` ภายใต้ Provider `Smart Appointment System` เดียวกับ Messaging API Channel เดิม เพื่อให้ LINE user ID ใช้ร่วมกันได้
- สร้าง LIFF App สำหรับหน้าผูกบัญชี โดยใช้ LIFF ID `2011232013-WuKeRoWW`
- ตั้ง LIFF Endpoint URL ชั่วคราวเป็น `https://gag-viewer-flier.ngrok-free.dev/line-link`
- เปิด scope `openid` เพื่อให้หน้า LIFF เรียก `liff.getIDToken()` ได้ และเปิด Add friend option แบบ On (Normal)
- ตั้ง LINE webhook ของ Messaging API Channel เป็น `https://gag-viewer-flier.ngrok-free.dev/api/line/webhook` และตรวจสอบผ่าน
- LINE Login Channel อยู่สถานะ `Developing` จึงเปิด LIFF ได้เฉพาะ LINE account ที่เป็น `Admin` หรือ `Tester` ของ Channel นี้ ผู้ทดสอบเพิ่มเติมต้องรับคำเชิญ Role `Tester` ผ่าน LINE Developers Console ก่อน

### สิ่งที่ปรับในโค้ดเพื่อรองรับการทดสอบ

- เพิ่ม LIFF ID ใน `src/environments/environment.ts` และ `src/environments/environment.prod.ts`
- เพิ่ม `proxy.conf.json` ให้ Angular development server ส่ง `/api` ไปยัง backend ที่ `http://localhost:3001`
- ปรับ script `npm start` ให้ใช้ proxy ดังกล่าว จึงใช้ ngrok frontend เพียง URL เดียวสำหรับทั้งหน้า LIFF และ API ระหว่างทดสอบได้
- เพิ่ม host `gag-viewer-flier.ngrok-free.dev` ใน `angular.json` เพื่อให้ Angular development server ตอบ request ที่มาจาก ngrok ได้
- Backend ใช้ `LINE_LIFF_CHANNEL_ID` จาก Basic settings ของ LINE Login Channel เพื่อส่ง ID token ไปตรวจสอบกับ LINE Login API
- ปรับ endpoint ผูกบัญชีให้ตรวจ HN และวันเกิด, ตรวจ audience ของ ID token, ป้องกัน LINE account หนึ่งบัญชีผูกหลายผู้ป่วย, ป้องกันผู้ป่วยหนึ่งรายถูกเขียนทับจาก request พร้อมกัน, และรองรับการเรียกผูกบัญชีซ้ำอย่างปลอดภัย

### ผลการทดสอบจริง

- สร้างผู้ป่วยจำลอง `TEST-LIFF-001` วันเกิด `2000-01-01` สำหรับทดสอบเท่านั้น
- เปิด LIFF จาก URL `https://liff.line.me/2011232013-WuKeRoWW` ด้วย LINE account ผู้ดูแล และผูกบัญชีเข้ากับผู้ป่วยจำลองสำเร็จ
- ทดสอบออกใบนัดให้ผู้ป่วยจำลอง แล้วได้รับข้อความใบนัดใน LINE จริง
- ตรวจ Supabase แบบอ่านอย่างเดียวหลังทดสอบ พบว่า:
  - ผู้ป่วย `TEST-LIFF-001` มีการผูก LINE แล้ว
  - ใบนัดล่าสุดสถานะ `pending` วันที่ `2026-08-25` เวลา `09:00:00`
  - ฟิลด์ `appointments.line_sent_at` มีค่า `2026-08-24T09:46:36.78+00:00`
  - ตาราง `line_message_deliveries` มีรายการล่าสุดสถานะ `sent` และไม่มี error

### ข้อควรระวังในการทดสอบต่อ

- ระบบกำหนดความสัมพันธ์แบบ `LINE 1 บัญชี = ผู้ป่วย 1 ราย` และ `ผู้ป่วย 1 ราย = LINE 1 บัญชี` เพื่อป้องกันส่งข้อมูลผิดราย
- หากต้องการทดสอบผูก LINE account เดิมกับผู้ป่วยจำลองใหม่ ต้องยกเลิก `line_user_id` ของผู้ป่วยจำลองรายเดิมก่อน โดยแก้ไขเฉพาะแถวเป้าหมายเท่านั้น
- URL ฟรีของ ngrok เปลี่ยนได้เมื่อปิดและเปิด tunnel ใหม่ ต้องอัปเดตทั้ง LIFF Endpoint URL, LINE webhook URL และ `allowedHosts` ใน `angular.json` ให้ตรง URL ใหม่ก่อนทดสอบ
- ห้ามใช้ข้อมูลผู้ป่วยจริงหรือฐานข้อมูลจริงของโรงพยาบาลในการทดสอบนี้

### สถานะหลังการทดสอบ

- Flow `สแกน QR กลาง/เปิด LIFF -> ยืนยัน LINE account -> ผูกผู้ป่วยจำลอง -> เจ้าหน้าที่ออกใบนัด -> backend บันทึก -> ส่ง LINE` ทำงานสำเร็จครบ
- ระบบยังเป็น prototype และ LINE Login Channel ยังไม่ควร Publish จนกว่าจะทดสอบกับ Tester, แก้ประเด็น RLS, migration/backup, scheduler แจ้งเตือน และเตรียม HTTPS domain ถาวรเสร็จ

## บันทึกการปรับปรุงเพิ่มเติม — QR กลาง, LIFF และ Vercel Production (24 สิงหาคม 2026)

ส่วนนี้เป็นสถานะล่าสุด และใช้แทนรายละเอียดเก่าเฉพาะเรื่องขั้นตอนการยืนยันผู้ป่วยผ่าน LIFF, การใช้ ngrok และการ deploy

### หลักการออกแบบการผูก LINE ที่ใช้ปัจจุบัน

- ใช้ QR กลางเพียงอันเดียว โดย QR เปิด URL `https://liff.line.me/<LIFF_ID>` ไม่ต้องออก QR แยกให้ผู้ป่วยทีละคน
- ผู้ป่วยเปิด LIFF จาก LINE แล้วกรอกเลขบัตรประชาชน **4 ตัวท้าย** และวันเกิดในรูปแบบ `YYYY-MM-DD` เพื่อจับคู่กับข้อมูลผู้ป่วยจำลอง
- ระบบส่ง LIFF ID token ไปตรวจสอบกับ LINE Login API และใช้ LINE user ID ที่ LINE ตรวจสอบแล้วเท่านั้น จึงไม่เชื่อถือ LINE user ID ที่ส่งมาจาก browser โดยตรง
- ไม่ใช้ HN เป็นข้อมูลที่ผู้ป่วยต้องกรอก เพราะ HN เป็นเลขที่โรงพยาบาลกำหนดและผู้ป่วยอาจไม่ทราบ
- จำกัดความสัมพันธ์เป็น `LINE 1 บัญชี = ผู้ป่วย 1 ราย` และ `ผู้ป่วย 1 ราย = LINE 1 บัญชี` เพื่อป้องกันการส่งใบนัดผิดราย

### ตารางความสัมพันธ์ LINE

- เพิ่มตาราง `patient_line_links` ด้วย migration `database/migrations/20260824_create_patient_line_links.sql`
- ตารางนี้เก็บ `patient_id`, `line_user_id`, `linked_at`, `created_at` และ `updated_at`
- กำหนด unique constraint ทั้ง `patient_id` และ `line_user_id` เพื่อบังคับความสัมพันธ์แบบหนึ่งต่อหนึ่ง
- ใช้ตารางนี้เป็นแหล่งตรวจสอบหลักก่อนส่งใบนัดและก่อนรับ LINE postback
- การตรวจสอบผู้ป่วยอ่านจากตาราง `patients` เท่านั้น แล้วเขียนผลการผูก LINE ลง `patient_line_links`; แนวทางนี้รองรับอนาคตที่ข้อมูลผู้ป่วยมาจาก HIS แบบอ่านอย่างเดียว

### โค้ดที่ปรับสำหรับ LIFF

- ปรับหน้า `src/app/pages/line-link/` จากการกรอก HN เป็นกรอกเลขบัตรประชาชน 4 ตัวท้ายและวันเกิด
- หน้า LIFF ส่ง `id_card_last4`, `date_of_birth` และ LIFF `id_token` ไปที่ `POST /api/line/link/verify`
- ปรับ `backend/src/routes/line.routes.ts` ให้ค้นหา `patients` ด้วยวันเกิดและเลขบัตรประชาชนที่ลงท้าย 4 ตัวตามที่กรอก
- ปรับการส่ง LINE Push Message และการรับ postback ให้ดึง LINE user ID จาก `patient_line_links` แทน `patients.line_user_id`
- ยกเลิก endpoint เดิมที่ให้ admin เขียน `patients.line_user_id` โดยตรง
- ปรับ `backend/src/routes/data.routes.ts` ไม่ให้ flow ออกใบนัดพึ่ง `patients.line_user_id`

### ผลทดสอบข้อมูลจำลองที่สำเร็จ

- ทดสอบ LIFF ผ่าน QR กลางบนบัญชี LINE จริงสำเร็จ
- ผู้ป่วยจำลองที่ทดสอบสามารถค้นหาและเชื่อมบัญชี LINE ได้ด้วยเลขบัตร 4 ตัวท้ายและวันเกิดที่ตรงกัน
- หลังเชื่อมสำเร็จ เจ้าหน้าที่ออกใบนัดและระบบส่งข้อความไปยังบัญชี LINE ของผู้ป่วยรายที่เชื่อมไว้ได้ถูกต้อง
- ตัวอย่างคู่ข้อมูลสำหรับทดสอบที่ตรวจพบในฐานข้อมูลจำลอง:
  - `0002` และ `1988-04-12` (`DEMO-LIFF-002`)
  - `0003` และ `1992-08-25` (`DEMO-LIFF-003`)
  - `0004` และ `1979-11-03` (`DEMO-LIFF-004`)
  - `0005` และ `2001-06-17` (`DEMO-LIFF-005`)
  - `0006` และ `1966-02-28` (`DEMO-LIFF-006`)

### Deploy Vercel ที่ทำสำเร็จ

- เปลี่ยนจาก ngrok เป็น Vercel Production เพราะหน้าเตือน ngrok free (`ERR_NGROK_6024`) ทำให้ LIFF และ webhook ใช้งานกับผู้ทดสอบภายนอกได้ไม่เหมาะสม
- Deploy frontend Angular และ backend API สำเร็จบน Vercel Production
- Production domain หลักที่ใช้งานได้คือ `https://smart-appointment-system-gamma.vercel.app`
- ตรวจสอบหน้าเว็บได้ HTTP `200`
- ตรวจสอบ `GET /api/health` ได้ HTTP `200` และตอบ `{ "status": "ok", "database": "ok" }`
- ใช้ Vercel Function มาตรฐานที่ `api/[...path].js` เพื่อให้ Express และ dependencies ของ backend ถูก bundle เข้า runtime ถูกต้อง
- `vercel.json` กำหนด Angular build, output directory, rewrite `/api/*` ไปยัง function และ fallback ไป `index.html`
- ปรับ `backend/src/index.ts` ให้ export Express app ได้สำหรับ Vercel และยังรัน `app.listen()` ได้เมื่อใช้ local backend ตามเดิม
- เพิ่ม script `vercel-build` ให้ build Angular และ build backend ก่อน deploy
- เพิ่ม runtime dependencies ที่ backend ใช้ใน root `package.json` เพื่อให้ Vercel Function หา Express, Supabase, CORS และ dotenv ได้
- ปรับ Angular production CSS budget จาก 12 kB เป็น 14 kB เพื่อให้ production build ผ่าน; ยังมี CSS budget warnings ในบางหน้า แต่ไม่ทำให้ build ล้มเหลว

### การตั้งค่าบน Vercel ที่ทำแล้ว

- ตั้ง environment variables สำหรับ Preview และ Production โดยเก็บเป็น Sensitive ไม่แสดงค่าใน log:
  - `SUPABASE_URL`
  - `SUPABASE_SECRET_KEY`
  - `JWT_SECRET`
  - `JWT_EXPIRES_IN`
  - `LINE_CHANNEL_SECRET`
  - `LINE_CHANNEL_ACCESS_TOKEN`
  - `LINE_LIFF_CHANNEL_ID`
  - `FRONTEND_ORIGINS`
- ไม่ได้ commit ค่า secret, ไฟล์ `.env` หรือสร้าง Git repository ระหว่างการ deploy

### URL ที่ต้องใช้ใน LINE Developers Console

ตั้งค่าให้ชี้โดเมน Production ดังนี้

```text
LIFF endpoint URL
https://smart-appointment-system-gamma.vercel.app/line-link

Webhook URL
https://smart-appointment-system-gamma.vercel.app/api/line/webhook
```

ไม่ต้องเปิด ngrok, Angular development server หรือ backend ในเครื่องเพื่อให้ QR/LIFF ที่ deploy แล้วทำงาน

### เรื่อง `patients.line_user_id` และสถานะการเชื่อม LINE

- สถานะการเชื่อมจริงในระบบปัจจุบันอยู่ที่ `patient_line_links` จึงเป็นเหตุให้ `patients.line_user_id` ยังว่าง แม้ส่งใบนัดได้ถูกคน
- สำหรับการใช้งานจริงกับ HIS ควรแยกข้อมูลดังนี้:
  - `patients`: ข้อมูลผู้ป่วยต้นทาง/ข้อมูลจำลอง
  - `patient_line_links`: ข้อมูลบัญชี LINE ที่ระบบใบนัดเป็นเจ้าของ
- สำหรับฐานข้อมูลจำลองปัจจุบัน สามารถ mirror ค่า `patient_line_links.line_user_id` ไปแสดงใน `patients.line_user_id` ได้ เพื่อให้เปิด Table Editor แล้วตรวจผู้ที่เชื่อมแล้วได้ทันที
- ได้จัดเตรียมคำสั่ง SQL trigger สำหรับ sync และ backfill ให้แล้ว แต่ **ยังไม่มีการยืนยันว่าได้รันคำสั่งนี้บน Supabase แล้ว** จึงยังไม่บันทึกว่า `patients.line_user_id` ถูกอัปเดตสำเร็จ

### สิ่งที่ยังไม่ได้ทำ / ควรทำต่อ

1. **รันและตรวจ SQL trigger สำหรับ mirror `line_user_id` (ถ้าต้องการ)**
   - ทำให้ `patients.line_user_id` อัปเดตอัตโนมัติจาก `patient_line_links`
   - หลังรันควรทดสอบเชื่อมผู้ป่วยจำลองใหม่ 1 ราย และตรวจทั้งสองตาราง

2. **แสดงสถานะ LINE ในหน้าจัดการผู้ป่วย (ถ้าจะนำหน้านี้กลับมาใช้)**
   - ควร query แบบ `LEFT JOIN patient_line_links` เพื่อแสดง `เชื่อมแล้ว/ยังไม่เชื่อม`, LINE user ID และวันเวลาที่เชื่อม
   - ไม่ควรใช้ `patients.line_user_id` เพียงอย่างเดียวเป็นสิทธิ์ในการส่งใบนัด เพราะ `patient_line_links` เป็นแหล่งข้อมูลหลัก

3. **ทดสอบ Vercel webhook จาก LINE Developers Console**
   - ตรวจว่าปุ่ม Verify ผ่านบน URL Production และเปิด `Use webhook`
   - ทดสอบ postback ยืนยันนัดและขอเลื่อนนัดจากข้อความ LINE หลัง deploy

4. **ระบบแจ้งเตือนก่อนถึงวันนัด**
   - ยังไม่มี scheduler/cron job ที่ค้นหาใบนัดตามวัน, ส่งข้อความเตือน และป้องกันการส่งซ้ำ

5. **ความพร้อมก่อนใช้งานนอกการสาธิต**
   - เปิด/กำหนด RLS และ policies ให้ครบตามการเข้าถึงจริง
   - วาง migration history และ backup ของ Supabase
   - หากใช้ข้อมูลผู้ป่วยจริง ต้องออกแบบการยืนยันตัวตนที่รัดกุมกว่าเลขบัตร 4 ตัวท้าย + วันเกิด, การยินยอม, audit log และข้อตกลงกับโรงพยาบาลก่อน

## บันทึกการปรับปรุงเพิ่มเติม — แจ้งเตือน LINE และออกใบนัดทดแทน (25 สิงหาคม 2026)

ส่วนนี้เป็นสถานะล่าสุด และใช้แทนรายละเอียดเก่าเฉพาะระบบแจ้งเตือนก่อนถึงวันนัดและ flow ขอเลื่อนนัด

### สิ่งที่ทำสำเร็จและใช้งานได้

#### การแจ้งเตือนก่อนถึงวันนัด

- ระบบอ่านค่าจริงจากตาราง `line_messages` ทุกครั้ง:
  - `appointment_reminder_days` กำหนดจำนวนวันล่วงหน้า (ข้อมูลทดสอบปัจจุบันเป็น `3`)
  - `appointment_reminder` เป็นข้อความ template ที่ผู้ดูแลตั้งค่า
- เมื่อออกใบนัดใหม่ หากวันนัดอยู่ตั้งแต่วันนี้ถึงจำนวนวันที่ตั้งไว้ ระบบส่งข้อความเตือนพร้อมปุ่มทันที นอกเหนือจากข้อความใบนัดปกติ
- Vercel Cron ทำงานทุกวันเวลา 08:00 น. ประเทศไทย และเตือนนัดที่ยังมีสถานะ `pending` ต่อเนื่องจนถึงวันนัด หากยังไม่มีการตอบกลับ
- ตาราง `appointment_reminders` บันทึกการส่งรายใบนัดต่อวันผ่าน `reminder_date` จึงไม่ส่งซ้ำในวันเดียวกัน แม้ออกใบนัดในช่วงใกล้ถึงวันนัดแล้วหรือ cron ทำงานซ้ำ
- การเตือนในวันนัดจะส่งเฉพาะเมื่อยังไม่เลยเวลานัด

#### ปุ่มตอบกลับใน LINE

- ข้อความเตือนส่ง LINE Buttons Template พร้อมปุ่ม `ยืนยันมาตามนัด` และ `ขอเลื่อนนัด`
- การกดปุ่มครั้งแรกเมื่อสถานะยังเป็น `pending` เท่านั้นที่มีผล:
  - ยืนยันนัด เปลี่ยนสถานะเป็น `confirmed`
  - ขอเลื่อนนัด เปลี่ยนสถานะเป็น `rescheduled`
- Backend อัปเดตแบบมีเงื่อนไข `status = pending` จึงป้องกันการกดซ้ำหรือกดสลับปุ่มพร้อมกันได้
- เอา `displayText` ของ LINE postback ออกแล้ว จึงไม่สร้างข้อความสีเขียวซ้ำในห้องแชตเมื่อแตะปุ่มซ้ำ
- ระบบ reply ยืนยันเพียงครั้งแรกที่เปลี่ยนสถานะสำเร็จ; การกดซ้ำหรือกดปุ่มอีกทางหลังตอบแล้วไม่ส่งข้อความและไม่เปลี่ยนข้อมูล

#### การจัดการคำขอเลื่อนนัดของเจ้าหน้าที่

- หน้า Staff Dashboard แสดงสถานะ `ขอเลื่อนนัด` เป็นปุ่มกดได้เฉพาะรายการที่ยังไม่มีใบนัดทดแทน
- เมื่อกดสถานะ ระบบเปิดหน้าออกใบนัดใหม่พร้อมเลือกผู้ป่วยรายนั้นให้อัตโนมัติ
- การบันทึกใบนัดทดแทนใช้ database function `create_rescheduled_appointment` เพื่อสร้างใบนัดใหม่สถานะ `pending` และผูกใบนัดเก่ากับใบนัดใหม่ในขั้นตอนเดียว
- ใบนัดเก่าจะเก็บ `rescheduled_to_appointment_id` และเปลี่ยนป้ายเป็น `เลื่อนนัดแล้ว` ซึ่งกดซ้ำไม่ได้
- ใบนัดใหม่ไม่รับสถานะ `rescheduled` จากใบนัดเดิม; เริ่มเป็น `pending` และเข้าสู่ flow ส่งใบนัด/แจ้งเตือนตามปกติ
- สถานะ `rescheduled` ไม่นับเป็นคิวที่ใช้งานหรือเวลาซ้ำของแพทย์แล้ว

#### ฐานข้อมูลและการ deploy

- รัน migration สำหรับ reminder และการเชื่อมใบนัดเก่า–ใหม่แล้ว:
  - `database/migrations/20260825_add_appointment_reminder_scheduler.sql`
  - `database/migrations/20260825_link_rescheduled_appointments.sql`
- ปรับ `vercel.json` ให้ใช้ `npm run vercel-build` ซึ่ง build ทั้ง Angular และ backend ก่อน deploy
- Production deployment ล่าสุดขึ้นสถานะ `Ready` และ alias `https://smart-appointment-system-gamma.vercel.app` ชี้ไปยังโค้ดใหม่
- ตรวจ Angular build และ TypeScript ฝั่ง backend ผ่าน; ยังคงมี CSS budget warnings แต่ไม่ทำให้ build ล้มเหลว

### สิ่งที่ยังควรทำต่อ

1. **ตรวจสถานะ `no_show` อัตโนมัติ**
   - ปัจจุบันหน้า Staff Dashboard เปลี่ยนนัด `pending`/`confirmed` ที่เลยเวลานัดเป็น `no_show` เมื่อหน้าโหลดข้อมูล
   - หากต้องการให้เปลี่ยนทันทีแม้ไม่มีเจ้าหน้าที่เปิดหน้าเว็บ ต้องเพิ่ม cron/job แยกที่ตรวจเวลานัดถี่กว่ารอบแจ้งเตือน 08:00 น.

2. **ทดสอบ end-to-end หลังเปลี่ยนสถานะเลื่อนนัด**
   - ทดสอบกด `ขอเลื่อนนัด` จาก LINE, กดสถานะในหน้า Staff, ออกใบนัดทดแทน และตรวจว่าใบนัดเก่ากดซ้ำไม่ได้
   - ทดสอบกดปุ่ม LINE ซ้ำและกดสลับ เพื่อยืนยันว่าไม่เกิดข้อความหรือการเปลี่ยนสถานะซ้ำ

3. **ความพร้อมก่อนใช้งานนอกการสาธิต**
   - ทำ RLS/policies, migration history, scheduled backup และ audit log ให้ครบ
   - หากใช้ข้อมูลผู้ป่วยจริง ต้องเพิ่มการยืนยันตัวตน, การยินยอม และข้อตกลงกับโรงพยาบาลก่อนใช้งาน

## ทำความสะอาด Database — 27 สิงหาคม 2026

ส่วนนี้บันทึกการล้างข้อมูลที่ขอและทำเสร็จระหว่างตรวจ Supabase โดยเก็บบันทึกเดิมด้านบนไว้ครบ Schema backup และ SQL migration ยังคงอยู่ใน repository; ไฟล์ backup ใช้กู้คืนเท่านั้น และห้ามรันก่อน migration ลบที่เกี่ยวข้อง

### รายการที่ลบจาก Supabase

- ลบตาราง `public.system_logs` โดยตรวจสอบแล้วว่าตารางจริงไม่มีข้อมูล
- ลบ view `public.patients_thai_dates` ซึ่งเป็น read-only view ของ `patients` และเพิ่มเพียง `date_of_birth_be` แบบปีพุทธศักราช
- ลบตาราง `public.line_webhook_events` ซึ่งเก็บเฉพาะ LINE `follow` webhook audit และไม่จำเป็นต่อการผูกผู้ป่วย, ใบนัด, reminder หรือข้อความต้อนรับ
- ลบ `users.phone`, `users.email` และ `users.last_login` เพราะตรวจแล้วไม่มีข้อมูลจริง
- ลบ `patients.address`, `patients.blood_type`, `patients.emergency_contact_name` และ `patients.emergency_contact_phone` เพราะเป็นข้อมูลจำลอง ไม่ใช่ข้อมูลผู้ป่วยจริง
- ลบ `doctors.license_number`, `doctors.phone` และ `doctors.email`
- ลบ `departments.description`
- ลบ `appointments.cancelled_reason` และ `appointments.line_message_id`

### ปรับ Code ก่อนลบ Schema

- เอา LINE webhook audit upsert ออกจาก `backend/src/routes/line.routes.ts` แต่ signature validation และ welcome reply ยังทำงาน
- เอา simulated patient fields ที่เลิกใช้จาก frontend TypeScript models
- ปรับ `USERS_SAFE_COLUMNS` ใน `backend/src/routes/data.routes.ts` ไม่ให้ select `users` columns ที่ถูกลบ
- ตรวจ backend TypeScript ผ่านด้วย `tsc --noEmit`

### รายการที่เก็บไว้หลังตรวจ

- `patient_line_links` ยังเป็นข้อมูลหลักสำหรับผูก patient กับ LINE account ห้ามลบ
- `patients.line_user_id` ยังเก็บไว้ชั่วคราว แม้ซ้ำกับ `patient_line_links.line_user_id`; ต้องทำ data-validation migration แยกก่อนลบ
- `appointments.reschedule_count` ยังจำเป็น เพราะ database function สำหรับเลื่อนนัดอาจใช้บังคับจำนวนครั้งสูงสุด 3 ครั้ง
- `appointments.rescheduled_to_appointment_id` ยังจำเป็น เพราะ Staff Dashboard ใช้เชื่อมใบนัดเก่ากับใบนัดใหม่
- `appointments.line_sent_at` เก็บเวลาส่ง LINE สำเร็จ แม้หน้าเว็บปัจจุบันยังไม่แสดง
- `doctors.specialization`, `departments.code` และ `departments.location` เก็บไว้เพื่อการทำงานหรือใช้ในอนาคต
- `users.require_password_change` เก็บไว้เพื่อ compatibility; field ที่ระบบใช้งานจริงคือ `must_change_password`

### ไฟล์ Migration และ Recovery

- `backend/sql/20260827_remove_unused_system_logs.sql`
- `backend/sql/20260827_remove_unused_users_contact_and_login_columns.sql`
- `backend/sql/20260827_remove_simulated_patient_details.sql`
- `backend/sql/20260827_remove_unused_doctor_contact_and_license_columns.sql`
- `backend/sql/20260827_remove_unused_department_description.sql`
- `backend/sql/20260827_remove_unused_appointment_tracking_columns.sql`
- recovery schema ที่ตรงกันอยู่ใน `database_backups/` โดยใช้วันที่และหัวข้อเดียวกัน

### สิ่งที่ต้องติดตาม

- Dashboard มี legacy query ที่ยังคาดหวัง appointment fields หรือ relations เก่า เช่น `queue_number`, `department_id` และ relation ตรงกับ `departments`/`doctors`; ต้องซ่อมหรือเลิกใช้ endpoint เหล่านี้ก่อนนำไปพึ่งพา
- ห้ามลบ patient fields เพิ่มโดยไม่ตรวจ HIS integration, report, scheduled job และ external consumer ก่อน

## แก้ Frontend build และ LINE templates — 27 สิงหาคม 2026

### แก้ Staff Dashboard build

- แก้ Angular build failure ใน `src/app/pages/staff-dashboard/staff-dashboard.component.ts` ที่ template เรียก methods ซึ่งยังไม่มีใน component
- เพิ่ม `startRescheduledAppointment()` เพื่อเปิด `/staff/new-appointment` พร้อมเลือกผู้ป่วยและ source appointment ผ่าน query parameters
- ในช่วงนี้เพิ่ม `canCheckIn()` และ `checkIn()` เพื่อเปลี่ยน `pending` หรือ `confirmed` เป็น `completed`; ภายหลังแทนที่ด้วย QR เช็กอินกลางตามบันทึกวันที่ 3 กันยายน 2026
- ทำให้การค้นหานัดปลอดภัยเมื่อ HN, ชื่อผู้ป่วย หรือแผนกไม่มีข้อมูล
- เพิ่มค่า `AppointmentStats` ที่ต้องใช้: `total`, `cancelled` และ `rescheduled`
- เปลี่ยนป้าย `rescheduled` ฝั่ง Staff เป็น `ขอเลื่อนนัด`
- ตรวจด้วย `npm.cmd run vercel-build` ผ่านทั้ง Angular และ backend TypeScript; CSS budget warnings เดิมยังไม่ block build

### LINE appointment และ reminder templates

- เพิ่ม `backend/sql/20260827_add_appointment_details_to_line_templates.sql` สำหรับรันใน Supabase SQL Editor
- migration ปรับ `line_messages` keys `appointment_created` และ `appointment_reminder` โดยคงข้อความเดิมและเพิ่ม:
  - `ห้องตรวจ: {{room}}`
  - `วัตถุประสงค์การนัด: {{purpose}}`
  - `หมายเหตุ/คำแนะนำสำหรับผู้ป่วย: {{notes}}`
- Backend template rendering รองรับ `{{room}}`, `{{purpose}}` และ `{{notes}}` อยู่แล้ว จึงไม่ต้องแก้ backend เพิ่ม

## Vercel Cron authorization สำหรับ LINE appointment reminders — 29 สิงหาคม 2026

### ผลตรวจจาก live database

- reminder delivery flow เดิมทำงานได้ โดย rows ใน `appointment_reminders` มี `status = sent` และ `error_message = NULL`
- rows ที่ส่งสำเร็จวันที่ 27 สิงหาคมเป็น immediate reminder หลังออกใบนัด ไม่ใช่ scheduled run 08:00 เพราะ `sent_at` ห่างจาก `created_at` เพียงไม่กี่วินาที
- วันที่ 28 สิงหาคม มี pending appointments ระหว่าง 29–31 สิงหาคมที่อยู่ใน reminder window 3 วัน แต่ไม่มี `appointment_reminders` rows ของวันนั้น แสดงว่า Vercel Cron scheduled invocation ยังรันไม่สำเร็จ

### ตั้งค่า Production สำเร็จ

- เพิ่ม `CRON_SECRET` ใน Vercel Project Environment Variables แบบ `Secret` และ scope `Production`
- Redeploy Production หลังเพิ่ม secret เพื่อให้ deployed API รับค่า `CRON_SECRET`
- ไม่ต้องแก้ application code เพราะ `vercel.json` มี cron route `/api/cron/appointment-reminders` อยู่แล้ว และ backend ตรวจ `Authorization: Bearer <CRON_SECRET>` อยู่แล้ว

### การตรวจรอบ scheduled ถัดไป

- Vercel Cron ตั้งให้ทำงานทุกวันเวลา 08:00 ประเทศไทย
- หลังรอบถัดไป ตรวจ Vercel Logs ของ `/api/cron/appointment-reminders` และยืนยันว่ามี rows ใหม่ใน `appointment_reminders` ที่ `reminder_date` เป็นวันปัจจุบัน
- ใบนัดที่จะได้รับ reminder ต้องเป็น `pending`, อยู่ใน reminder window, มี active reminder template และผูก LINE account แล้ว ระบบส่งวันละ 1 ครั้งต่อใบนัดจนกว่าผู้ป่วยจะยืนยันหรือขอเลื่อนนัด

## QR เช็กอินกลาง, no-show อัตโนมัติ และสรุปตรวจระบบ — 3 กันยายน 2026

### QR เช็กอินผู้ป่วยที่โรงพยาบาล

- เพิ่ม QR กลาง 1 จุดในหน้า Staff Dashboard เจ้าหน้าที่กดปุ่ม `QR เช็กอิน` เพื่อแสดงหรือพิมพ์ติดที่เคาน์เตอร์โรงพยาบาล
- QR เป็น LINE LIFF URL พร้อม `mode=checkin` ผู้ป่วยสแกนด้วย LINE account ที่ผูกกับข้อมูลผู้ป่วยไว้แล้ว จากนั้น backend ยืนยัน LIFF ID token กับ LINE ก่อนเปลี่ยนสถานะนัดทุกครั้ง
- ระบบค้นหาใบนัดที่เช็กอินได้ของผู้ป่วยรายนั้นตามวันปัจจุบันในเวลา `Asia/Bangkok` แล้วเปลี่ยนเฉพาะ `pending` หรือ `confirmed` เป็น `completed` โดยหน้า Staff แสดง `completed` ว่า `มาตามนัดแล้ว`
- สแกนซ้ำจะตอบว่าเช็กอินแล้วโดยไม่แก้ข้อมูลซ้ำ สแกนแล้วไม่มีใบนัดที่เช็กอินได้จะถูกปฏิเสธ หากมีนัดที่เช็กอินได้เกิน 1 รายการในวันเดียว ระบบจะไม่เดาและให้ติดต่อเจ้าหน้าที่
- เอาปุ่มเช็กอินรายคน, function เช็กอินฝั่งหน้าเว็บ และคอลัมน์ดำเนินการที่ว่างออกแล้ว ใช้ flow QR กลางแทน ส่วนปุ่มเลื่อนนัดยังทำงานเหมือนเดิม
- เอา LIFF URL ดิบที่แสดงใต้รูป QR ออกแล้ว

### สถานะ `no_show` อัตโนมัติ

- เพิ่ม `backend/sql/20260903_auto_mark_no_show.sql` และรันใน Supabase SQL Editor แล้ว
- SQL เปิด `pg_cron`, สร้าง function `public.mark_expired_appointments_no_show()` และตั้ง job `appointment-no-show-every-5-minutes` ด้วย `*/5 * * * *`
- Supabase ตรวจทุก 5 นาที หากนัดสถานะ `pending` หรือ `confirmed` เลยวันและเวลานัดตาม `Asia/Bangkok` จะเปลี่ยนเป็น `no_show` อัตโนมัติ
- รายการ `completed` (`มาตามนัดแล้ว`), `cancelled` และ `rescheduled` จะไม่ถูก job นี้เปลี่ยนสถานะ
- ปิดสิทธิ์เรียก database function จาก `PUBLIC`, `anon` และ `authenticated`; มีเพียง database scheduler ที่เรียกได้
- งานนี้แยกจาก Vercel Cron โดย Vercel Cron ยังส่ง LINE reminder ทุกวัน 08:00 ไทยตามเดิม เมื่อรายการเป็น `no_show` แล้ว ระบบเตือนจะไม่เลือกอีก เพราะเตือนเฉพาะ `pending`

### แก้ปัญหา timezone หน้า Staff Dashboard

- เปลี่ยนการแปลงวันแบบ UTC ใน `staff-dashboard.component.ts` เป็น local calendar date
- หน้า Staff โหลดวันนัดตามวันไทยถูกต้องช่วง 00:00–06:59 และไม่เผลอค้นหานัดของวันก่อนหน้า
- เมื่อเปลี่ยนวันที่ ระบบรีเฟรชทั้งตารางนัดและสถิติพร้อมกัน

### ผลตรวจและสถานะ deploy

- `npm.cmd run vercel-build` ผ่าน: Angular production build และ backend TypeScript build สำเร็จ
- Vercel Production ล่าสุดที่ตรวจเป็น `Ready` มี alias `https://smart-appointment-system-gamma.vercel.app` และ `https://smart-appointment-system-ab-12.vercel.app`
- Production health check ตอบ `{ "status": "ok", "database": "ok" }` และ Vercel runtime logs ล่าสุดมีเฉพาะ login/query/health ปกติ ไม่มี application error
- การแก้ไขหลัง deploy ล่าสุดยังต้อง deploy Production ใหม่ด้วย `npx vercel --prod` จาก project root

### สิ่งที่ต้องทำก่อนใช้ข้อมูลผู้ป่วยจริง

- **สำคัญมาก:** `backend/src/routes/auth.routes.ts` ยังเก็บและเปรียบเทียบ password แบบ plain text ต้องเปลี่ยนเป็น password hash เช่น Argon2 หรือ bcrypt ก่อนใช้กับผู้ป่วยจริง
- QR กลางยืนยันได้ว่าผู้สแกนควบคุม LINE account ที่ผูกไว้ แต่รูป QR คงที่อาจถูกส่งต่อได้ หากต้องยืนยันการมาถึงโรงพยาบาลให้เข้มขึ้น ควรใช้ QR หมุนรหัสตามเวลา หรือเพิ่มขั้นตอนยืนยันโดยเจ้าหน้าที่
- Legacy endpoints ใน `backend/src/routes/dashboard.routes.ts` ยังอ้าง field/relation เก่า เช่น `queue_number` และ `department_id` หน้า Admin ปัจจุบันไม่ได้ใช้ endpoint เหล่านี้ แต่ควรแก้หรือลบก่อนมี client อื่นเรียกใช้งาน

### สรุปสิ่งที่ต้องทำล่าสุด

#### ต้องทำทันที

1. Deploy code ล่าสุดขึ้น Vercel Production จาก project root:
   ```bat
   npx vercel --prod
   ```
2. หลัง deploy ให้ทดสอบ QR กลางด้วย LINE account ของผู้ป่วยที่ผูกไว้แล้ว:
   - สร้างนัดวันนี้ให้มีสถานะ `pending` หรือกดปุ่มยืนยันใน LINE ให้เป็น `confirmed`
   - สแกน `QR เช็กอิน` จากหน้า Staff Dashboard ด้วย LINE account เดียวกัน
   - ตรวจว่าใบนัดเปลี่ยนเป็น `completed` และหน้า Staff แสดง `มาตามนัดแล้ว`
3. ทดสอบ Supabase Cron `no_show` ด้วยนัดที่ตั้งเวลาให้เลยเวลาแล้ว:
   - ใช้สถานะ `pending` หรือ `confirmed` และห้ามสแกน QR
   - รอไม่เกิน 5 นาที แล้วรีเฟรชหน้า Staff
   - ตรวจว่าสถานะเปลี่ยนเป็น `no_show` หรือ `ไม่มาตามนัด`
4. เก็บ QR กลางไว้ที่เคาน์เตอร์ และแจ้งผู้ป่วยให้สแกนผ่าน LINE account ที่ผูกไว้เมื่อมาถึงโรงพยาบาล

#### ต้องแก้ก่อนใช้งานกับข้อมูลผู้ป่วยจริง

1. เปลี่ยนระบบ password ใน `backend/src/routes/auth.routes.ts` จาก plain text เป็น password hash ด้วย Argon2 หรือ bcrypt และทำ migration ให้ password เดิมปลอดภัย
2. ตั้ง RLS และ policies ของ Supabase ให้ครบตามผู้ใช้จริง รวมถึงตรวจสิทธิ์ของตารางผู้ป่วย, ใบนัด, LINE logs และ templates
3. วางแผน backup, migration history และ audit log ที่กู้คืนและตรวจสอบย้อนหลังได้
4. ซ่อมหรือลบ legacy API ใน `backend/src/routes/dashboard.routes.ts` ที่อ้าง Schema เก่า ก่อนให้ระบบหรือ client อื่นเรียกใช้

#### ข้อจำกัดที่ยอมรับได้ในเวอร์ชันปัจจุบัน

- QR กลางเป็น QR คงที่ จึงยืนยัน LINE account ได้ แต่ไม่ยืนยันตำแหน่งทางกายภาพ 100%; หากต้องการความเข้มงวดเพิ่ม ให้พัฒนา QR หมุนรหัสตามเวลา หรือเพิ่มการยืนยันโดยเจ้าหน้าที่
- Vercel Cron แผนปัจจุบันเหมาะกับ reminder วันละครั้ง 08:00; งานตรวจ `no_show` ทุก 5 นาทีใช้ Supabase Cron แทนแล้ว

## ผลทดสอบและการแก้ไข QR เช็กอินล่าสุด — 3 กันยายน 2026

### สิ่งที่แก้ไขและ deploy สำเร็จแล้ว

- ตรวจ Vercel Production และตั้งค่า `LINE_LIFF_CHANNEL_ID` ให้ใช้ Channel ID ของ `LINE Login` ที่เป็นเจ้าของ LIFF ID `2011232013-WuKeRoWW` ไม่ใช่ LIFF ID เต็ม และไม่แก้ `LINE_CHANNEL_SECRET` หรือ `LINE_CHANNEL_ACCESS_TOKEN` ของ Messaging API
- แก้ `src/app/pages/line-link/line-link.component.ts` ให้แสดงสาเหตุของการเช็กอินจาก API แทนข้อความรวมว่าเปิดนอก LINE
- แก้ `src/app/core/interceptors/error.interceptor.ts` ไม่ให้เปลี่ยน error ของ public LIFF endpoints (`/api/line/check-in` และ `/api/line/link/verify`) เป็นข้อความทั่วไป เพื่อให้หน้า QR แสดงรหัส HTTP และสาเหตุจริง
- Build ผ่านด้วย `npm.cmd run vercel-build` ทั้ง Angular และ backend TypeScript; warnings CSS budget และ CommonJS `qrcode` เดิมยังมี แต่ไม่ทำให้ build ล้มเหลว
- Deploy Production สำเร็จ และชี้ alias `https://smart-appointment-system-gamma.vercel.app` ซึ่ง LIFF ใช้งาน ไปยัง deployment ล่าสุดแล้ว

### ผลทดสอบที่ยืนยันได้

- ผู้ป่วยสแกน QR กลางผ่านแอป LINE ได้ และ backend ยืนยัน LIFF identity token ได้แล้ว
- ระบบพบความเชื่อมโยงระหว่าง LINE account กับผู้ป่วยแล้ว เพราะการตอบกลับเป็น `404 ไม่พบนัดที่เช็กอินได้ในวันนี้` ไม่ใช่ `401` หรือ `403`
- QR กลางจงใจเช็กอินได้เฉพาะวันนัดปัจจุบันตามเขตเวลา `Asia/Bangkok`; การเลือกวันอื่นใน Staff Dashboard เปลี่ยนเฉพาะรายการที่แสดง ไม่เปลี่ยนวันที่ที่ backend ใช้เช็กอิน
- ใบนัดสำหรับอนาคตสามารถกดยืนยันผ่าน LINE ล่วงหน้าเพื่อเปลี่ยนเป็น `confirmed` ได้ แต่สแกน QR เพื่อลงทะเบียนมาถึงโรงพยาบาลไม่ได้จนกว่าจะถึงวันนัดจริง

### สิ่งที่ยังต้องทดสอบ

1. สร้างหรือใช้ใบนัดของผู้ป่วย LINE account เดิมในวันปัจจุบันตามเวลาไทย ให้สถานะเป็น `pending` หรือ `confirmed`
2. สแกน QR กลางในวันนั้น และตรวจว่าสถานะเปลี่ยนเป็น `completed` พร้อมข้อความ `มาตามนัดแล้ว` บน Staff Dashboard
3. ทดสอบ Supabase Cron `no_show`: สร้างนัดวันนี้ที่เลยเวลาแล้วในสถานะ `pending` หรือ `confirmed`, ห้ามสแกน QR, รอไม่เกิน 5 นาที แล้วตรวจว่ากลายเป็น `no_show`

### งานที่ต้องแก้ก่อนใช้ข้อมูลผู้ป่วยจริง

1. เปลี่ยน password plain text ใน `backend/src/routes/auth.routes.ts` เป็น Argon2 หรือ bcrypt และทำ migration รหัสผ่านเดิม
2. ตั้ง Supabase RLS/policies ให้ครบสำหรับผู้ป่วย, ใบนัด, LINE logs และ templates
3. จัดทำ backup, migration history และ audit log ที่กู้คืนและตรวจสอบย้อนหลังได้
4. ซ่อมหรือลบ legacy API ใน `backend/src/routes/dashboard.routes.ts` ที่อ้าง Schema เก่า

## สรุปการแก้ไขล่าสุดที่พร้อมนำไปใช้งาน — 3 กันยายน 2026

> หัวข้อนี้เป็นสถานะล่าสุดและใช้แทนรายการเก่าที่ระบุให้แก้ `dashboard.routes.ts` หรือให้เปลี่ยนรูปแบบ password

### แก้ไขแล้ว

- ลบ `backend/src/routes/dashboard.routes.ts` และเลิก mount `/api/dashboard` ใน `backend/src/index.ts` แล้ว
- ตรวจ Supabase จริงแบบอ่านอย่างเดียวและยืนยันว่า legacy API เดิมอ้าง fields/relations ที่ไม่มี ได้แก่ `appointments.queue_number`, `appointments.department_id`, patient fields แบบ `title`/`first_name`/`last_name` และ relation จาก `appointments` ไป `departments`/`doctors`
- หน้าเว็บปัจจุบันไม่มีการเรียก `/api/dashboard/*` ดังนั้นการลบไม่กระทบ flow หลักของระบบ และตัด API ที่เรียกแล้ว error ออก
- ตรวจ schema ที่ API หลักใช้งานอยู่แล้ว: `users`, `appointments`, `patients`, `patient_line_links`, `line_messages`, `line_message_deliveries` และ `appointment_reminders` มี columns ที่ API ใช้อยู่

### อัปเดตสถานะหน้า Staff อัตโนมัติ

- แก้ `src/app/pages/staff-dashboard/staff-dashboard.component.ts` ให้ดึงรายการนัดและสถิติใหม่ทุก 5 วินาที ขณะที่หน้า Staff Dashboard เปิดและอยู่ในแท็บที่มองเห็น
- ผู้ป่วยยืนยันนัด, ขอเลื่อนนัด, สแกน QR เช็กอิน หรือ Supabase Cron เปลี่ยนเป็น `no_show` แล้ว หน้า Staff จะอัปเดตสถานะเองภายในไม่เกิน 5 วินาที โดยไม่ต้องกดปุ่มรีเฟรชหรือโหลดหน้าใหม่
- ออกจากหน้า Staff Dashboard แล้ว timer จะถูกปิด จึงไม่มี request ค้างจากหน้านั้น

### ผลการตรวจ build และการใช้งาน

- `npm.cmd run vercel-build` ผ่านหลังลบ legacy Dashboard API
- `npm.cmd run build` ผ่านหลังเพิ่มการอัปเดตสถานะอัตโนมัติ
- คำเตือน CSS budget และ CommonJS `qrcode` ยังมีอยู่เดิม แต่ไม่ทำให้ build ล้มเหลว
- การเปลี่ยนแปลงล่าสุดอยู่ใน source และพร้อม deploy; ต้อง deploy Production อีกครั้งด้วย `npx vercel --prod` จาก project root ก่อนจึงจะเห็นผลบนเว็บไซต์จริง

### ขอบเขตที่ยืนยันโดยผู้ดูแลระบบ

- ระบบเก็บ password แบบ plain text และมีหน้า `/admin/users` สำหรับเพิ่มบัญชี, รีเซ็ตรหัสผ่าน และเปิด/ปิดบัญชีตามความตั้งใจของระบบปัจจุบัน จึงไม่เปลี่ยนส่วนนี้
- การทดสอบ Supabase Cron ให้เปลี่ยนนัดเลยเวลาเป็น `no_show` ยังต้องรอเวลานัดจริงหรือสร้างนัดทดสอบที่เลยเวลาแล้ว
## สรุปงานล่าสุด — 3 กันยายน 2026

### ทำแล้ว

- QR เช็กอินใช้ QR เดียว ตรวจผ่าน LIFF/LINE account และเช็กอินได้เฉพาะวันนัดตาม `Asia/Bangkok`; เปลี่ยนสถานะเป็น `completed`.
- สร้าง LINE Rich Menu ผู้ป่วยจาก `backend/assets/patient-rich-menu.png` ขนาด `2500×1686`: ซ้ายเลื่อนนัด, กลางดูใบนัด, ขวาติดต่อแผนก.
- สร้าง Rich Menu จริงใน LINE OA, ผูกให้ผู้ป่วยเดิมใน `patient_line_links`, ตั้ง `LINE_PATIENT_RICH_MENU_ID` บน Vercel Production และ deploy แล้ว.
- ผู้ป่วยใหม่ที่เชื่อม LIFF ได้ Rich Menu อัตโนมัติ. LINE สลับกลับคีย์บอร์ดเพื่อพิมพ์แชตได้เอง.
- ปุ่มดูใบนัดส่งใบนัดล่าสุด/แจ้งเมื่อกำลังรอใบนัดใหม่; ปุ่มเลื่อนนัดทำได้เมื่อเหลือมากกว่า 3 วันและเปลี่ยนสถานะเป็น `rescheduled`; ปุ่มติดต่อแผนกส่งรายชื่อและเบอร์แผนก.
- คงข้อความใบนัดและข้อความเตือนเดิมจาก Supabase `line_messages`; backend build ผ่าน.

### ต้องทำก่อนใช้ปุ่มติดต่อแผนกจริง

1. รัน `backend/sql/20260903_department_contact_phones.sql` ใน Supabase SQL Editor เพื่อเพิ่ม `departments.phone` และสุ่มเบอร์จำลองให้แผนกที่ยังไม่มีเบอร์.
2. เปลี่ยนเบอร์จำลองเป็นเบอร์ติดต่อจริงของทุกแผนก.

### ยังต้องทดสอบ

1. ผู้ป่วยเดิมเห็น Rich Menu หลังเปิดแชต LINE OA ใหม่.
2. ผู้ป่วยใหม่เชื่อม LIFF แล้วได้รับ Rich Menu.
3. ทั้ง 3 ปุ่ม: ใบนัดปัจจุบัน/รอใบนัดใหม่/ไม่มีนัด, เลื่อนนัดก่อนและภายใน 3 วัน, และรายชื่อเบอร์แผนก.
4. QR เช็กอินวันนัดจริงแล้ว Staff Dashboard เป็น `completed`.

### ควรแก้ก่อนใช้ข้อมูลผู้ป่วยจริง

- เปลี่ยนรหัสผ่าน plain text เป็น Argon2 หรือ bcrypt.
- เปิด Supabase RLS/policies สำหรับข้อมูลผู้ป่วย, ใบนัด, LINE logs และ templates.
- จัดทำ migration history, backup และ audit log.
