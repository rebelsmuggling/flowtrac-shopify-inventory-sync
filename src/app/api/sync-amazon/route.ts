import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { updateAmazonInventory } from '../../../../services/amazon';
import { fetchFlowtracInventoryWithBins } from '../../../../services/flowtrac';

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon-only sync started');
    
    // 1. Load mapping
    const { mapping } = await mappingService.getMappingFresh();
    
    // 2. Get all SKUs that have Amazon SKUs
    const amazonSkus = mapping.products
      .filter(product => product.amazon_sku && product.flowtrac_sku)
      .map(product => product.flowtrac_sku!)
      .filter((sku): sku is string => Boolean(sku));
    
    console.log(`Found ${amazonSkus.length} products with Amazon SKUs`);
    
    // 3. Fetch Flowtrac inventory for these SKUs
    const flowtracInventory = await fetchFlowtracInventoryWithBins(amazonSkus);
    
    // 4. Process each product and update Amazon
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[],
      updates: [] as any[]
    };
    
    for (const product of mapping.products) {
      if (!product.amazon_sku) continue; // Skip products without Amazon SKU
      
      results.total++;
      let calculatedQuantity = 0;
      
      try {
        if (Array.isArray(product.bundle_components) && product.bundle_components.length > 0) {
          // Bundle product - calculate quantity from components
          let minBundleQuantity = Infinity;
          for (const component of product.bundle_components) {
            const componentInventory = flowtracInventory[component.flowtrac_sku];
            if (componentInventory && componentInventory.quantity !== undefined) {
              const possibleBundles = Math.floor(componentInventory.quantity / component.quantity);
              minBundleQuantity = Math.min(minBundleQuantity, possibleBundles);
            } else {
              minBundleQuantity = 0;
              break;
            }
          }
          calculatedQuantity = minBundleQuantity === Infinity ? 0 : minBundleQuantity;
        } else if (product.flowtrac_sku) {
          // Simple product - use Flowtrac quantity directly
          const simpleInventory = flowtracInventory[product.flowtrac_sku];
          if (simpleInventory && simpleInventory.quantity !== undefined) {
            calculatedQuantity = simpleInventory.quantity;
          }
        }
        
        // Update Amazon if we have a quantity
        if (calculatedQuantity > 0) {
          const amazonResult = await updateAmazonInventory(product.amazon_sku!, calculatedQuantity);
          
          if (amazonResult.success) {
            results.successful++;
            results.updates.push({
              sku: product.amazon_sku,
              flowtrac_sku: product.flowtrac_sku,
              quantity: calculatedQuantity,
              type: product.bundle_components ? 'Bundle' : 'Simple',
              feedId: amazonResult.feedId
            });
            
            console.log(`✅ Amazon update successful: ${product.amazon_sku} = ${calculatedQuantity} (Feed ID: ${amazonResult.feedId})`);
          } else {
            results.failed++;
            const errorMessage = `Failed to update ${product.amazon_sku}: ${'error' in amazonResult ? amazonResult.error : 'Unknown error'}`;
            results.errors.push(errorMessage);
            console.error(`❌ ${errorMessage}`);
          }
        } else {
          console.log(`⚠️ Skipping ${product.amazon_sku} - no inventory available`);
        }
        
      } catch (error) {
        results.failed++;
        const errorMessage = `Failed to update ${product.amazon_sku}: ${(error as Error).message}`;
        results.errors.push(errorMessage);
        console.error(`❌ ${errorMessage}`);
      }
    }
    
    console.log(`Amazon sync completed: ${results.successful}/${results.total} successful`);
    
    return NextResponse.json({
      success: true,
      message: `Amazon sync completed: ${results.successful}/${results.total} products updated successfully`,
      results: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        successRate: Math.round((results.successful / results.total) * 100),
        errors: results.errors,
        updates: results.updates
      }
    });
    
  } catch (error) {
    console.error('Amazon sync failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
