import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'IC-RBBE-0002';
    const sessionNumber = parseInt(url.searchParams.get('session') || '1');
    const batchSize = parseInt(url.searchParams.get('batchSize') || '60');
    
    console.log(`Comparing bulk sync vs individual for SKU: ${sku}`);
    
    // Get fresh mapping data
    const { mapping, source } = await mappingService.getMapping();
    
    // Get all mapped SKUs
    const mappedSkus = await mappingService.getMappedSkus();
    const skuArray = Array.from(mappedSkus);
    
    // Calculate session SKUs (same logic as sync-session)
    const startIndex = (sessionNumber - 1) * batchSize;
    const endIndex = startIndex + batchSize;
    const sessionSkus = skuArray.slice(startIndex, endIndex);
    
    // Check if our target SKU is in this session
    const skuInSession = sessionSkus.includes(sku);
    const skuIndex = sessionSkus.indexOf(sku);
    
    // Get inventory for session SKUs
    const inventoryResult = await getFlowtracInventory(sessionSkus, 'Manteca');
    const inventoryData = inventoryResult.data || [];
    
    // Build shopifyInventory map (same logic as sync-session)
    const shopifyInventory: Record<string, number> = {};
    for (const product of mapping.products) {
      if (Array.isArray(product.bundle_components) && product.shopify_sku) {
        // Bundle product - calculate based on component availability
        const quantities = product.bundle_components.map((comp: any) => {
          const available = inventoryData.find((record: any) => record.sku === comp.flowtrac_sku)?.quantity || 0;
          return Math.floor(available / comp.quantity);
        });
        shopifyInventory[product.shopify_sku] = quantities.length > 0 ? Math.min(...quantities) : 0;
      } else if (product.shopify_sku) {
        // Simple product - check both flowtrac_sku and shopify_sku
        let quantity = 0;
        if (product.flowtrac_sku) {
          const record = inventoryData.find((record: any) => record.sku === product.flowtrac_sku);
          quantity = record?.quantity || 0;
        } else {
          const record = inventoryData.find((record: any) => record.sku === product.shopify_sku);
          quantity = record?.quantity || 0;
        }
        shopifyInventory[product.shopify_sku] = quantity;
      }
    }
    
    // Check if our target SKU is in the shopifyInventory map
    const targetProduct = mapping.products.find(p => 
      p.flowtrac_sku === sku || p.shopify_sku === sku
    );
    const targetShopifySku = targetProduct?.shopify_sku;
    const targetQuantity = shopifyInventory[targetShopifySku || ''];
    
    // Build shopifyUpdates array (same logic as sync-session)
    const shopifyUpdates: Array<{ inventoryItemId: string; quantity: number; sku: string }> = [];
    for (const [skuKey, quantity] of Object.entries(shopifyInventory)) {
      const product = mapping.products.find((p: any) => p.shopify_sku === skuKey);
      const inventoryItemId = product?.shopify_inventory_item_id;
      
      if (inventoryItemId) {
        shopifyUpdates.push({ inventoryItemId, quantity, sku: skuKey });
      }
    }
    
    // Check if our target SKU is in the shopifyUpdates array
    const targetUpdate = shopifyUpdates.find(update => update.sku === targetShopifySku);
    
    return NextResponse.json({
      success: true,
      targetSku: sku,
      sessionInfo: {
        sessionNumber,
        batchSize,
        totalSkus: skuArray.length,
        sessionSkus: sessionSkus.length,
        skuInSession,
        skuIndex: skuInSession ? skuIndex : -1
      },
      targetProduct: targetProduct ? {
        flowtrac_sku: targetProduct.flowtrac_sku,
        shopify_sku: targetProduct.shopify_sku,
        shopify_inventory_item_id: targetProduct.shopify_inventory_item_id,
        product_name: targetProduct.product_name
      } : null,
      inventoryData: {
        totalRecords: inventoryData.length,
        targetRecord: inventoryData.find((record: any) => record.sku === sku) || null
      },
      shopifyInventory: {
        totalEntries: Object.keys(shopifyInventory).length,
        targetEntry: targetShopifySku ? {
          shopify_sku: targetShopifySku,
          quantity: targetQuantity,
          found: targetQuantity !== undefined
        } : null,
        sampleEntries: Object.entries(shopifyInventory).slice(0, 5)
      },
      shopifyUpdates: {
        totalUpdates: shopifyUpdates.length,
        targetUpdate,
        sampleUpdates: shopifyUpdates.slice(0, 5)
      },
      analysis: {
        skuFoundInSession: skuInSession,
        skuFoundInInventory: !!inventoryData.find((record: any) => record.sku === sku),
        skuFoundInShopifyInventory: targetQuantity !== undefined,
        skuFoundInShopifyUpdates: !!targetUpdate,
        expectedQuantity: inventoryData.find((record: any) => record.sku === sku)?.quantity || 0,
        actualQuantityInBulk: targetQuantity || 0,
        quantityMatch: (inventoryData.find((record: any) => record.sku === sku)?.quantity || 0) === (targetQuantity || 0)
      }
    });
    
  } catch (error) {
    console.error('Error comparing bulk sync vs individual:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
