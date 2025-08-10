import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    console.log('Checking what\'s in batch 7');
    
    // Load mapping.json
    const mappingPath = path.join(process.cwd(), 'mapping.json');
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    
    // Collect all SKUs (simple and bundle components)
    const skus = new Set<string>();
    for (const product of mapping.products) {
      if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
        }
      }
    }
    
    const skuArray = Array.from(skus);
    const batchSize = 25; // Same as CSV export
    const batches = [];
    for (let i = 0; i < skuArray.length; i += batchSize) {
      batches.push(skuArray.slice(i, i + batchSize));
    }
    
    // Get batch 7 (index 6)
    const batch7 = batches[6];
    
    return NextResponse.json({
      success: true,
      totalSkus: skuArray.length,
      totalBatches: batches.length,
      batchSize: batchSize,
      batch7Index: 6,
      batch7Size: batch7 ? batch7.length : 0,
      batch7Skus: batch7 || [],
      firstFewSkusInBatch7: batch7 ? batch7.slice(0, 10) : null,
      lastFewSkusInBatch7: batch7 ? batch7.slice(-10) : null
    });
    
  } catch (error) {
    console.error('Error:', error);
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack
    }, { status: 500 });
  }
} 