import { NextRequest, NextResponse } from 'next/server';
import { getFlowtracInventory } from '../../../lib/database';
import { mappingService } from '../../../services/mapping';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'IC-HCPK--96';
    
    console.log(`Checking inventory for SKU: ${sku}`);
    
    // Get inventory from database
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    
    if (!inventoryResult.success) {
      return NextResponse.json({
        success: false,
        error: `Failed to get inventory: ${inventoryResult.error}`
      });
    }
    
    const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === sku);
    
    if (!inventoryRecord) {
      return NextResponse.json({
        success: false,
        error: `No inventory record found for SKU: ${sku}`,
        sku,
        databaseRecords: inventoryResult.data || []
      });
    }
    
    // Get mapping data to see Shopify configuration
    const { mapping } = await mappingService.getMappingFresh();
    const product = mapping.products.find((p: any) => p.shopify_sku === sku);
    
    return NextResponse.json({
      success: true,
      sku,
      inventoryRecord: {
        sku: inventoryRecord.sku,
        quantity: inventoryRecord.quantity,
        bins: inventoryRecord.bins,
        warehouse: inventoryRecord.warehouse,
        last_updated: inventoryRecord.last_updated
      },
      mappingData: product ? {
        shopify_sku: product.shopify_sku,
        shopify_inventory_item_id: product.shopify_inventory_item_id,
        shopify_variant_id: product.shopify_variant_id,
        product_name: product.product_name
      } : null,
      quantityToPost: inventoryRecord.quantity || 0,
      hasShopifyId: !!(product?.shopify_inventory_item_id),
      wouldBeSkipped: !product?.shopify_inventory_item_id
    });
    
  } catch (error) {
    console.error('Error checking inventory:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
