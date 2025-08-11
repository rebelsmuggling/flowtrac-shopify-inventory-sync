import { NextRequest, NextResponse } from 'next/server';
// import { rateLimit } from '../../middleware/rateLimit';
import path from 'path';
import fs from 'fs';
import { fetchFlowtracInventoryWithBins } from '../../../../services/flowtrac';
import { enrichMappingWithShopifyVariantAndInventoryIds, updateShopifyInventory } from '../../../../services/shopify';
import { updateAmazonInventory } from '../../../../services/amazon';
import { updateShipStationWarehouseLocation } from '../../../../services/shipstation';
import { getImportedMapping } from '../../../utils/imported-mapping-store';

export async function POST(request: NextRequest) {
  // Rate limiting
  // const rateLimitResult = rateLimit(request);
  // if (rateLimitResult) return rateLimitResult;

  console.log('Sync job started');

  try {
    // Parse request body to check for dryRun parameter
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const useSessionMode = body.useSessionMode === true;
    
    if (dryRun) {
      console.log('DRY RUN MODE: Will calculate quantities but not post to Amazon/Shopify');
    }
    
    if (useSessionMode) {
      console.log('SESSION MODE: Using session-based batch processing');
      // Redirect to session-based sync
      const sessionResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/sync-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      
      const sessionData = await sessionResponse.json();
      return NextResponse.json({
        success: sessionData.success,
        message: 'Session-based sync started',
        session: sessionData.session,
        useSessionMode: true
      });
    }

    // 1. Load mapping.json (try imported mapping first, then fallback to file)
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Using imported mapping data');
      mapping = importedMapping;
    } else {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      console.log('DEBUG: Resolved mappingPath in API route:', mappingPath);
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }

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

    // 3. Fetch inventory data from database (instead of Flowtrac directly)
    const { getFlowtracInventory } = await import('../../../lib/database');
    const inventoryResult = await getFlowtracInventory(Array.from(skus), 'Manteca');
    
    if (!inventoryResult.success) {
      throw new Error(`Failed to get inventory from database: ${inventoryResult.error}`);
    }
    
    // Convert database records to the expected format
    const flowtracInventory: Record<string, { quantity: number, bins: string[] }> = {};
    if (inventoryResult.data) {
      for (const record of inventoryResult.data) {
        flowtracInventory[record.sku] = {
          quantity: record.quantity,
          bins: record.bins || []
        };
      }
    }
    
    console.log('Fetched inventory from database', { 
      recordsFound: inventoryResult.data?.length || 0,
      totalSkus: Array.from(skus).length 
    });

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

    // 5. Self-heal: Enrich mapping.json with missing Shopify variant and inventory item IDs (skip in dry run)
    let updatedMapping;
    if (dryRun) {
      console.log('DRY RUN: Skipping Shopify enrichment to avoid API calls');
      updatedMapping = mapping;
    } else {
      await enrichMappingWithShopifyVariantAndInventoryIds();
      
      // Reload mapping after enrichment (try imported mapping first, then fallback to file)
      const importedMappingAfterEnrichment = getImportedMapping();
      
      if (importedMappingAfterEnrichment) {
        console.log('Using imported mapping data after enrichment');
        updatedMapping = importedMappingAfterEnrichment;
      } else {
        const mappingPath = path.join(process.cwd(), 'mapping.json');
        console.log('Using file mapping data after enrichment');
        updatedMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
      }
    }

    // 6. Update inventory in Shopify and Amazon for each SKU
    const updateResults: Record<string, any> = {};
    
    // Process all products that have Shopify SKUs (for Shopify sync)
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
      const inventoryItemId = product?.shopify_inventory_item_id;
      updateResults[sku] = { shopify: null, amazon: null };
      
      // Shopify sync
      if (!inventoryItemId) {
        updateResults[sku].shopify = { success: false, error: 'No shopify_inventory_item_id in mapping.json' };
        console.error(`No shopify_inventory_item_id for SKU ${sku}`);
      } else {
        if (dryRun) {
          updateResults[sku].shopify = { success: true, dryRun: true, message: `Would update Shopify inventory for SKU ${sku} (inventory item ${inventoryItemId}) to ${quantity}` };
          console.log(`DRY RUN: Would update Shopify inventory for SKU ${sku} (inventory item ${inventoryItemId}) to ${quantity}`);
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
      }
      
      // Amazon sync for products in shopifyInventory
      if (product?.amazon_sku && typeof product.amazon_sku === 'string' && product.amazon_sku.trim() !== '') {
        if (dryRun) {
          updateResults[sku].amazon = { success: true, dryRun: true, message: `Would update Amazon inventory for SKU ${product.amazon_sku} to ${quantity}` };
          console.log(`DRY RUN: Would update Amazon inventory for SKU ${product.amazon_sku} to ${quantity}`);
        } else {
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
    }
    
    // Process all products that have Amazon SKUs but might not be in shopifyInventory
    for (const product of updatedMapping.products) {
      if (product?.amazon_sku && typeof product.amazon_sku === 'string' && product.amazon_sku.trim() !== '') {
        const sku = product.shopify_sku;
        
        // Skip if already processed above
        if (updateResults[sku]) continue;
        
        // Get quantity for this product
        let quantity = 0;
        if (product.bundle_components && Array.isArray(product.bundle_components)) {
          const quantities = product.bundle_components.map((comp: any) => {
            const available = flowtracInventory[comp.flowtrac_sku]?.quantity || 0;
            return Math.floor(available / comp.quantity);
          });
          quantity = quantities.length > 0 ? Math.min(...quantities) : 0;
        } else if (product.flowtrac_sku) {
          quantity = flowtracInventory[product.flowtrac_sku]?.quantity || 0;
        }
        
        // Initialize result entry if not exists
        if (!updateResults[sku]) {
          updateResults[sku] = { shopify: null, amazon: null };
        }
        
        // Amazon sync
        if (dryRun) {
          updateResults[sku].amazon = { success: true, dryRun: true, message: `Would update Amazon inventory for SKU ${product.amazon_sku} to ${quantity}` };
          console.log(`DRY RUN: Would update Amazon inventory for SKU ${product.amazon_sku} to ${quantity}`);
        } else {
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
      
      if (dryRun) {
        updateResults.shipstation[sku] = { success: true, dryRun: true, message: `Would update ShipStation warehouseLocation for SKU ${sku} to bins ${warehouseLocation}` };
        console.log(`DRY RUN: Would update ShipStation warehouseLocation for SKU ${sku} to bins ${warehouseLocation}`);
      } else {
        try {
          await updateShipStationWarehouseLocation(sku, warehouseLocation);
          updateResults.shipstation[sku] = { success: true };
          console.log(`Updated ShipStation warehouseLocation for SKU ${sku} to bins ${warehouseLocation}`);
        } catch (err: any) {
          updateResults.shipstation[sku] = { success: false, error: err.message };
          console.error(`Failed to update ShipStation for SKU ${sku}: ${err.message}`);
        }
      }
    }

    const completionMessage = dryRun ? 'Dry run completed successfully' : 'Sync job completed successfully';
    console.log(completionMessage);
    
    // 8. Return success response
    return NextResponse.json({ 
      success: true, 
      message: completionMessage, 
      dryRun,
      shopifyInventory, 
      updateResults 
    });
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