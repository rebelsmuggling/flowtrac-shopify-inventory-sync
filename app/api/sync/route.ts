import { NextRequest, NextResponse } from 'next/server';
// import { rateLimit } from '../../middleware/rateLimit';
import path from 'path';
import fs from 'fs';
import { fetchFlowtracInventory } from '../../services/flowtrac';
import { enrichMappingWithShopifyVariantAndInventoryIds, updateShopifyInventory } from '../../services/shopify';

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

    // 3. Fetch inventory data from Flowtrac
    const flowtracInventory = await fetchFlowtracInventory(Array.from(skus));
    console.log('Fetched Flowtrac inventory', { flowtracInventory });

    // 4. Build shopifyInventory map (simple and bundle SKUs)
    const shopifyInventory: Record<string, number> = {};
    for (const product of mapping.products) {
      if (Array.isArray(product.bundle_components) && product.shopify_sku) {
        const quantities = product.bundle_components.map((comp: any) => {
          const available = flowtracInventory[comp.flowtrac_sku] || 0;
          return Math.floor(available / comp.quantity);
        });
        shopifyInventory[product.shopify_sku] = quantities.length > 0 ? Math.min(...quantities) : 0;
      } else if (product.shopify_sku && product.flowtrac_sku) {
        shopifyInventory[product.shopify_sku] = flowtracInventory[product.flowtrac_sku] || 0;
      }
    }

    // 5. Self-heal: Enrich mapping.json with missing Shopify variant and inventory item IDs
    await enrichMappingWithShopifyVariantAndInventoryIds();
    // Reload mapping after enrichment
    const updatedMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

    // 6. Update inventory in Shopify for each SKU
    const updateResults: Record<string, { success: boolean; error?: string }> = {};
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
      const inventoryItemId = product?.shopify_inventory_item_id;
      if (!inventoryItemId) {
        updateResults[sku] = { success: false, error: 'No shopify_inventory_item_id in mapping.json' };
        console.error(`No shopify_inventory_item_id for SKU ${sku}`);
        continue;
      }
      try {
        await updateShopifyInventory(inventoryItemId, quantity);
        updateResults[sku] = { success: true };
        console.log(`Updated Shopify inventory for SKU ${sku} (inventory item ${inventoryItemId}) to ${quantity}`);
      } catch (err: any) {
        updateResults[sku] = { success: false, error: err.message };
        console.error(`Failed to update Shopify inventory for SKU ${sku}: ${err.message}`);
      }
    }

    console.log('Sync job completed successfully');
    // 7. Return success response
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