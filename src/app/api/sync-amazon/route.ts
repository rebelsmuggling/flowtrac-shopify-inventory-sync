import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { updateAmazonInventoryBulk } from '../../../../services/amazon';

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon-only sync started');
    
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
    
    // 4. Build amazonInventory map (simple and bundle SKUs) - same logic as main sync
    const amazonInventory: Record<string, number> = {};
    for (const product of mapping.products) {
      if (Array.isArray(product.bundle_components) && product.amazon_sku) {
        const quantities = product.bundle_components.map((comp: any) => {
          const available = flowtracInventory[comp.flowtrac_sku]?.quantity || 0;
          return Math.floor(available / comp.quantity);
        });
        amazonInventory[product.amazon_sku] = quantities.length > 0 ? Math.min(...quantities) : 0;
      } else if (product.amazon_sku && product.flowtrac_sku) {
        amazonInventory[product.amazon_sku] = flowtracInventory[product.flowtrac_sku]?.quantity || 0;
      }
    }

    // 5. Prepare bulk update data
    const bulkUpdates = Object.entries(amazonInventory).map(([sku, quantity]) => ({
      sku,
      quantity
    }));

    console.log(`Preparing bulk Amazon update for ${bulkUpdates.length} SKUs`);

    // 6. Submit all SKUs in a single bulk update
    const results = {
      total: bulkUpdates.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
      updates: [] as any[],
      bulkResult: null as any
    };
    
    try {
      const bulkResult = await updateAmazonInventoryBulk(bulkUpdates);
      results.bulkResult = bulkResult;
      
      if (bulkResult.success) {
        results.successful = bulkUpdates.length;
        console.log(`✅ Bulk Amazon update successful for ${bulkUpdates.length} SKUs (Feed ID: ${bulkResult.feedId})`);
        
        // Add individual update records for tracking
        for (const update of bulkUpdates) {
          const product = mapping.products.find((p: any) => p.amazon_sku === update.sku);
          results.updates.push({
            sku: update.sku,
            flowtrac_sku: product?.flowtrac_sku,
            quantity: update.quantity,
            type: product?.bundle_components ? 'Bundle' : 'Simple',
            feedId: bulkResult.feedId,
            method: 'bulk_update'
          });
        }
      } else {
        // Bulk failed, check if individual fallback was attempted
        if (bulkResult.results) {
          console.log(`⚠️ Bulk update failed, individual fallback results: ${bulkResult.results.length} items`);
          for (const result of bulkResult.results) {
            if (result.success) {
              results.successful++;
              const product = mapping.products.find((p: any) => p.amazon_sku === result.sku);
              results.updates.push({
                sku: result.sku,
                flowtrac_sku: product?.flowtrac_sku,
                quantity: bulkUpdates.find(u => u.sku === result.sku)?.quantity,
                type: product?.bundle_components ? 'Bundle' : 'Simple',
                feedId: result.feedId,
                method: 'individual_fallback'
              });
            } else {
              results.failed++;
              const errorMessage = `Failed to update ${result.sku}: ${'error' in result ? result.error : 'Unknown error'}`;
              results.errors.push(errorMessage);
            }
          }
        } else {
          results.failed = bulkUpdates.length;
          results.errors.push(`Bulk update failed: ${bulkResult.error}`);
        }
      }
      
    } catch (error) {
      results.failed = bulkUpdates.length;
      const errorMessage = `Bulk Amazon update failed: ${(error as Error).message}`;
      results.errors.push(errorMessage);
      console.error(`❌ ${errorMessage}`);
    }
    
    console.log(`Amazon sync completed: ${results.successful}/${results.total} successful`);
    
    return NextResponse.json({
      success: true,
      message: `Amazon sync completed: ${results.successful}/${results.total} successful`,
      results: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors,
        updates: results.updates,
        bulkResult: results.bulkResult
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
