# Native GIF trial — OpenRouter / 1A

[เปิดเทียบภาพต้นฉบับกับ GIF](index.html) · [เปิดไฟล์ GIF ที่ API ส่งกลับ](municipal-office-1A-openrouter.gif)

ผู้ใช้ขอใช้ OpenRouter API แทน Higgsfield หลังปฏิเสธวิธีทำโมชั่นด้วยการบิดภาพนิ่งและพรีวิวความละเอียดต่ำ
ทดสอบเฉพาะภาพ 1A หนึ่งครั้ง โดยใช้ภาพนิ่งต้นฉบับที่เลือกเป็น reference แบบ inline PNG

## ผลที่ได้รับ

- Model: `openai/gpt-image-2.6-sunburst`
- Endpoint: `POST https://openrouter.ai/api/v1/images`
- GIF: 640×800, 16 เฟรมไม่ซ้ำ, เฟรมละ 80 ms, วนซ้ำรอบละ 1.28 วินาที
- ขนาดไฟล์: 4,417,280 bytes
- API reported cost: **$0.152605**
- เก็บ byte ที่ API ส่งกลับโดยตรง ไม่มีการย่อภาพ สร้างเฟรมแทรก หรือใช้ motion displacement ในเครื่อง
- ภาพต้นฉบับที่เลือกเก็บเป็น `1A-approved.png` โดยไม่เขียนทับต้นฉบับ

ดู [ผลตรวจ](verification.json), [ค่าที่ส่งและ Prompt](request-public.json), [response metadata](response-metadata.json) และ [สถานะ request](request-status.json)

## API client

`generate_trial.py` อ่าน `OPENROUTER_API_KEY` จาก environment และไม่เขียน key ลงไฟล์
ส่งเพียงหนึ่ง request และปฏิเสธการรันซ้ำถ้ามี submission record เพื่อป้องกันการส่งงานที่อาจมีค่าใช้จ่ายซ้ำโดยไม่ตั้งใจ
ไม่มีการเปลี่ยนผู้ให้บริการสำรองโดยอัตโนมัติ

OpenRouter ระบุว่า GIF ของ OpenAI ใช้ sprite-sheet pixel budget ร่วมกันทั้งชุด จึงเลือกระหว่างจำนวนเฟรมกับความละเอียดต่อเฟรม
การทดสอบนี้เลือก 16 เฟรมที่ 640×800 เพื่อเน้นความคมชัดก่อน

อ้างอิง: [OpenRouter Image Generation API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)

ไฟล์นี้เป็นตัวอย่างสำหรับให้ผู้ใช้ประเมินคุณภาพก่อนทำฉาก 2A / 3A และก่อนนำเข้า UI
