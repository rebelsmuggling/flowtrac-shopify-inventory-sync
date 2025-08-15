import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { updateShipStationWarehouseLocation } from '../../../../services/shipstation';

export async function POST(request: NextRequest) {
  try {
    console.log('ShipStation-only sync started');
    
    // 1. Load mapping
    const { mapping } = await mappingService.getMappingFresh();
    
    // 2. Collect all SKUs (simple and bundle components)
    const skus = await mappingService.getMappedSkus();
    
    // 3. Fetch inventory data from database (includes bin information)
    const { getFlowtracInventory } = await import('../../../lib/database');
    const inventoryResult = await getFlowtracInventory(Array.from(skus), 'Manteca');
    
    if (!inventoryResult.success) {
      throw new Error(`Failed to get inventory from database: ${inventoryResult.error}`);
    }
    
    // Convert database records to the expected format
    const flowtracInventory: Record<string, { quantity: number, bins: string[], bin_breakdown?: Record<string, number> }> = {};
    if (inventoryResult.data) {
      for (const record of inventoryResult.data) {
        flowtracInventory[record.sku] = {
          quantity: record.quantity,
          bins: record.bins || [],
          bin_breakdown: record.bin_breakdown
        };
      }
    }
    
    console.log('Fetched inventory from database', { 
      recordsFound: inventoryResult.data?.length || 0,
      totalSkus: Array.from(skus).length 
    });
    
    // 4. Build ShipStation updates based on Flowtrac SKUs and bin locations
    const shipstationUpdates: Array<{ flowtracSku: string, binLocation: string, productType: string, shopifySku?: string }> = [];
    
    for (const product of mapping.products) {
      if (product.flowtrac_sku) {
        // Simple product - use Flowtrac SKU and its bin location
        const inventory = flowtracInventory[product.flowtrac_sku];
        if (inventory && inventory.bins && inventory.bins.length > 0) {
          // Use the first bin as the primary location
          const primaryBin = inventory.bins[0];
          shipstationUpdates.push({
            flowtracSku: product.flowtrac_sku,
            binLocation: primaryBin,
            productType: 'Simple',
            shopifySku: product.shopify_sku
          });
        } else if (inventory && inventory.quantity > 0) {
          // Has inventory but no specific bins, use default location
          shipstationUpdates.push({
            flowtracSku: product.flowtrac_sku,
            binLocation: 'Manteca',
            productType: 'Simple',
            shopifySku: product.shopify_sku
          });
        }
      }
      
      if (Array.isArray(product.bundle_components)) {
        // Bundle product - check each component's bin location
        for (const component of product.bundle_components) {
          const inventory = flowtracInventory[component.flowtrac_sku];
          if (inventory && inventory.bins && inventory.bins.length > 0) {
            // Use the first bin as the primary location
            const primaryBin = inventory.bins[0];
            shipstationUpdates.push({
              flowtracSku: component.flowtrac_sku,
              binLocation: primaryBin,
              productType: 'Bundle Component',
              shopifySku: product.shopify_sku
            });
          } else if (inventory && inventory.quantity > 0) {
            // Has inventory but no specific bins, use default location
            shipstationUpdates.push({
              flowtracSku: component.flowtrac_sku,
              binLocation: 'Manteca',
              productType: 'Bundle Component',
              shopifySku: product.shopify_sku
            });
          }
        }
      }
    }
    
    console.log(`Prepared ${shipstationUpdates.length} ShipStation updates based on Flowtrac bin locations`);
    
    // 5. Update ShipStation warehouse locations for each Flowtrac SKU
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[],
      updates: [] as any[]
    };
    
    for (const update of shipstationUpdates) {
      results.total++;
      
      try {
        // Use Flowtrac SKU to update ShipStation (not Shopify SKU)
        await updateShipStationWarehouseLocation(update.flowtracSku, update.binLocation);
        
        results.successful++;
        results.updates.push({
          flowtrac_sku: update.flowtracSku,
          shopify_sku: update.shopifySku,
          bin_location: update.binLocation,
          type: update.productType
        });
        
        console.log(`✅ ShipStation update successful: ${update.flowtracSku} → ${update.binLocation} (${update.productType})`);
        
      } catch (error) {
        results.failed++;
        const errorMessage = `Failed to update ShipStation for ${update.flowtracSku}: ${(error as Error).message}`;
        results.errors.push(errorMessage);
        console.error(`❌ ${errorMessage}`);
      }
    }
    
    console.log(`ShipStation sync completed: ${results.successful}/${results.total} successful`);
    
    return NextResponse.json({
      success: true,
      message: `ShipStation sync completed: ${results.successful}/${results.total} products updated successfully`,
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
    console.error('ShipStation sync failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
