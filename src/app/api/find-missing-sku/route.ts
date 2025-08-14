import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'IC-FRSO-00C';
    
    console.log(`Searching for missing SKU: ${sku}`);
    
    // Get mapping data
    const { mapping } = await mappingService.getMappingFresh();
    
    // Search for the SKU in different ways
    const searchResults = {
      sku,
      foundInMapping: false,
      foundAsFlowtracSku: false,
      foundAsShopifySku: false,
      foundInBundleComponents: false,
      similarSkus: [] as string[],
      exactMatches: [] as any[],
      partialMatches: [] as any[]
    };
    
    // Search for exact matches
    for (const product of mapping.products) {
      if (product.flowtrac_sku === sku) {
        searchResults.foundAsFlowtracSku = true;
        searchResults.foundInMapping = true;
        searchResults.exactMatches.push({
          type: 'flowtrac_sku',
          product: {
            flowtrac_sku: product.flowtrac_sku,
            shopify_sku: product.shopify_sku,
            product_name: product.product_name,
            has_shopify_inventory_item_id: !!(product.shopify_inventory_item_id)
          }
        });
      }
      
      if (product.shopify_sku === sku) {
        searchResults.foundAsShopifySku = true;
        searchResults.foundInMapping = true;
        searchResults.exactMatches.push({
          type: 'shopify_sku',
          product: {
            flowtrac_sku: product.flowtrac_sku,
            shopify_sku: product.shopify_sku,
            product_name: product.product_name,
            has_shopify_inventory_item_id: !!(product.shopify_inventory_item_id)
          }
        });
      }
      
      // Search in bundle components
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku === sku) {
            searchResults.foundInBundleComponents = true;
            searchResults.foundInMapping = true;
            searchResults.exactMatches.push({
              type: 'bundle_component',
              parent_sku: product.shopify_sku,
              component: {
                flowtrac_sku: comp.flowtrac_sku,
                quantity: comp.quantity
              }
            });
          }
        }
      }
      
      // Search for similar SKUs (same prefix)
      const skuPrefix = sku.split('-')[0] + '-' + sku.split('-')[1];
      if (product.flowtrac_sku && product.flowtrac_sku.startsWith(skuPrefix)) {
        searchResults.similarSkus.push(product.flowtrac_sku);
      }
      if (product.shopify_sku && product.shopify_sku.startsWith(skuPrefix)) {
        searchResults.similarSkus.push(product.shopify_sku);
      }
    }
    
    // Remove duplicates from similar SKUs
    searchResults.similarSkus = [...new Set(searchResults.similarSkus)];
    
    // Check if the SKU exists in the database
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === sku);
    
    // Check for products with empty flowtrac_sku but matching shopify_sku
    const productsWithEmptyFlowtracSku = mapping.products.filter(p => 
      !p.flowtrac_sku && p.shopify_sku && p.shopify_sku.includes(sku.split('-')[1])
    ).slice(0, 10);
    
    return NextResponse.json({
      success: true,
      searchResults,
      databaseCheck: {
        foundInDatabase: !!inventoryRecord,
        inventoryRecord: inventoryRecord ? {
          sku: inventoryRecord.sku,
          quantity: inventoryRecord.quantity,
          warehouse: inventoryRecord.warehouse,
          bins: inventoryRecord.bins
        } : null
      },
      productsWithEmptyFlowtracSku,
      analysis: {
        skuExistsInDatabase: !!inventoryRecord,
        skuExistsInMapping: searchResults.foundInMapping,
        needsMappingUpdate: !!(inventoryRecord && !searchResults.foundInMapping),
        similarSkusFound: searchResults.similarSkus.length
      }
    });
    
  } catch (error) {
    console.error('Error searching for missing SKU:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
