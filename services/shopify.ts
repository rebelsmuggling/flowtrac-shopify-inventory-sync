import axios from 'axios';
import fs from 'fs';
import path from 'path';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-10';

const mappingPath = path.join(process.cwd(), 'mapping.json');

const shopifyGraphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

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
  // Get current mapping (imported or file)
  let mapping;
  try {
    const { getImportedMapping, setImportedMapping } = await import('../src/utils/imported-mapping-store');
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Enriching imported mapping data with Shopify IDs');
      mapping = importedMapping;
    } else {
      console.log('Enriching file mapping data with Shopify IDs');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }
  } catch (error) {
    console.log('Using file mapping data (imported mapping not available)');
    mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  }

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
    try {
      const { getImportedMapping, setImportedMapping } = await import('../src/utils/imported-mapping-store');
      const importedMapping = getImportedMapping();
      
      if (importedMapping) {
        setImportedMapping(mapping);
        console.log('Imported mapping updated with Shopify variant and inventory item IDs.');
      } else {
        fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
        console.log('mapping.json updated with Shopify variant and inventory item IDs.');
      }
    } catch (error) {
      // Fallback to file system
      fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
      console.log('mapping.json updated with Shopify variant and inventory item IDs.');
    }
  }
} 