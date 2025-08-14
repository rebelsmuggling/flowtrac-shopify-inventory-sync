import { NextRequest, NextResponse } from 'next/server';
import { getFlowtracInventory } from '../../../lib/database';
import { mappingService } from '../../../services/mapping';

export async function GET(request: NextRequest) {
  try {
    console.log('Checking all inventory records...');
    
    // Get all inventory from database (no SKU filter)
    const inventoryResult = await getFlowtracInventory(undefined, 'Manteca');
    
    if (!inventoryResult.success) {
      return NextResponse.json({
        success: false,
        error: `Failed to get inventory: ${inventoryResult.error}`
      });
    }
    
    // Get mapping data
    const { mapping } = await mappingService.getMappingFresh();
    
    // Analyze inventory records
    const analysis = {
      totalRecords: inventoryResult.data?.length || 0,
      recordsWithZeroQuantity: 0,
      recordsWithPositiveQuantity: 0,
      recordsWithShopifyMapping: 0,
      recordsWithoutShopifyMapping: 0,
      sampleRecords: [] as any[]
    };
    
    if (inventoryResult.data) {
      for (const record of inventoryResult.data) {
        const product = mapping.products.find((p: any) => p.shopify_sku === record.sku);
        
        if (record.quantity === 0) {
          analysis.recordsWithZeroQuantity++;
        } else {
          analysis.recordsWithPositiveQuantity++;
        }
        
        if (product?.shopify_inventory_item_id) {
          analysis.recordsWithShopifyMapping++;
        } else {
          analysis.recordsWithoutShopifyMapping++;
        }
        
        // Add sample records for inspection
        if (analysis.sampleRecords.length < 10) {
          analysis.sampleRecords.push({
            sku: record.sku,
            quantity: record.quantity,
            hasShopifyMapping: !!(product?.shopify_inventory_item_id),
            shopify_inventory_item_id: product?.shopify_inventory_item_id || 'MISSING'
          });
        }
      }
    }
    
    // Look specifically for the SKU in question
    const targetSku = 'IC-HCPK--96';
    const targetRecord = inventoryResult.data?.find((record: any) => record.sku === targetSku);
    const targetProduct = mapping.products.find((p: any) => p.shopify_sku === targetSku);
    
    return NextResponse.json({
      success: true,
      analysis,
      targetSku: {
        sku: targetSku,
        found: !!targetRecord,
        inventoryRecord: targetRecord ? {
          quantity: targetRecord.quantity,
          bins: targetRecord.bins,
          warehouse: targetRecord.warehouse
        } : null,
        mappingRecord: targetProduct ? {
          shopify_inventory_item_id: targetProduct.shopify_inventory_item_id,
          shopify_variant_id: targetProduct.shopify_variant_id,
          product_name: targetProduct.product_name
        } : null,
        wouldBePosted: targetRecord?.quantity || 0,
        hasShopifyId: !!(targetProduct?.shopify_inventory_item_id)
      }
    });
    
  } catch (error) {
    console.error('Error checking all inventory:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
