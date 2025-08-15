import { NextRequest, NextResponse } from 'next/server';
// import { rateLimit } from '../../middleware/rateLimit';
import { fetchFlowtracInventoryWithBins } from '../../../../services/flowtrac';
import { enrichMappingWithShopifyVariantAndInventoryIds, updateShopifyInventory, updateShopifyInventoryBulk } from '../../../../services/shopify';
import { updateAmazonInventory, updateAmazonInventoryBulk } from '../../../../services/amazon';
import { updateShipStationWarehouseLocation } from '../../../../services/shipstation';
import { mappingService } from '../../../services/mapping';

export async function POST(request: NextRequest) {
  // Rate limiting
  // const rateLimitResult = rateLimit(request);
  // if (rateLimitResult) return rateLimitResult;

  console.log('Sync job started');

  try {
    // Parse request body to check for dryRun parameter
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const useSessionMode = body.useSessionMode !== false; // Default to true unless explicitly set to false
    
    if (dryRun) {
      console.log('DRY RUN MODE: Will calculate quantities but not post to Amazon/Shopify');
    }
    
    if (useSessionMode) {
      console.log('SESSION MODE: Using session-based batch processing with auto-continuation');
      
      // Get the base URL for the current request
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      const host = request.headers.get('host') || 'localhost:3000';
      const baseUrl = `${protocol}://${host}`;
      
      console.log('Using base URL for session request:', baseUrl);
      
      // First, check for and recover any stuck sessions
      try {
        console.log('Checking for stuck sessions before starting new sync...');
        const recoveryResponse = await fetch(`${baseUrl}/api/sync-session-recovery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'recover' })
        });
        
        if (!recoveryResponse.ok) {
          const errorText = await recoveryResponse.text();
          console.warn(`Session recovery failed with status ${recoveryResponse.status}:`, errorText);
        } else {
          const recoveryData = await recoveryResponse.json();
          if (recoveryData.success && recoveryData.recovered) {
            console.log('Recovered stuck session:', recoveryData.message);
          }
        }
      } catch (recoveryError) {
        console.warn('Session recovery check failed:', (recoveryError as Error).message);
      }
      
      // Start the session-based sync
      const sessionResponse = await fetch(`${baseUrl}/api/sync-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      
      if (!sessionResponse.ok) {
        const errorText = await sessionResponse.text();
        console.error(`Session start failed with status ${sessionResponse.status}:`, errorText);
        return NextResponse.json({
          success: false,
          error: 'Failed to start session-based sync',
          details: `HTTP ${sessionResponse.status}: ${errorText}`
        });
      }
      
      const sessionData = await sessionResponse.json();
      
      if (!sessionData.success) {
        return NextResponse.json({
          success: false,
          error: 'Failed to start session-based sync',
          details: sessionData.error
        });
      }
      
      // Note: Auto-continuation is now handled by the separate /api/auto-continue cron job
      // which runs every 2 minutes and processes sessions directly without HTTP requests
      console.log('Session started successfully. Auto-continuation will be handled by the dedicated cron job.');
      
      return NextResponse.json({
        success: true,
        message: `Session-based sync started successfully.`,
        session: sessionData.session,
        useSessionMode: true,
        note: `Auto-continuation is handled by the dedicated /api/auto-continue cron job that runs every 2 minutes.`
      });
      

    }

    // 1. Load mapping using the mapping service (fresh data, no cache)
    const { mapping, source } = await mappingService.getMapping();
    console.log(`Using ${source} mapping data`);

    // 2. Collect all SKUs (simple and bundle components)
    const skus = await mappingService.getMappedSkus();

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
      
      // Reload mapping after enrichment using the mapping service (fresh data, no cache)
      const { mapping: updatedMappingData } = await mappingService.getMapping();
      updatedMapping = updatedMappingData;
    }

    // 6. Update inventory in Shopify and Amazon for each SKU
    const updateResults: Record<string, any> = {};
    
    // Prepare Shopify bulk updates
    const shopifyUpdates: Array<{ inventoryItemId: string; quantity: number; sku: string }> = [];
    const shopifyUpdateMap: Record<string, { inventoryItemId: string; quantity: number }> = {};
    
    // Collect all Shopify updates
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
      const inventoryItemId = product?.shopify_inventory_item_id;
      updateResults[sku] = { shopify: null, amazon: null };
      
      if (!inventoryItemId) {
        updateResults[sku].shopify = { success: false, error: 'No shopify_inventory_item_id in mapping.json' };
        console.error(`No shopify_inventory_item_id for SKU ${sku}`);
      } else {
        shopifyUpdates.push({ inventoryItemId, quantity, sku });
        shopifyUpdateMap[sku] = { inventoryItemId, quantity };
      }
    }
    
    // Bulk Shopify sync
    if (shopifyUpdates.length > 0) {
      if (dryRun) {
        console.log(`DRY RUN: Would bulk update ${shopifyUpdates.length} Shopify inventory items`);
        for (const update of shopifyUpdates) {
          updateResults[update.sku].shopify = { 
            success: true, 
            dryRun: true, 
            message: `Would update Shopify inventory for SKU ${update.sku} (inventory item ${update.inventoryItemId}) to ${update.quantity}` 
          };
        }
      } else {
        try {
          console.log(`Starting bulk Shopify update for ${shopifyUpdates.length} items...`);
          const bulkResult = await updateShopifyInventoryBulk(shopifyUpdates);
          console.log(`Bulk Shopify update completed: ${bulkResult.success} successful, ${bulkResult.failed} failed`);
          
          // Mark all as successful initially (we'll handle individual failures if needed)
          for (const update of shopifyUpdates) {
            updateResults[update.sku].shopify = { success: true };
          }
          
          // Log any errors
          if (bulkResult.errors.length > 0) {
            console.error('Shopify bulk update errors:', bulkResult.errors);
          }
        } catch (err: any) {
          console.error('Bulk Shopify update failed:', err.message);
          // Mark all as failed
          for (const update of shopifyUpdates) {
            updateResults[update.sku].shopify = { success: false, error: err.message };
          }
        }
      }
    }
    
    // Amazon sync for products in shopifyInventory (bulk update)
    const amazonUpdates: Array<{ sku: string; quantity: number }> = [];
    const amazonUpdateMap: Record<string, { sku: string; quantity: number }> = {};
    
    // Collect all Amazon updates
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
      
      if (product?.amazon_sku && typeof product.amazon_sku === 'string' && product.amazon_sku.trim() !== '') {
        amazonUpdates.push({ sku: product.amazon_sku, quantity });
        amazonUpdateMap[sku] = { sku: product.amazon_sku, quantity };
        updateResults[sku] = { shopify: updateResults[sku]?.shopify || null, amazon: null };
      }
    }
    
    // Bulk Amazon sync
    if (amazonUpdates.length > 0) {
      if (dryRun) {
        console.log(`DRY RUN: Would bulk update ${amazonUpdates.length} Amazon inventory items`);
        for (const update of amazonUpdates) {
          const shopifySku = Object.keys(amazonUpdateMap).find(key => amazonUpdateMap[key].sku === update.sku);
          if (shopifySku && updateResults[shopifySku]) {
            updateResults[shopifySku].amazon = { 
              success: true, 
              dryRun: true, 
              message: `Would update Amazon inventory for SKU ${update.sku} to ${update.quantity}` 
            };
          }
        }
      } else {
        try {
          console.log(`Starting bulk Amazon update for ${amazonUpdates.length} items...`);
          const bulkResult = await updateAmazonInventoryBulk(amazonUpdates);
          console.log(`Bulk Amazon update completed:`, bulkResult);
          
          // Mark all as successful initially (we'll handle individual failures if needed)
          for (const update of amazonUpdates) {
            const shopifySku = Object.keys(amazonUpdateMap).find(key => amazonUpdateMap[key].sku === update.sku);
            if (shopifySku && updateResults[shopifySku]) {
              updateResults[shopifySku].amazon = { success: true, method: bulkResult.method };
            }
          }
          
          // Log any errors
          if (!bulkResult.success && bulkResult.results) {
            console.error('Amazon bulk update errors:', bulkResult.results);
          }
        } catch (err: any) {
          console.error('Bulk Amazon update failed:', err.message);
          // Mark all as failed
          for (const update of amazonUpdates) {
            const shopifySku = Object.keys(amazonUpdateMap).find(key => amazonUpdateMap[key].sku === update.sku);
            if (shopifySku && updateResults[shopifySku]) {
              updateResults[shopifySku].amazon = { success: false, error: err.message };
            }
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