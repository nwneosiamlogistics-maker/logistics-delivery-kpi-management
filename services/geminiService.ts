
import { GoogleGenAI } from "@google/genai";
import { DeliveryRecord } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getKpiInsights = async (deliveries: DeliveryRecord[]) => {
  const summary = deliveries.reduce((acc, curr) => {
    acc.total++;
    if (curr.kpiStatus === 'PASS') acc.pass++;
    else acc.fail++;
    return acc;
  }, { total: 0, pass: 0, fail: 0 });

  const prompt = `
    As a senior logistics analyst, analyze this delivery KPI data:
    - Total Deliveries: ${summary.total}
    - KPI Pass: ${summary.pass}
    - KPI Fail: ${summary.fail}
    - Fail Rate: ${((summary.fail / summary.total) * 100).toFixed(2)}%

    Context: Our KPI counts working days only (excluding Sundays/Holidays). 
    If a delivery fails, a reason must be submitted.

    Provide a short, professional analysis (2-3 paragraphs) on the logistics health and potential bottlenecks.
    Keep it strictly business-oriented.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("AI Insight Error:", error);
    return "Unable to generate AI insights at this time.";
  }
};

export const analyzeDelayPatterns = async (failedDeliveries: DeliveryRecord[]) => {
  const prompt = `
    Analyze these ${failedDeliveries.length} failed logistics deliveries. 
    Common failure reasons include: ${failedDeliveries.map(d => d.delayReason || 'Unspecified').slice(0, 5).join(', ')}.
    
    Predict 3 key risks for the next week and suggest 2 operational improvements.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("AI Pattern Analysis Error:", error);
    return "Operational analysis currently unavailable.";
  }
};
