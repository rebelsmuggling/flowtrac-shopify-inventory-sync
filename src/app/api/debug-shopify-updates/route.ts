import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionNumber = parseInt(url.searchParams.get('session') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    
    console.log(`Debugging Shopify updates for session ${sessionNumber}`);
    
    // Load mapping using the mapping service (fresh data, no cache)
    const { mapping, source } = await mappingService.getMappingFresh();
    console.log(`Using ${source} mapping data`);
    
    // Get all SKUs
    const allSkus = getAllSkus(mapping);
    const batchSize = 60;
    const sessionSkus = getSkusForSession(allSkus, sessionNumber, batchSize);
    
    // Get inventory from database
    const inventoryResult = await getFlowtracInventory(sessionSkus, 'Manteca');
    
    if (!inventoryResult.success) {
      return NextResponse.json({
        success: false,
        error: `Failed to get inventory: ${inventoryResult.error}`
      });
    }
    
    // Build shopifyInventory map (same logic as sync-session)
    const shopifyInventory: Record<string, number> = {};
    for (const product of mapping.products) {
      if (Array.isArray(product.bundle_components) && product.shopify_sku) {
        const quantities = product.bundle_components.map((comp: any) => {
          const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === comp.flowtrac_sku);
          const available = inventoryRecord?.quantity || 0;
          return Math.floor(available / comp.quantity);
        });
        shopifyInventory[product.shopify_sku] = quantities.length > 0 ? Math.min(...quantities) : 0;
      } else if (product.shopify_sku && product.flowtrac_sku) {
        const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === product.flowtrac_sku);
        shopifyInventory[product.shopify_sku] = inventoryRecord?.quantity || 0;
      }
    }
    
    // Prepare Shopify bulk updates (same logic as sync-session)
    const shopifyUpdates: Array<{ inventoryItemId: string; quantity: number; sku: string }> = [];
    
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = mapping.products.find((p: any) => p.shopify_sku === sku);
      const inventoryItemId = product?.shopify_inventory_item_id;
      
      if (!inventoryItemId) {
        console.error(`No shopify_inventory_item_id for SKU ${sku}`);
      } else {
        shopifyUpdates.push({ inventoryItemId, quantity, sku });
      }
    }
    
    // Analyze the updates
    const analysis = {
      sessionNumber,
      sessionSkusCount: sessionSkus.length,
      shopifyInventoryCount: Object.keys(shopifyInventory).length,
      shopifyUpdatesCount: shopifyUpdates.length,
      updatesWithZeroQuantity: 0,
      updatesWithPositiveQuantity: 0,
      sampleUpdates: [] as any[],
      zeroQuantityUpdates: [] as any[],
      positiveQuantityUpdates: [] as any[]
    };
    
    for (const update of shopifyUpdates) {
      if (update.quantity === 0) {
        analysis.updatesWithZeroQuantity++;
        if (analysis.zeroQuantityUpdates.length < limit) {
          analysis.zeroQuantityUpdates.push(update);
        }
      } else {
        analysis.updatesWithPositiveQuantity++;
        if (analysis.positiveQuantityUpdates.length < limit) {
          analysis.positiveQuantityUpdates.push(update);
        }
      }
      
      if (analysis.sampleUpdates.length < limit) {
        analysis.sampleUpdates.push(update);
      }
    }
    
    // Check specific working SKUs
    const workingSkus = [
      'IC-KOOL-004', 'IC-HCPK-005', 'IC-MILI-0028', 'IC-MILI-0056', 
      'RS-KEWS-000', 'IC-HCPK-004', 'IC-FURI-0008', 'IC-DAVI-012', 'RS-KOOL-009'
    ];
    
    const workingSkuUpdates = workingSkus.map(sku => {
      const update = shopifyUpdates.find(u => u.sku === sku);
      return {
        sku,
        found: !!update,
        update: update || null
      };
    });
    
    return NextResponse.json({
      success: true,
      analysis,
      workingSkuUpdates,
      sessionSkus,
      inventoryRecords: inventoryResult.data?.slice(0, 10) || [],
      shopifyInventorySample: Object.entries(shopifyInventory).slice(0, 10)
    });
    
  } catch (error) {
    console.error('Error debugging Shopify updates:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}

function getAllSkus(mapping: any): string[] {
  const skus = new Set<string>();
  for (const product of mapping.products) {
    if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
    if (Array.isArray(product.bundle_components)) {
      for (const comp of product.bundle_components) {
        if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
      }
    }
  }
  return Array.from(skus);
}

function getSkusForSession(allSkus: string[], sessionNumber: number, batchSize: number = 60): string[] {
  const startIndex = (sessionNumber - 1) * batchSize;
  const endIndex = Math.min(startIndex + batchSize, allSkus.length);
  return allSkus.slice(startIndex, endIndex);
}
