import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import axios from 'axios';

const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-10';

const shopifyGraphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

async function getVariantAndInventoryItemIdBySku(sku: string): Promise<{ variantId: string | null, inventoryItemId: string | null }> {
  const query = `
    query GetVariantAndInventoryBySku($sku: String!) {
      products(first: 1, query: $sku) {
        edges {
          node {
            id
            title
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
  
  try {
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
  } catch (error: any) {
    console.error(`Error querying Shopify for SKU ${sku}:`, error.response?.data || error.message);
  }
  
  return { variantId: null, inventoryItemId: null };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const dryRun = body.dryRun !== false; // Default to true for safety
    
    console.log(`Starting comprehensive Shopify ID enrichment (dry run: ${dryRun})`);
    
    // Get current mapping using the mapping service (fresh data, no cache)
    const { mapping, source } = await mappingService.getMappingFresh();
    console.log(`Using ${source} mapping data`);
    
    const results = {
      totalProducts: mapping.products.length,
      productsWithShopifySku: 0,
      productsWithInventoryItemId: 0,
      productsNeedingEnrichment: 0,
      productsEnriched: 0,
      productsFailed: 0,
      errors: [] as string[],
      enrichedProducts: [] as any[]
    };
    
    let updated = false;
    
    for (const product of mapping.products) {
      if (product.shopify_sku) {
        results.productsWithShopifySku++;
        
        if (product.shopify_inventory_item_id) {
          results.productsWithInventoryItemId++;
        } else {
          results.productsNeedingEnrichment++;
          
          if (!dryRun) {
            console.log(`Enriching SKU: ${product.shopify_sku}`);
            
            try {
              const { variantId, inventoryItemId } = await getVariantAndInventoryItemIdBySku(product.shopify_sku);
              
              if (variantId) {
                product.shopify_variant_id = variantId;
                updated = true;
              }
              
              if (inventoryItemId) {
                product.shopify_inventory_item_id = inventoryItemId;
                updated = true;
                
                results.productsEnriched++;
                results.enrichedProducts.push({
                  sku: product.shopify_sku,
                  product_name: product.product_name,
                  inventory_item_id: inventoryItemId
                });
                
                console.log(`✅ Enriched ${product.shopify_sku} with inventory item ID: ${inventoryItemId}`);
              } else {
                results.productsFailed++;
                results.errors.push(`No inventory item ID found for SKU: ${product.shopify_sku}`);
                console.log(`❌ No inventory item ID found for SKU: ${product.shopify_sku}`);
              }
              
              // Rate limiting: wait between requests
              await new Promise(resolve => setTimeout(resolve, 100));
              
            } catch (error: any) {
              results.productsFailed++;
              results.errors.push(`Error enriching ${product.shopify_sku}: ${error.message}`);
              console.error(`Error enriching ${product.shopify_sku}:`, error.message);
            }
          } else {
            // Dry run - just count what would be enriched
            results.enrichedProducts.push({
              sku: product.shopify_sku,
              product_name: product.product_name,
              would_be_enriched: true
            });
          }
        }
      }
    }
    
    if (updated && !dryRun) {
      console.log('Saving enriched mapping to database...');
      const result = await mappingService.updateMapping(mapping, 'comprehensive_shopify_enrichment');
      if (result.success) {
        console.log(`✅ Mapping updated with ${results.productsEnriched} new Shopify inventory item IDs`);
      } else {
        console.error('❌ Failed to update mapping:', result.error);
        results.errors.push(`Failed to save mapping: ${result.error}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      dryRun,
      results,
      message: dryRun 
        ? `Dry run completed. ${results.productsNeedingEnrichment} products would be enriched.`
        : `Enrichment completed. ${results.productsEnriched} products enriched.`
    });
    
  } catch (error) {
    console.error('Error in comprehensive enrichment:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
