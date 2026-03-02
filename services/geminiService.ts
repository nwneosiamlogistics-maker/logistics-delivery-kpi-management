import { GoogleGenerativeAI } from "@google/generative-ai";
import { DeliveryRecord } from "../types";

const getApiKey = () => {
  const key = (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (import.meta as any).env?.VITE_API_KEY ||
    (typeof process !== 'undefined' ? (process.env.API_KEY || process.env.GEMINI_API_KEY) : '');
  if (!key || key === 'undefined' || key === 'null') return '';
  return key;
};

const genAI = new GoogleGenerativeAI(getApiKey());

export const getKpiInsights = async (deliveries: DeliveryRecord[]) => {
  const summary = deliveries.reduce((acc, curr) => {
    acc.total++;
    if (curr.kpiStatus === 'PASS') acc.pass++;
    else acc.fail++;
    return acc;
  }, { total: 0, pass: 0, fail: 0 });

  if (summary.total === 0) return "ยังไม่มีข้อมูลสำหรับการวิเคราะห์";

  const prompt = `
    ในฐานะผู้เชี่ยวชาญด้านโลจิสติกส์ โปรดวิเคราะห์ข้อมูล KPI การจัดส่งดังนี้:
    - จำนวนการจัดส่งทั้งหมด: ${summary.total}
    - ผ่าน KPI (ตรงเวลา): ${summary.pass}
    - ไม่ผ่าน KPI (ล่าช้า): ${summary.fail}
    - อัตราการล่าช้า: ${((summary.fail / summary.total) * 100).toFixed(2)}%

    บริบท: KPI ของเรานับเฉพาะวันทำการ (ไม่รวมวันอาทิตย์และวันหยุดที่กำหนด) 
    หากการส่งมอบล่าช้า พนักงานต้องระบุเหตุผลประกอบ

    โปรดให้บทวิเคราะห์สั้นๆ (2-3 ย่อหน้า) เกี่ยวกับภาพรวมประสิทธิภาพและจุดที่ควรปรับปรุง
    **สำคัญ: โปรดตอบเป็นภาษาไทยที่ดูเป็นมืออาชีพและกระชับ**
  `;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error: any) {
    console.error("AI Insight Error:", error);
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      return "ระบบ AI (Gemini 1.5 Flash) ยังไม่เปิดให้ใช้งานในภูมิภาคของคุณ หรือ API Key มีข้อจำกัด กรุณาตรวจสอบการตั้งค่า";
    }
    if (error.message?.includes('API key')) {
      return "กรุณาตั้งค่า API Key ให้ถูกต้องในไฟล์ .env เพื่อใช้งาน AI Insight";
    }
    return "ไม่สามารถสร้างบทวิเคราะห์ได้ในขณะนี้: " + (error.message || "Unknown Error");
  }
};

export const analyzeDelayPatterns = async (failedDeliveries: DeliveryRecord[]) => {
  if (failedDeliveries.length === 0) return "ยังไม่พบรายการล่าช้าที่ต้องวิเคราะห์";

  const prompt = `
    วิเคราะห์รายการที่ส่งมอบล่าช้าจำนวน ${failedDeliveries.length} รายการ 
    สาเหตุส่วนใหญ่ที่พบ: ${failedDeliveries.map(d => d.delayReason || 'ไม่ระบุ').slice(0, 5).join(', ')}
    
    โปรดสรุปความเสี่ยง 3 ข้อสำหรับสัปดาห์หน้า และเสนอแนะแนวทางแก้ไข 2 ข้อ
    **คำสั่ง: ตอบเป็นภาษาไทยเท่านั้น**
  `;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("AI Pattern Analysis Error:", error);
    return "ระบบวิเคราะห์รูปแบบการล่าช้าไม่พร้อมใช้งาน";
  }
};
