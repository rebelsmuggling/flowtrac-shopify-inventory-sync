import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { updateAmazonInventory } from '../../../../services/amazon';

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

    // 5. Process each product and update Amazon
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
      updates: [] as any[]
    };
    
    for (const [sku, quantity] of Object.entries(amazonInventory)) {
      const product = mapping.products.find((p: any) => p.amazon_sku === sku);
      results.total++;
      
      try {
        if (quantity > 0) {
          const amazonResult = await updateAmazonInventory(sku, quantity);
          
          if (amazonResult.success) {
            results.successful++;
            results.updates.push({
              sku: sku,
              flowtrac_sku: product?.flowtrac_sku,
              quantity: quantity,
              type: product?.bundle_components ? 'Bundle' : 'Simple',
              feedId: amazonResult.feedId
            });
            
            console.log(`✅ Amazon update successful: ${sku} = ${quantity} (Feed ID: ${amazonResult.feedId})`);
          } else {
            results.failed++;
            const errorMessage = `Failed to update ${sku}: ${'error' in amazonResult ? amazonResult.error : 'Unknown error'}`;
            results.errors.push(errorMessage);
            console.error(`❌ ${errorMessage}`);
          }
        } else {
          results.skipped++;
          console.log(`⚠️ Skipping ${sku} - no inventory available`);
        }
        
      } catch (error) {
        results.failed++;
        const errorMessage = `Failed to update ${sku}: ${(error as Error).message}`;
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
        skipped: results.skipped,
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
