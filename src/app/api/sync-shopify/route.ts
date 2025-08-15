import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { updateShopifyInventory, updateShopifyInventoryBulk, enrichMappingWithShopifyVariantAndInventoryIds } from '../../../../services/shopify';

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
    
    // 5. Build shopifyInventory map (simple and bundle SKUs) - same logic as main sync
    const shopifyInventory: Record<string, number> = {};
    for (const product of updatedMapping.products) {
      if (Array.isArray(product.bundle_components) && product.shopify_sku) {
        const quantities = product.bundle_components.map((comp: any) => {
          const available = flowtracInventory[comp.flowtrac_sku]?.quantity || 0;
          return Math.floor(available / comp.quantity);
        });
        shopifyInventory[product.shopify_sku] = quantities.length > 0 ? Math.min(...quantities) : 0;
      } else if (product.shopify_sku && product.flowtrac_sku) {
        shopifyInventory[product.shopify_sku] = flowtracInventory[product.flowtrac_sku]?.quantity || 0;
      }
    }

    // 6. Prepare Shopify bulk updates
    const shopifyUpdates: Array<{ inventoryItemId: string; quantity: number; sku: string }> = [];
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
    
    // Collect all Shopify updates
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
      const inventoryItemId = product?.shopify_inventory_item_id;
      results.total++;
      
      if (!inventoryItemId) {
        results.failed++;
        const errorMessage = `No shopify_inventory_item_id for SKU ${sku}`;
        results.errors.push(errorMessage);
        console.error(`❌ ${errorMessage}`);
      } else if (quantity > 0) {
        shopifyUpdates.push({ inventoryItemId, quantity, sku });
      } else {
        results.skipped++;
        console.log(`⚠️ Skipping ${sku} - no inventory available`);
      }
    }
    
    // 7. Bulk Shopify sync
    if (shopifyUpdates.length > 0) {
      try {
        console.log(`Starting bulk Shopify update for ${shopifyUpdates.length} items...`);
        const bulkResult = await updateShopifyInventoryBulk(shopifyUpdates);
        console.log(`Bulk Shopify update completed: ${bulkResult.success} successful, ${bulkResult.failed} failed`);
        
        // Mark successful updates
        results.successful = bulkResult.success;
        results.failed += bulkResult.failed;
        
        // Add successful updates to results
        for (const update of shopifyUpdates) {
          const product = updatedMapping.products.find((p: any) => p.shopify_sku === update.sku);
          results.updates.push({
            sku: update.sku,
            flowtrac_sku: product?.flowtrac_sku,
            quantity: update.quantity,
            previousQuantity: null, // We don't have previous quantities in bulk mode
            quantityChanged: null,
            type: product?.bundle_components ? 'Bundle' : 'Simple',
            processingTime: 0, // Bulk processing time is not per-item
            timestamp: new Date().toISOString()
          });
        }
        
        // Log any errors
        if (bulkResult.errors.length > 0) {
          console.error('Shopify bulk update errors:', bulkResult.errors);
          results.errors.push(...bulkResult.errors);
        }
        
      } catch (err: any) {
        console.error('Bulk Shopify update failed:', err.message);
        results.failed = shopifyUpdates.length;
        results.errors.push(`Bulk update failed: ${err.message}`);
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
