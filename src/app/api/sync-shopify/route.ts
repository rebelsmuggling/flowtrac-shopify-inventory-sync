import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { updateShopifyInventory, updateShopifyInventoryBulk, enrichMappingWithShopifyVariantAndInventoryIds, getMantecaLocationId } from '../../../../services/shopify';
import axios from 'axios';

const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-10';

const shopifyGraphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

// Helper function to get current Shopify inventory for verification
async function getShopifyInventoryLevel(sku: string): Promise<number | null> {
  try {
    // This would need to be implemented in the Shopify service
    // For now, we'll return null and add this functionality later
    return null;
  } catch (error) {
    console.error(`Failed to get Shopify inventory for ${sku}:`, error);
    return null;
  }
}

// Function to verify that inventory updates were actually set in Shopify
async function verifyShopifyInventoryUpdates(updates: Array<{ inventoryItemId: string; quantity: number; sku: string }>, locationId: string): Promise<Array<{ sku: string; expectedQuantity: number; actualQuantity: number; locationName: string }>> {
  const verificationResults: Array<{ sku: string; expectedQuantity: number; actualQuantity: number; locationName: string }> = [];
  
  console.log(`Starting verification for ${updates.length} items...`);
  
  // Limit verification to last 50 items to prevent timeouts
  const itemsToVerify = updates.slice(-50);
  console.log(`Verifying last ${itemsToVerify.length} items to prevent timeout...`);
  
  // Process verification one by one to avoid GraphQL complexity issues
  for (const update of itemsToVerify) {
    try {
      // Query individual inventory item
      const query = `
        query GetInventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
          inventoryItem(id: $inventoryItemId) {
            id
            sku
            inventoryLevel(locationId: $locationId) {
              id
              available
              location {
                id
                name
              }
            }
          }
        }
      `;
      
      const variables = {
        inventoryItemId: update.inventoryItemId,
        locationId: `gid://shopify/Location/${locationId}`
      };
      
      const response = await axios.post(
        shopifyGraphqlUrl,
        { query, variables },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
          },
          timeout: 10000, // Reduced timeout to 10 seconds per request
        }
      );
      
      const inventoryItem = response.data.data?.inventoryItem;
      
      if (inventoryItem) {
        const actualQuantity = inventoryItem.inventoryLevel?.available || 0;
        const locationName = inventoryItem.inventoryLevel?.location?.name || 'Unknown';
        
        verificationResults.push({
          sku: update.sku,
          expectedQuantity: update.quantity,
          actualQuantity: actualQuantity,
          locationName: locationName
        });
        
        if (actualQuantity !== update.quantity) {
          console.warn(`⚠️ Verification failed for ${update.sku}: expected ${update.quantity}, got ${actualQuantity}`);
        } else {
          console.log(`✅ Verification successful for ${update.sku}: ${actualQuantity}`);
        }
      } else {
        console.error(`❌ No inventory item found for ${update.sku}`);
        verificationResults.push({
          sku: update.sku,
          expectedQuantity: update.quantity,
          actualQuantity: -1,
          locationName: 'Item Not Found'
        });
      }
      
      // Small delay between queries to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error: any) {
      console.error(`Verification failed for ${update.sku}:`, error.message);
      verificationResults.push({
        sku: update.sku,
        expectedQuantity: update.quantity,
        actualQuantity: -1,
        locationName: 'Verification Failed'
      });
    }
  }
  
  console.log(`Verification completed for ${verificationResults.length} items`);
  return verificationResults;
}

