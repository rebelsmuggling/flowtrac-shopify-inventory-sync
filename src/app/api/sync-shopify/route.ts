import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { updateShopifyInventory, enrichMappingWithShopifyVariantAndInventoryIds } from '../../../../services/shopify';

// Helper function to get current Shopify inventory for verification
async function getShopifyInventoryLevel(sku: string): Promise<number | null> {
  try {
    // This would need to be implemented in the Shopify service
    // For now, we'll return null and add this functionality later
    return null;
  } catch (error) {
    console.error(`Failed to get Shopify inventory for ${sku}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('Shopify-only sync started');
    
    // 1. Load mapping
    const { mapping } = await mappingService.getMappingFresh();
    
    // 2. Collect all SKUs (simple and bundle components)
    const skus = await mappingService.getMappedSkus();
    
    // 3. Fetch inventory data from database (instead of Flowtrac directly)
    const { getFlowtracInventory } = await import('../../../lib/database');
    const inventoryResult = await getFlowtracInventory(Array.from(skus), 'Manteca');
    
    if (!inventoryResult.success) {
      throw new Error(`Failed to get inventory from database: ${inventoryResult.error}`);
    }
    
    // Convert database records to the expected format
    const flowtracInventory: Record<string, { quantity: number, bins: string[] }> = {};
    if (inventoryResult.data) {
      for (const record of inventoryResult.data) {
        flowtracInventory[record.sku] = {
          quantity: record.quantity,
          bins: record.bins || []
        };
      }
    }
    
    console.log('Fetched inventory from database', { 
      recordsFound: inventoryResult.data?.length || 0,
      totalSkus: Array.from(skus).length 
    });

    // 4. Self-heal: Enrich mapping with missing Shopify variant and inventory item IDs
    await enrichMappingWithShopifyVariantAndInventoryIds();
    
    // Reload mapping after enrichment using the mapping service (fresh data, no cache)
    const { mapping: updatedMapping } = await mappingService.getMappingFresh();
    
    // 5. Process each product and update Shopify
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
      updates: [] as any[],
      summary: {
        startTime: new Date().toISOString(),
        endTime: null as string | null,
        totalProcessingTime: 0,
        averageTimePerProduct: 0,
        productsWithChanges: 0,
        productsUnchanged: 0
      }
    };
    
    const startTime = Date.now();
    
    for (const product of updatedMapping.products) {
      if (!product.shopify_sku) continue; // Skip products without Shopify SKU
      
      results.total++;
      const productStartTime = Date.now();
      let calculatedQuantity = 0;
      let previousQuantity: number | null = null;
      
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
          // Get previous quantity for comparison (if available)
          try {
            previousQuantity = await getShopifyInventoryLevel(product.shopify_sku!);
          } catch (error) {
            console.log(`⚠️ Could not get previous inventory for ${product.shopify_sku}:`, (error as Error).message);
          }
          
          // Check if we have the required inventory item ID
          const inventoryItemId = product.shopify_inventory_item_id;
          if (!inventoryItemId) {
            results.failed++;
            const errorMessage = `No shopify_inventory_item_id for SKU ${product.shopify_sku}`;
            results.errors.push(errorMessage);
            console.error(`❌ ${errorMessage}`);
            continue;
          }
          
          // Update Shopify inventory using inventory item ID
          await updateShopifyInventory(inventoryItemId, calculatedQuantity);
          
          const productProcessingTime = Date.now() - productStartTime;
          
          results.successful++;
          results.updates.push({
            sku: product.shopify_sku,
            flowtrac_sku: product.flowtrac_sku,
            quantity: calculatedQuantity,
            previousQuantity: previousQuantity,
            quantityChanged: previousQuantity !== null ? previousQuantity !== calculatedQuantity : null,
            type: product.bundle_components ? 'Bundle' : 'Simple',
            processingTime: productProcessingTime,
            timestamp: new Date().toISOString()
          });
          
          if (previousQuantity !== null && previousQuantity !== calculatedQuantity) {
            results.summary.productsWithChanges++;
            console.log(`✅ Shopify update successful: ${product.shopify_sku} = ${previousQuantity} → ${calculatedQuantity} (${productProcessingTime}ms)`);
          } else if (previousQuantity !== null) {
            results.summary.productsUnchanged++;
            console.log(`✅ Shopify update successful: ${product.shopify_sku} = ${calculatedQuantity} (unchanged, ${productProcessingTime}ms)`);
          } else {
            console.log(`✅ Shopify update successful: ${product.shopify_sku} = ${calculatedQuantity} (${productProcessingTime}ms)`);
          }
        } else {
          results.skipped++;
          console.log(`⚠️ Skipping ${product.shopify_sku} - no inventory available`);
        }
        
      } catch (error) {
        results.failed++;
        const errorMessage = `Failed to update ${product.shopify_sku}: ${(error as Error).message}`;
        results.errors.push(errorMessage);
        console.error(`❌ ${errorMessage}`);
      }
    }
    
    const endTime = Date.now();
    const totalProcessingTime = endTime - startTime;
    
    // Calculate final summary
    results.summary.endTime = new Date().toISOString();
    results.summary.totalProcessingTime = totalProcessingTime;
    results.summary.averageTimePerProduct = results.total > 0 ? Math.round(totalProcessingTime / results.total) : 0;
    
    console.log(`Shopify sync completed: ${results.successful}/${results.total} successful in ${totalProcessingTime}ms`);
    console.log(`Summary: ${results.summary.productsWithChanges} changed, ${results.summary.productsUnchanged} unchanged, ${results.skipped} skipped`);
    
    return NextResponse.json({
      success: true,
      message: `Shopify sync completed: ${results.successful}/${results.total} products updated successfully`,
      results: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        skipped: results.skipped,
        successRate: Math.round((results.successful / results.total) * 100),
        errors: results.errors,
        updates: results.updates,
        summary: results.summary,
        inventoryChanges: {
          productsWithChanges: results.summary.productsWithChanges,
          productsUnchanged: results.summary.productsUnchanged,
          changePercentage: results.summary.productsWithChanges > 0 ? 
            Math.round((results.summary.productsWithChanges / results.successful) * 100) : 0
        }
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
