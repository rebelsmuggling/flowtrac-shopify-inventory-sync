import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing small sample of SKUs...');
    
    // Load mapping (try imported mapping first, then fallback to file)
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Using imported mapping data for test');
      mapping = importedMapping;
    } else {
      // Try to load from mapping API first
      try {
        const mappingRes = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/mapping`);
        if (mappingRes.ok) {
          const mappingData = await mappingRes.json();
          if (mappingData.success) {
            console.log('Using mapping API data for test');
            mapping = mappingData.mapping;
          }
        }
      } catch (apiError) {
        console.log('Mapping API not available, falling back to file');
      }
      
      // Fallback to file system
      if (!mapping) {
        const mappingPath = path.join(process.cwd(), 'mapping.json');
        console.log('Using file mapping data for test');
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
    
    // Get a small sample of SKUs (first 10 from mapping)
    const skus = new Set<string>();
    for (const product of mapping.products.slice(0, 10)) {
      if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components.slice(0, 2)) {
          if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
        }
      }
    }
    
    const skuArray = Array.from(skus);
    console.log(`Testing with ${skuArray.length} SKUs:`, skuArray);
    
    // Test Flowtrac connection
    let flowtracInventory: Record<string, any> = {};
    let skuProcessingResults: Record<string, { success: boolean, error?: string }> = {};
    let successfulSkus = 0;
    let failedSkus = 0;
    
    try {
      const { fetchFlowtracInventoryWithBins } = await import('../../../../services/flowtrac');
      console.log('Successfully imported fetchFlowtracInventoryWithBins');
      
      // Test each SKU individually with detailed logging
      for (const sku of skuArray) {
        console.log(`\n--- Testing SKU: ${sku} ---`);
        
        try {
          const startTime = Date.now();
          const skuInventory = await fetchFlowtracInventoryWithBins([sku]);
          const endTime = Date.now();
          
          Object.assign(flowtracInventory, skuInventory);
          skuProcessingResults[sku] = { success: true };
          successfulSkus++;
          
          console.log(`✓ Successfully processed SKU ${sku} in ${endTime - startTime}ms`);
          console.log(`  Inventory data:`, skuInventory[sku]);
          
        } catch (skuError) {
          console.error(`✗ Failed to fetch SKU ${sku}:`, (skuError as Error).message);
          skuProcessingResults[sku] = { 
            success: false, 
            error: (skuError as Error).message 
          };
          failedSkus++;
          
          // Try one retry with delay
          try {
            console.log(`  Retrying SKU ${sku}...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            const retryInventory = await fetchFlowtracInventoryWithBins([sku]);
            Object.assign(flowtracInventory, retryInventory);
            skuProcessingResults[sku] = { success: true };
            successfulSkus++;
            failedSkus--; // Adjust counts
            console.log(`✓ Retry successful for SKU ${sku}`);
          } catch (retryError) {
            console.error(`✗ Retry also failed for SKU ${sku}:`, (retryError as Error).message);
            skuProcessingResults[sku] = { 
              success: false, 
              error: `Retry failed: ${(retryError as Error).message}` 
            };
          }
        }
        
        // Small delay between SKUs
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error('Flowtrac service import failed:', error);
      return NextResponse.json({
        error: 'Failed to import Flowtrac service',
        details: (error as Error).message
      });
    }
    
    return NextResponse.json({
      success: true,
      test_skus: skuArray,
      results: {
        total: skuArray.length,
        successful: successfulSkus,
        failed: failedSkus,
        success_rate: `${((successfulSkus / skuArray.length) * 100).toFixed(1)}%`
      },
      sku_results: skuProcessingResults,
      inventory_sample: flowtracInventory,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_URL: process.env.VERCEL_URL || 'localhost'
      }
    });
    
  } catch (error) {
    console.error('Test failed:', error);
    
    return NextResponse.json({
      error: (error as Error).message,
      stack: (error as Error).stack?.split('\n').slice(0, 5)
    }, { status: 500 });
  }
} 