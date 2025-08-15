import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { updateShipStationWarehouseLocation } from '../../../../services/shipstation';

export async function POST(request: NextRequest) {
  try {
    console.log('ShipStation-only sync started');
    
    // 1. Load mapping
    const { mapping } = await mappingService.getMappingFresh();
    
    // 2. Get all products that have Shopify SKUs (ShipStation uses Shopify SKUs)
    const shopifyProducts = mapping.products.filter(product => product.shopify_sku);
    
    console.log(`Found ${shopifyProducts.length} products with Shopify SKUs for ShipStation update`);
    
    // 3. Update ShipStation warehouse location for each product
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[],
      updates: [] as any[]
    };
    
    for (const product of shopifyProducts) {
      if (!product.shopify_sku) continue;
      
      results.total++;
      
      try {
        await updateShipStationWarehouseLocation(product.shopify_sku, 'Manteca');
        
        results.successful++;
        results.updates.push({
          sku: product.shopify_sku,
          flowtrac_sku: product.flowtrac_sku,
          warehouse: 'Manteca',
          type: product.bundle_components ? 'Bundle' : 'Simple'
        });
        
        console.log(`✅ ShipStation update successful: ${product.shopify_sku} → Manteca warehouse`);
        
      } catch (error) {
        results.failed++;
        const errorMessage = `Failed to update ShipStation for ${product.shopify_sku}: ${(error as Error).message}`;
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
