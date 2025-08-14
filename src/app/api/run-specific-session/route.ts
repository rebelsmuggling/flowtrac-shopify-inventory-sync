import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionNumber = parseInt(body.sessionNumber || '2');
    const batchSize = parseInt(body.batchSize || '60');
    
    console.log(`Running specific session: ${sessionNumber}`);
    
    // Get fresh mapping data
    const { mapping, source } = await mappingService.getMapping();
    
    // Get all mapped SKUs
    const mappedSkus = await mappingService.getMappedSkus();
    const skuArray = Array.from(mappedSkus);
    
    // Calculate session SKUs
    const startIndex = (sessionNumber - 1) * batchSize;
    const endIndex = startIndex + batchSize;
    const sessionSkus = skuArray.slice(startIndex, endIndex);
    
    console.log(`Session ${sessionNumber}: Processing ${sessionSkus.length} SKUs`);
    
    // Get inventory for session SKUs
    const inventoryResult = await getFlowtracInventory(sessionSkus, 'Manteca');
    
    if (!inventoryResult.success) {
      throw new Error(`Failed to get inventory from database: ${inventoryResult.error}`);
    }
    
    // Convert database records to expected format
    const batchInventory: Record<string, { quantity: number, bins: string[] }> = {};
    if (inventoryResult.data) {
      for (const record of inventoryResult.data) {
        batchInventory[record.sku] = {
          quantity: record.quantity,
          bins: record.bins || []
        };
      }
    }
    
    console.log(`Fetched inventory from database for session ${sessionNumber}:`, { 
      recordsFound: inventoryResult.data?.length || 0,
      totalSkus: sessionSkus.length 
    });
    
    // Build shopifyInventory map (same logic as sync-session)
    const shopifyInventory: Record<string, number> = {};
    for (const product of mapping.products) {
      if (Array.isArray(product.bundle_components) && product.shopify_sku) {
        // Bundle product - calculate based on component availability
        const quantities = product.bundle_components.map((comp: any) => {
          const available = batchInventory[comp.flowtrac_sku]?.quantity || 0;
          return Math.floor(available / comp.quantity);
        });
        shopifyInventory[product.shopify_sku] = quantities.length > 0 ? Math.min(...quantities) : 0;
      } else if (product.shopify_sku) {
        // Simple product - check both flowtrac_sku and shopify_sku
        let quantity = 0;
        if (product.flowtrac_sku && batchInventory[product.flowtrac_sku]) {
          quantity = batchInventory[product.flowtrac_sku].quantity;
        } else if (batchInventory[product.shopify_sku]) {
          quantity = batchInventory[product.shopify_sku].quantity;
        }
        shopifyInventory[product.shopify_sku] = quantity;
      }
    }
    
    console.log(`Built shopifyInventory map with ${Object.keys(shopifyInventory).length} SKUs`);
    
    // Import sync services
    const { enrichMappingWithShopifyVariantAndInventoryIds, updateShopifyInventoryBulk } = await import('../../../../services/shopify');
    const { updateAmazonInventory } = await import('../../../../services/amazon');
    const { updateShipStationWarehouseLocation } = await import('../../../../services/shipstation');
    
    // Self-heal: Enrich mapping with missing Shopify variant and inventory item IDs
    await enrichMappingWithShopifyVariantAndInventoryIds();
    
    // Reload mapping after enrichment
    const { mapping: updatedMapping } = await mappingService.getMapping();
    
    // Prepare Shopify bulk updates
    const shopifyUpdates: Array<{ inventoryItemId: string; quantity: number; sku: string }> = [];
    
    // Collect all Shopify updates
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
      const inventoryItemId = product?.shopify_inventory_item_id;
      
      if (!inventoryItemId) {
        console.error(`No shopify_inventory_item_id for SKU ${sku}`);
      } else {
        shopifyUpdates.push({ inventoryItemId, quantity, sku });
      }
    }
    
    // Bulk Shopify sync
    let shopifyResult: { success: number; failed: number; errors: string[] } = { success: 0, failed: 0, errors: [] };
    if (shopifyUpdates.length > 0) {
      console.log(`Starting bulk Shopify update for ${shopifyUpdates.length} items...`);
      shopifyResult = await updateShopifyInventoryBulk(shopifyUpdates);
      console.log(`Bulk Shopify update completed: ${shopifyResult.success} successful, ${shopifyResult.failed} failed`);
    }
    
    // Amazon sync
    const amazonResults = [];
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
      
      if (product?.amazon_sku && typeof product.amazon_sku === 'string' && product.amazon_sku.trim() !== '') {
        try {
          const result = await updateAmazonInventory(product.amazon_sku, quantity);
          amazonResults.push({ sku: product.amazon_sku, success: true, result });
        } catch (error) {
          amazonResults.push({ sku: product.amazon_sku, success: false, error: (error as Error).message });
        }
      }
    }
    
    // ShipStation sync
    const shipstationResults = [];
    for (const sku of sessionSkus) {
      const inventoryRecord = batchInventory[sku];
      if (inventoryRecord && inventoryRecord.quantity > 0) {
        try {
          const result = await updateShipStationWarehouseLocation(sku, inventoryRecord.quantity);
          shipstationResults.push({ sku, success: true, result });
        } catch (error) {
          shipstationResults.push({ sku, success: false, error: (error as Error).message });
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      sessionNumber,
      sessionInfo: {
        totalSkus: sessionSkus.length,
        skusWithInventory: Object.keys(batchInventory).length,
        skusInShopifyInventory: Object.keys(shopifyInventory).length,
        shopifyUpdates: shopifyUpdates.length
      },
      results: {
        shopify: shopifyResult,
        amazon: {
          total: amazonResults.length,
          successful: amazonResults.filter(r => r.success).length,
          failed: amazonResults.filter(r => !r.success).length
        },
        shipstation: {
          total: shipstationResults.length,
          successful: shipstationResults.filter(r => r.success).length,
          failed: shipstationResults.filter(r => !r.success).length
        }
      },
      sampleSkus: sessionSkus.slice(0, 10)
    });
    
  } catch (error) {
    console.error('Error running specific session:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
