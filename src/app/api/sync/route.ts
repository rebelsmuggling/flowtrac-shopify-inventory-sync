import { NextRequest, NextResponse } from 'next/server';
// import { rateLimit } from '../../middleware/rateLimit';
import path from 'path';
import fs from 'fs';
import { fetchFlowtracInventoryWithBins } from '../../../../services/flowtrac';
import { enrichMappingWithShopifyVariantAndInventoryIds, updateShopifyInventory } from '../../../../services/shopify';
import { updateAmazonInventory } from '../../../../services/amazon';
import { updateShipStationWarehouseLocation } from '../../../../services/shipstation';

export async function POST(request: NextRequest) {
  // Rate limiting
  // const rateLimitResult = rateLimit(request);
  // if (rateLimitResult) return rateLimitResult;

  console.log('Sync job started');

  try {
    // 1. Load mapping.json
    const mappingPath = path.join(process.cwd(), 'mapping.json');
    console.log('DEBUG: Resolved mappingPath in API route:', mappingPath);
    let mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

    // 2. Collect all SKUs (simple and bundle components)
    const skus = new Set<string>();
    for (const product of mapping.products) {
      if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
        }
      }
    }

    // 3. Fetch inventory data from Flowtrac (with bins)
    const flowtracInventory = await fetchFlowtracInventoryWithBins(Array.from(skus));
    // flowtracInventory is { [sku]: { quantity: number, bins: string[] } }
    console.log('Fetched Flowtrac inventory with bins', { flowtracInventory });

    // 4. Build shopifyInventory map (simple and bundle SKUs)
    const shopifyInventory: Record<string, number> = {};
    for (const product of mapping.products) {
      if (Array.isArray(product.bundle_components) && product.shopify_sku) {
        const quantities = product.bundle_components.map((comp: any) => {
          const available = flowtracInventory[comp.flowtrac_sku]?.quantity || 0;
          return Math.floor(available / comp.quantity);
        });
        shopifyInventory[product.shopify_sku] = quantities.length > 0 ? Math.min(...quantities) : 0;
      } else if (product.shopify_sku && product.flowtrac_sku) {
        shopifyInventory[product.shopify_sku] = flowtracInventory[product.flowtrac_sku]?.quantity || 0;
      }
    }

    // 5. Self-heal: Enrich mapping.json with missing Shopify variant and inventory item IDs
    await enrichMappingWithShopifyVariantAndInventoryIds();
    // Reload mapping after enrichment
    const updatedMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

    // 6. Update inventory in Shopify and Amazon for each SKU
    const updateResults: Record<string, any> = {};
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
      const inventoryItemId = product?.shopify_inventory_item_id;
      updateResults[sku] = { shopify: null, amazon: null };
      // Shopify sync
      if (!inventoryItemId) {
        updateResults[sku].shopify = { success: false, error: 'No shopify_inventory_item_id in mapping.json' };
        console.error(`No shopify_inventory_item_id for SKU ${sku}`);
      } else {
        try {
          await updateShopifyInventory(inventoryItemId, quantity);
          updateResults[sku].shopify = { success: true };
          console.log(`Updated Shopify inventory for SKU ${sku} (inventory item ${inventoryItemId}) to ${quantity}`);
        } catch (err: any) {
          updateResults[sku].shopify = { success: false, error: err.message };
          console.error(`Failed to update Shopify inventory for SKU ${sku}: ${err.message}`);
        }
      }
      // Amazon sync
      if (product?.amazon_sku && typeof product.amazon_sku === 'string' && product.amazon_sku.trim() !== '') {
        try {
          const amazonResult = await updateAmazonInventory(product.amazon_sku, quantity);
          updateResults[sku].amazon = amazonResult;
          console.log(`Amazon sync for SKU ${product.amazon_sku}:`, amazonResult);
        } catch (err: any) {
          updateResults[sku].amazon = { success: false, error: err.message };
          console.error(`Failed to update Amazon inventory for SKU ${product.amazon_sku}: ${err.message}`);
        }
      }
    }

    // 7. ShipStation sync for all unique flowtrac SKUs (including bundle components)
    updateResults.shipstation = {};
    for (const sku of skus) {
      const bins = flowtracInventory[sku]?.bins || [];
      let warehouseLocation;
      if (!bins.length) {
        warehouseLocation = 'OutofStock';
      } else {
        // Join all bins with a comma (ShipStation allows a string for warehouseLocation)
        warehouseLocation = bins.join(',');
        // Truncate to 100 characters at a bin boundary
        if (warehouseLocation.length > 100) {
          let truncated = '';
          for (const bin of bins) {
            if (truncated.length + bin.length + (truncated ? 1 : 0) > 100) break;
            if (truncated) truncated += ',';
            truncated += bin;
          }
          warehouseLocation = truncated;
        }
      }
      // Debug logging
      console.log(`ShipStation update for SKU ${sku}: bins=`, bins, 'warehouseLocation=', warehouseLocation);
      try {
        await updateShipStationWarehouseLocation(sku, warehouseLocation);
        updateResults.shipstation[sku] = { success: true };
        console.log(`Updated ShipStation warehouseLocation for SKU ${sku} to bins ${warehouseLocation}`);
      } catch (err: any) {
        updateResults.shipstation[sku] = { success: false, error: err.message };
        console.error(`Failed to update ShipStation for SKU ${sku}: ${err.message}`);
      }
    }

    console.log('Sync job completed successfully');
    // 8. Return success response
    return NextResponse.json({ success: true, message: 'Sync completed.', shopifyInventory, updateResults });
  } catch (error) {
    console.error('Sync job failed', { error });
    // Handle errors
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Optionally allow GET for testing
  return NextResponse.json({ message: 'Sync endpoint is up.' });
} 