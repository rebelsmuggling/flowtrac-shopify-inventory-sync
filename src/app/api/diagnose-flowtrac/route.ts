import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    console.log('Diagnosing Flowtrac data fetching...');
    
    // Load mapping (try imported mapping first, then fallback to file)
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Using imported mapping data for diagnosis');
      mapping = importedMapping;
    } else {
      // Try to load from mapping API first
      try {
        const mappingRes = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/mapping`);
        if (mappingRes.ok) {
          const mappingData = await mappingRes.json();
          if (mappingData.success) {
            console.log('Using mapping API data for diagnosis');
            mapping = mappingData.mapping;
          }
        }
      } catch (apiError) {
        console.log('Mapping API not available, falling back to file');
      }
      
      // Fallback to file system
      if (!mapping) {
        const mappingPath = path.join(process.cwd(), 'mapping.json');
        console.log('Using file mapping data for diagnosis');
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
    
    // Collect a small sample of SKUs for testing
    const skus = new Set<string>();
    for (const product of mapping.products.slice(0, 5)) { // Just first 5 products
      if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components.slice(0, 2)) { // Just first 2 components
          if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
        }
      }
    }
    
    const skuArray = Array.from(skus);
    console.log(`Testing with ${skuArray.length} SKUs:`, skuArray);
    
    // Test Flowtrac connection
    let flowtracInventory = {};
    let flowtracError = null;
    
    try {
      const { fetchFlowtracInventoryWithBins } = await import('../../../../services/flowtrac');
      console.log('Successfully imported fetchFlowtracInventoryWithBins');
      
      flowtracInventory = await fetchFlowtracInventoryWithBins(skuArray);
      console.log('Flowtrac inventory fetch result:', flowtracInventory);
      
    } catch (error) {
      flowtracError = {
        message: (error as Error).message,
        stack: (error as Error).stack?.split('\n').slice(0, 5)
      };
      console.error('Flowtrac inventory fetch failed:', flowtracError);
    }
    
    // Check what's in the inventory object
    const inventoryKeys = Object.keys(flowtracInventory);
    const inventorySample = {};
    for (const key of inventoryKeys.slice(0, 3)) {
      inventorySample[key] = flowtracInventory[key];
    }
    
    return NextResponse.json({
      success: !flowtracError,
      flowtrac_credentials: hasFlowtracCredentials,
      test_skus: skuArray,
      inventory_keys_count: inventoryKeys.length,
      inventory_keys: inventoryKeys,
      inventory_sample: inventorySample,
      error: flowtracError,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_URL: process.env.VERCEL_URL || 'localhost'
      }
    });
    
  } catch (error) {
    console.error('Diagnosis failed:', error);
    
    return NextResponse.json({
      error: (error as Error).message,
      stack: (error as Error).stack?.split('\n').slice(0, 5)
    }, { status: 500 });
  }
} 