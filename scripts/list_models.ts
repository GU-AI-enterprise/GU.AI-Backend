import * as dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

async function run() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log("Available models:");
  if (data.models) {
    data.models.filter((m: any) => m.supportedGenerationMethods.includes('generateContent')).forEach((m: any) => {
        console.log(m.name, m.version);
    });
  } else {
    console.log(data);
  }
}

run();
