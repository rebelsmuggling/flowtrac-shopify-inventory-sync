import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { updateShopifyInventory } from '../../../../services/shopify';
import { fetchFlowtracInventoryWithBins } from '../../../../services/flowtrac';

export async function POST(request: NextRequest) {
  try {
    console.log('Shopify-only sync started');
    
    // 1. Load mapping
    const { mapping } = await mappingService.getMappingFresh();
    
    // 2. Get all SKUs that have Shopify SKUs
    const shopifySkus = mapping.products
      .filter(product => product.shopify_sku && product.flowtrac_sku)
      .map(product => product.flowtrac_sku!)
      .filter((sku): sku is string => Boolean(sku));
    
    console.log(`Found ${shopifySkus.length} products with Shopify SKUs`);
    
    // 3. Fetch Flowtrac inventory for these SKUs
    const flowtracInventory = await fetchFlowtracInventoryWithBins(shopifySkus);
    
    // 4. Process each product and update Shopify
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[],
      updates: [] as any[]
    };
    
    for (const product of mapping.products) {
      if (!product.shopify_sku) continue; // Skip products without Shopify SKU
      
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
        
        // Update Shopify if we have a quantity
        if (calculatedQuantity > 0) {
          await updateShopifyInventory(product.shopify_sku!, calculatedQuantity);
          
          results.successful++;
          results.updates.push({
            sku: product.shopify_sku,
            flowtrac_sku: product.flowtrac_sku,
            quantity: calculatedQuantity,
            type: product.bundle_components ? 'Bundle' : 'Simple'
          });
          
          console.log(`✅ Shopify update successful: ${product.shopify_sku} = ${calculatedQuantity}`);
        } else {
          console.log(`⚠️ Skipping ${product.shopify_sku} - no inventory available`);
        }
        
      } catch (error) {
        results.failed++;
        const errorMessage = `Failed to update ${product.shopify_sku}: ${(error as Error).message}`;
        results.errors.push(errorMessage);
        console.error(`❌ ${errorMessage}`);
      }
    }
    
    console.log(`Shopify sync completed: ${results.successful}/${results.total} successful`);
    
    return NextResponse.json({
      success: true,
      message: `Shopify sync completed: ${results.successful}/${results.total} products updated successfully`,
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
    console.error('Shopify sync failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