export async function POST(request: NextRequest) {
  try {
    console.log('Shopify-only sync started');
    
    // 1. Load mapping
    const { mapping } = await mappingService.getMappingFresh();
    
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

    // 4. Self-heal: Enrich mapping with missing Shopify variant and inventory item IDs
    await enrichMappingWithShopifyVariantAndInventoryIds();
    
    // Reload mapping after enrichment using the mapping service (fresh data, no cache)
    const { mapping: updatedMapping } = await mappingService.getMappingFresh();
    
    // Get location ID for verification
    const locationId = await getMantecaLocationId();
    
    // 5. Build shopifyInventory map (simple and bundle SKUs) - same logic as main sync
    const shopifyInventory: Record<string, number> = {};
    for (const product of updatedMapping.products) {
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

    // 6. Prepare Shopify bulk updates
    const shopifyUpdates: Array<{ inventoryItemId: string; quantity: number; sku: string }> = [];
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[],
      updates: [] as any[],
      summary: {
        startTime: new Date().toISOString(),
        endTime: null as string | null,
        totalProcessingTime: 0,
        averageTimePerProduct: 0,
        productsWithChanges: 0,
        productsUnchanged: 0
      }
    };
    
    const startTime = Date.now();
    
    // Collect all Shopify updates (including 0 quantities)
    for (const [sku, quantity] of Object.entries(shopifyInventory)) {
      const product = updatedMapping.products.find((p: any) => p.shopify_sku === sku);
      const inventoryItemId = product?.shopify_inventory_item_id;
      results.total++;
      
      if (!inventoryItemId) {
        results.failed++;
        const errorMessage = `No shopify_inventory_item_id for SKU ${sku}`;
        results.errors.push(errorMessage);
        console.error(`❌ ${errorMessage}`);
      } else {
        // Include ALL items, including those with 0 quantity
        shopifyUpdates.push({ inventoryItemId, quantity, sku });
        if (quantity === 0) {
          console.log(`📦 Setting ${sku} to 0 quantity (out of stock)`);
        }
      }
    }
    
    // 7. Bulk Shopify sync
    if (shopifyUpdates.length > 0) {
      try {
        console.log(`Starting bulk Shopify update for ${shopifyUpdates.length} items...`);
        const bulkResult = await updateShopifyInventoryBulk(shopifyUpdates);
        console.log(`Bulk Shopify update completed: ${bulkResult.success} successful, ${bulkResult.failed} failed`);
        
        // Mark successful updates
        results.successful = bulkResult.success;
        results.failed += bulkResult.failed;
        
        // Verify that quantities were actually set in Shopify
        console.log('Verifying inventory updates...');
        let verificationResults: Array<{ sku: string; expectedQuantity: number; actualQuantity: number; locationName: string }> = [];
        
        try {
          verificationResults = await verifyShopifyInventoryUpdates(shopifyUpdates, locationId);
        } catch (verificationError) {
          console.error('Verification failed:', verificationError);
          // Create empty verification results to prevent the sync from failing
          verificationResults = shopifyUpdates.map(update => ({
            sku: update.sku,
            expectedQuantity: update.quantity,
            actualQuantity: -1,
            locationName: 'Verification Failed'
          }));
        }
        
        // Add successful updates to results with verification
        for (const update of shopifyUpdates) {
          const product = updatedMapping.products.find((p: any) => p.shopify_sku === update.sku);
          const verification = verificationResults.find((v: any) => v.sku === update.sku);
          
          results.updates.push({
            sku: update.sku,
            flowtrac_sku: product?.flowtrac_sku,
            quantity: update.quantity,
            previousQuantity: null, // We don't have previous quantities in bulk mode
            quantityChanged: null,
            type: product?.bundle_components ? 'Bundle' : 'Simple',
            processingTime: 0, // Bulk processing time is not per-item
            timestamp: new Date().toISOString(),
            verification: verification ? {
              actualQuantity: verification.actualQuantity,
              updateSuccessful: verification.actualQuantity === update.quantity,
              locationName: verification.locationName
            } : {
              actualQuantity: -1,
              updateSuccessful: null,
              locationName: 'Not Verified (Limited to last 50 items)'
            }
          });
        }
        
        // Log verification summary
        const successfulUpdates = verificationResults.filter((v: any) => v.actualQuantity === v.expectedQuantity).length;
        const failedUpdates = verificationResults.length - successfulUpdates;
        console.log(`Verification complete: ${successfulUpdates} successful, ${failedUpdates} failed`);
        
        if (failedUpdates > 0) {
          const failedSkus = verificationResults
            .filter((v: any) => v.actualQuantity !== v.expectedQuantity)
            .map((v: any) => `${v.sku} (expected: ${v.expectedQuantity}, actual: ${v.actualQuantity})`);
          console.error('Failed verifications:', failedSkus);
        }
        
        // Log any errors
        if (bulkResult.errors.length > 0) {
          console.error('Shopify bulk update errors:', bulkResult.errors);
          results.errors.push(...bulkResult.errors);
        }
        
      } catch (err: any) {
        console.error('Bulk Shopify update failed:', err.message);
        results.failed = shopifyUpdates.length;
        results.errors.push(`Bulk update failed: ${err.message}`);
      }
    }
    
    const endTime = Date.now();
    const totalProcessingTime = endTime - startTime;
    
    // Calculate final summary
    results.summary.endTime = new Date().toISOString();
    results.summary.totalProcessingTime = totalProcessingTime;
    results.summary.averageTimePerProduct = results.total > 0 ? Math.round(totalProcessingTime / results.total) : 0;
    
    console.log(`Shopify sync completed: ${results.successful}/${results.total} successful in ${totalProcessingTime}ms`);
    console.log(`Summary: ${results.summary.productsWithChanges} changed, ${results.summary.productsUnchanged} unchanged`);
    
    return NextResponse.json({
      success: true,
      message: `Shopify sync completed: ${results.successful}/${results.total} products updated successfully`,
      results: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        successRate: Math.round((results.successful / results.total) * 100),
        errors: results.errors,
        updates: results.updates,
        summary: results.summary,
        inventoryChanges: {
          productsWithChanges: results.summary.productsWithChanges,
          productsUnchanged: results.summary.productsUnchanged,
          changePercentage: results.summary.productsWithChanges > 0 ? 
            Math.round((results.summary.productsWithChanges / results.successful) * 100) : 0
        }
      }
    });
    
  } catch (error) {
    console.error('Shopify sync failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
