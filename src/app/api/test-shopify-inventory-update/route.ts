import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'IC-THIC-0010';
    
    console.log(`Testing inventory update for SKU: ${sku}`);
    
    // Get mapping data
    const { mapping } = await mappingService.getMappingFresh();
    const product = mapping.products.find((p: any) => p.shopify_sku === sku);
    
    if (!product) {
      return NextResponse.json({
        success: false,
        error: `Product not found in mapping for SKU: ${sku}`
      });
    }
    
    console.log('Product found:', {
      shopify_sku: product.shopify_sku,
      shopify_inventory_item_id: product.shopify_inventory_item_id,
      shopify_variant_id: product.shopify_variant_id
    });
    
    if (!product.shopify_inventory_item_id) {
      return NextResponse.json({
        success: false,
        error: `No shopify_inventory_item_id for SKU: ${sku}`
      });
    }
    
    // Get inventory from database
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    
    if (!inventoryResult.success) {
      return NextResponse.json({
        success: false,
        error: `Failed to get inventory: ${inventoryResult.error}`
      });
    }
    
    const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === sku);
    const quantity = inventoryRecord?.quantity || 0;
    
    console.log(`Inventory quantity for ${sku}: ${quantity}`);
    
    // Test the Shopify update using the REST API (more reliable)
    const { updateShopifyInventory } = await import('../../../../services/shopify');
    
    try {
      await updateShopifyInventory(product.shopify_inventory_item_id, quantity);
      
      return NextResponse.json({
        success: true,
        sku,
        quantity,
        inventory_item_id: product.shopify_inventory_item_id,
        message: `Successfully updated inventory to ${quantity}`
      });
      
    } catch (shopifyError: any) {
      return NextResponse.json({
        success: false,
        error: `Shopify update failed: ${shopifyError.message}`,
        sku,
        quantity,
        inventory_item_id: product.shopify_inventory_item_id
      });
    }
    
  } catch (error) {
    console.error('Error in test:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
