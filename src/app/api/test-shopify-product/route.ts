import { NextRequest, NextResponse } from 'next/server';
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
    
    console.log('Shopify GraphQL response:', JSON.stringify(response.data, null, 2));
    
    const products = response.data.data.products.edges;
    for (const productEdge of products) {
      console.log(`Found product: ${productEdge.node.title}`);
      for (const variantEdge of productEdge.node.variants.edges) {
        console.log(`Checking variant SKU: ${variantEdge.node.sku} vs ${sku}`);
        if (variantEdge.node.sku === sku) {
          return {
            variantId: variantEdge.node.id,
            inventoryItemId: variantEdge.node.inventoryItem.id,
          };
        }
      }
    }
  } catch (error: any) {
    console.error('Error querying Shopify:', error.response?.data || error.message);
  }
  
  return { variantId: null, inventoryItemId: null };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'IC-THIC-0010';
    
    console.log(`Testing Shopify product lookup for SKU: ${sku}`);
    
    const result = await getVariantAndInventoryItemIdBySku(sku);
    
    return NextResponse.json({
      success: true,
      sku,
      result,
      found: !!(result.variantId && result.inventoryItemId)
    });
    
  } catch (error) {
    console.error('Error in test:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
