import * as dotenv from 'dotenv';
dotenv.config();

import { generateEcommerceExport } from './src/services/ecommerce.service';
import * as fs from 'fs';

async function test() {
  try {
    const url = "https://wpjzitfkswsgpefcszof.supabase.co/storage/v1/object/public/assets/3d87a920-e793-4b50-8787-8e9e3b91fee7/1782656146492_tryon_1782656144421.png";
    console.log("Testing export for:", url);
    const zipBuffer = await generateEcommerceExport(url);
    fs.writeFileSync('test_export2.zip', zipBuffer);
    console.log("Success! Saved test_export2.zip");
  } catch (e: any) {
    console.error("Test failed:", e.message);
    console.error(e.stack);
  }
}

test();
