import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { mappingService } from '../src/services/mapping';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-10';

const shopifyGraphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

// Interface for inventory update
interface InventoryUpdate {
  inventoryItemId: string;
  quantity: number;
  sku?: string; // For logging purposes
}

async function getVariantAndInventoryItemIdBySku(sku: string): Promise<{ variantId: string | null, inventoryItemId: string | null }> {
  const query = `
    query GetVariantAndInventoryBySku($sku: String!) {
      products(first: 1, query: $sku) {
        edges {
          node {
            variants(first: 10) {
              edges {
                node {
                  id
                  sku
                  inventoryItem {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const variables = { sku };
  const response = await axios.post(
    shopifyGraphqlUrl,
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
      },
    }
  );
  const products = response.data.data.products.edges;
  for (const productEdge of products) {
    for (const variantEdge of productEdge.node.variants.edges) {
      if (variantEdge.node.sku === sku) {
        return {
          variantId: variantEdge.node.id,
          inventoryItemId: variantEdge.node.inventoryItem.id,
        };
      }
    }
  }
  return { variantId: null, inventoryItemId: null };
}

let mantecaLocationId: string | null = null;

export async function getMantecaLocationId(): Promise<string> {
  if (mantecaLocationId) return mantecaLocationId;
  const url = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/locations.json`;
  const response = await axios.get(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
    },
  });
  const locations = response.data.locations;
  const manteca = locations.find((loc: any) => loc.name.toLowerCase() === 'manteca');
  if (!manteca) throw new Error('Manteca location not found in Shopify locations');
  mantecaLocationId = manteca.id.toString();
  return mantecaLocationId!;
}

function extractIdFromGid(gid: string): string {
  // e.g., gid://shopify/InventoryItem/53137749803317 -> 53137749803317
  return gid.split('/').pop() || gid;
}

// GraphQL bulk inventory update function (more efficient for large batches)
export async function updateShopifyInventoryBulk(updates: InventoryUpdate[]): Promise<{ success: number; failed: number; errors: string[] }> {
  if (!updates || updates.length === 0) {
    return { success: 0, failed: 0, errors: [] };
  }

  const locationId = await getMantecaLocationId();
  const results = { success: 0, failed: 0, errors: [] as string[] };

  console.log(`[Shopify Debug] Starting bulk update for ${updates.length} items using GraphQL`);

  // Process in batches of 50 (Shopify GraphQL limit)
  const BATCH_SIZE = 50;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    
    try {
      const batchResult = await updateShopifyInventoryBatch(batch, locationId);
      results.success += batchResult.success;
      results.failed += batchResult.failed;
      results.errors.push(...batchResult.errors);
      
      // Rate limiting: wait between batches
      if (i + BATCH_SIZE < updates.length) {
        await new Promise(resolve => setTimeout(resolve, 250)); // 4 req/sec
      }
    } catch (error: any) {
      console.error(`[Shopify Debug] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      results.failed += batch.length;
      results.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    }
  }

  console.log(`[Shopify Debug] Bulk update completed: ${results.success} successful, ${results.failed} failed`);
  return results;
}

async function updateShopifyInventoryBatch(updates: InventoryUpdate[], locationId: string): Promise<{ success: number; failed: number; errors: string[] }> {
  // Use the correct GraphQL mutation for bulk inventory adjustment
  const mutation = `
    mutation bulkInventoryAdjust($adjustments: [InventoryBulkAdjustQuantityAtLocationInput!]!) {
      inventoryBulkAdjustQuantityAtLocation(input: $adjustments) {
        inventoryLevels {
          id
          available
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Prepare the adjustments array
  const adjustments = updates.map(update => ({
    inventoryItemId: update.inventoryItemId,
    locationId: locationId,
    delta: update.quantity
  }));

  const variables = { adjustments };

  try {
    const response = await axios.post(
      shopifyGraphqlUrl,
      { query: mutation, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
        },
      }
    );

    // Check for GraphQL errors
    if (response.data.errors) {
      console.error('[Shopify Debug] GraphQL errors:', response.data.errors);
      return {
        success: 0,
        failed: updates.length,
        errors: response.data.errors.map((error: any) => error.message)
      };
    }

    // Check for user errors in the response
    if (response.data.data?.inventoryBulkAdjustQuantityAtLocation?.userErrors?.length > 0) {
      const userErrors = response.data.data.inventoryBulkAdjustQuantityAtLocation.userErrors;
      console.error('[Shopify Debug] User errors:', userErrors);
      return {
        success: 0,
        failed: updates.length,
        errors: userErrors.map((error: any) => error.message)
      };
    }

    // Check if we have inventory levels in the response
    const inventoryLevels = response.data.data?.inventoryBulkAdjustQuantityAtLocation?.inventoryLevels;
    if (!inventoryLevels || inventoryLevels.length === 0) {
      console.error('[Shopify Debug] No inventory levels returned');
      return {
        success: 0,
        failed: updates.length,
        errors: ['No inventory levels returned from GraphQL mutation']
      };
    }

    console.log(`[Shopify Debug] Batch processed successfully: ${inventoryLevels.length} inventory levels updated`);
    return {
      success: inventoryLevels.length,
      failed: 0,
      errors: []
    };

  } catch (error: any) {
    console.error('[Shopify Debug] GraphQL request failed:', error.response?.data || error.message);
    return {
      success: 0,
      failed: updates.length,
      errors: [error.response?.data?.errors?.[0]?.message || error.message]
    };
  }
}

// Keep the original function for backward compatibility
export async function updateShopifyInventory(inventoryItemId: string, available: number): Promise<void> {
  if (!inventoryItemId) throw new Error('inventoryItemId is required for updateShopifyInventory');
  const locationId = await getMantecaLocationId();
  const url = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/inventory_levels/set.json`;
  const payload = {
    location_id: locationId,
    inventory_item_id: extractIdFromGid(inventoryItemId),
    available,
  };
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
  };
  console.log('[Shopify Debug] Inventory Update URL:', url);
  console.log('[Shopify Debug] Payload:', JSON.stringify(payload));
  console.log('[Shopify Debug] Headers:', headers);
  try {
    await axios.post(url, payload, { headers });
  } catch (error: any) {
    console.error('[Shopify Debug] Error updating inventory:', error.response?.data || error.message);
    throw error;
  }
}

export async function enrichMappingWithShopifyVariantAndInventoryIds(): Promise<void> {
  // Get current mapping using the mapping service (fresh data, no cache)
  const { mapping, source } = await mappingService.getMappingFresh();
  console.log(`Enriching ${source} mapping data with Shopify IDs`);

  let updated = false;
  for (const product of mapping.products) {
    if (product.shopify_sku && (!product.shopify_variant_id || !product.shopify_inventory_item_id)) {
      const { variantId, inventoryItemId } = await getVariantAndInventoryItemIdBySku(product.shopify_sku);
      if (variantId) {
        product.shopify_variant_id = variantId;
        updated = true;
      }
      if (inventoryItemId) {
        product.shopify_inventory_item_id = inventoryItemId;
        updated = true;
      }
    }
    if (Array.isArray(product.bundle_components)) {
      // Bundles themselves should have shopify_sku and IDs at the top level
      continue;
    }
  }
  
  if (updated) {
    const result = await mappingService.updateMapping(mapping, 'shopify_service');
    if (result.success) {
      console.log(`Mapping updated with Shopify variant and inventory item IDs in ${source}`);
    } else {
      console.error('Failed to update mapping:', result.error);
    }
  }
} 