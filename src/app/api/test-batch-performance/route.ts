import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const batchSize = parseInt(url.searchParams.get('batchSize') || '50');
    
    console.log(`Testing batch performance with ${batchSize} SKUs...`);
    
    // Load mapping (try imported mapping first, then fallback to file)
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Using imported mapping data for batch test');
      mapping = importedMapping;
    } else {
      // Try to load from mapping API first
      try {
        const mappingRes = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/mapping`);
        if (mappingRes.ok) {
          const mappingData = await mappingRes.json();
          if (mappingData.success) {
            console.log('Using mapping API data for batch test');
            mapping = mappingData.mapping;
          }
        }
      } catch (apiError) {
        console.log('Mapping API not available, falling back to file');
      }
      
      // Fallback to file system
      if (!mapping) {
        const mappingPath = path.join(process.cwd(), 'mapping.json');
        console.log('Using file mapping data for batch test');
        mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
      }
    }
    
    if (!mapping) {
      return NextResponse.json({ error: 'No mapping data available' }, { status: 500 });
    }
    
    // Check Flowtrac credentials
    const hasFlowtracCredentials = process.env.FLOWTRAC_API_URL && process.env.FLOWTRAC_BADGE && process.env.FLOWTRAC_PIN;
    
    if (!hasFlowtracCredentials) {
      return NextResponse.json({
        error: 'Flowtrac credentials not configured',
        details: {
          FLOWTRAC_API_URL: !!process.env.FLOWTRAC_API_URL,
          FLOWTRAC_BADGE: !!process.env.FLOWTRAC_BADGE,
          FLOWTRAC_PIN: !!process.env.FLOWTRAC_PIN
        }
      });
    }
    
    // Get SKUs for testing
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
    const testSkus = skuArray.slice(0, batchSize);
    
    console.log(`Testing with ${testSkus.length} SKUs:`, testSkus.slice(0, 5), '...');
    
    // Test batch performance
    let flowtracInventory: Record<string, any> = {};
    let skuProcessingResults: Record<string, { success: boolean, error?: string, duration?: number }> = {};
    let successfulSkus = 0;
    let failedSkus = 0;
    let totalDuration = 0;
    
    try {
      const { fetchFlowtracInventoryWithBins } = await import('../../../../services/flowtrac');
      console.log('Successfully imported fetchFlowtracInventoryWithBins');
      
      const startTime = Date.now();
      
      // Test batch processing to find Flowtrac timeout limits
      console.log(`Testing batch of ${testSkus.length} SKUs for Flowtrac timeout...`);
      
      let batchError: Error | null = null;
      
      try {
        // Test the entire batch as one request (like the original CSV export)
        const batchStartTime = Date.now();
        const batchInventory = await fetchFlowtracInventoryWithBins(testSkus);
        const batchEndTime = Date.now();
        const batchDuration = batchEndTime - batchStartTime;
        
        Object.assign(flowtracInventory, batchInventory);
        
        // Count successful vs failed SKUs in the batch
        for (const sku of testSkus) {
          if (batchInventory[sku] && batchInventory[sku].quantity !== undefined) {
            skuProcessingResults[sku] = { 
              success: true, 
              duration: batchDuration / testSkus.length // Average time per SKU
            };
            successfulSkus++;
          } else {
            skuProcessingResults[sku] = { 
              success: false, 
              error: 'SKU not found in batch response',
              duration: batchDuration / testSkus.length
            };
            failedSkus++;
          }
        }
        
        totalDuration = batchDuration;
        console.log(`✓ Batch of ${testSkus.length} SKUs completed in ${batchDuration}ms`);
        
      } catch (error) {
        batchError = error as Error;
        console.error(`✗ Batch of ${testSkus.length} SKUs failed:`, batchError.message);
        
        // If batch fails, mark all SKUs as failed
        for (const sku of testSkus) {
          skuProcessingResults[sku] = { 
            success: false, 
            error: `Batch failed: ${batchError.message}`,
            duration: 0
          };
          failedSkus++;
        }
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Calculate performance metrics
      const avgTimePerSku = totalDuration / testSkus.length;
      const estimatedTimeFor100 = avgTimePerSku * 100;
      const estimatedTimeFor150 = avgTimePerSku * 150;
      const estimatedTimeFor200 = avgTimePerSku * 200;
      
      return NextResponse.json({
        success: true,
        batch_size: batchSize,
        performance: {
          total_time_ms: totalTime,
          total_time_seconds: (totalTime / 1000).toFixed(1),
          avg_time_per_sku_ms: avgTimePerSku.toFixed(1),
          estimated_100_skus_seconds: (estimatedTimeFor100 / 1000).toFixed(1),
          estimated_150_skus_seconds: (estimatedTimeFor150 / 1000).toFixed(1),
          estimated_200_skus_seconds: (estimatedTimeFor200 / 1000).toFixed(1),
          within_5_minute_limit: estimatedTimeFor150 < 300000 // 5 minutes = 300,000ms
        },
        results: {
          total: testSkus.length,
          successful: successfulSkus,
          failed: failedSkus,
          success_rate: `${((successfulSkus / testSkus.length) * 100).toFixed(1)}%`
        },
        sku_results: skuProcessingResults,
        recommendations: {
          recommended_batch_size: successfulSkus > 0 ? testSkus.length : Math.floor(testSkus.length * 0.8),
          safe_batch_size: Math.floor(testSkus.length * 0.8),
          flowtrac_timeout_detected: failedSkus === testSkus.length && batchError?.message?.includes('timeout'),
          notes: successfulSkus > 0 ? 
            `Batch of ${testSkus.length} SKUs succeeded - can try larger batches` :
            `Batch of ${testSkus.length} SKUs failed - try smaller batches`
        }
      });
      
    } catch (error) {
      console.error('Flowtrac service import failed:', error);
      return NextResponse.json({
        error: 'Failed to import Flowtrac service',
        details: (error as Error).message
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    
    return NextResponse.json({
      error: (error as Error).message,
      stack: (error as Error).stack?.split('\n').slice(0, 5)
    }, { status: 500 });
  }
} 