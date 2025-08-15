import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getMantecaLocationId } from '../../../../services/shopify';
import axios from 'axios';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-10';

const shopifyGraphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sku = body.sku;
    
    if (!sku) {
      return NextResponse.json({
        success: false,
        error: 'SKU is required'
      });
    }
    
    console.log(`Debugging Shopify SKU: ${sku}`);
    
    // 1. Get mapping for this SKU
    const { mapping } = await mappingService.getMappingFresh();
    const product = mapping.products.find((p: any) => p.shopify_sku === sku);
    
    if (!product) {
      return NextResponse.json({
        success: false,
        error: `SKU ${sku} not found in mapping`
      });
    }
    
    // 2. Get current inventory levels from Shopify
    const locationId = await getMantecaLocationId();
    
    const query = `
      query GetInventoryLevels($inventoryItemId: ID!, $locationId: ID!) {
        inventoryItem(id: $inventoryItemId) {
          id
          sku
          inventoryLevel(locationId: $locationId) {
            id
            available
            incoming
            committed
            location {
              id
              name
            }
          }
        }
      }
    `;
    
    const variables = {
      inventoryItemId: product.shopify_inventory_item_id,
      locationId: `gid://shopify/Location/${locationId}`
    };
    
    console.log('GraphQL variables:', JSON.stringify(variables, null, 2));
    
    const response = await axios.post(
      shopifyGraphqlUrl,
      { query, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
        },
        timeout: 30000,
      }
    );
    
    console.log('GraphQL response:', JSON.stringify(response.data, null, 2));
    
    const inventoryData = response.data.data?.inventoryItem;
    
    return NextResponse.json({
      success: true,
      sku: sku,
      mapping: {
        shopify_sku: product.shopify_sku,
        flowtrac_sku: product.flowtrac_sku,
        shopify_inventory_item_id: product.shopify_inventory_item_id,
        type: product.bundle_components ? 'Bundle' : 'Simple'
      },
      location: {
        id: locationId,
        gid: `gid://shopify/Location/${locationId}`
      },
      shopify_inventory: inventoryData ? {
        inventory_item_id: inventoryData.id,
        sku: inventoryData.sku,
        available: inventoryData.inventoryLevel?.available || 0,
        incoming: inventoryData.inventoryLevel?.incoming || 0,
        committed: inventoryData.inventoryLevel?.committed || 0,
        location_name: inventoryData.inventoryLevel?.location?.name || 'Unknown'
      } : null,
      debug_info: {
        query: query,
        variables: variables,
        response_status: response.status,
        has_errors: !!response.data.errors,
        errors: response.data.errors || []
      }
    });
    
  } catch (error: any) {
    console.error('Debug Shopify SKU failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    }, { status: 500 });
  }
}
