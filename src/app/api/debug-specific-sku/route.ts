import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';
import axios from 'axios';

function extractIdFromGid(gid: string): string {
  // e.g., gid://shopify/InventoryItem/53137749803317 -> 53137749803317
  return gid.split('/').pop() || gid;
}

const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-10';

async function getMantecaLocationId(): Promise<string> {
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
  return manteca.id.toString();
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'IC-FRSO-00C';
    
    console.log(`Debugging specific SKU: ${sku}`);
    
    // Get mapping data
    const { mapping } = await mappingService.getMappingFresh();
    const product = mapping.products.find((p: any) => p.shopify_sku === sku);
    
    if (!product) {
      return NextResponse.json({
        success: false,
        error: `Product not found in mapping for SKU: ${sku}`
      });
    }
    
    // Get inventory from database
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === sku);
    const quantity = inventoryRecord?.quantity || 0;
    
    // Get location ID
    const locationId = await getMantecaLocationId();
    
    // Check current inventory in Shopify
    const checkQuery = `
      query GetInventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
        inventoryLevel(inventoryItemId: $inventoryItemId, locationId: $locationId) {
          id
          available
          item {
            id
            sku
          }
        }
      }
    `;
    
    const checkVariables = {
      inventoryItemId: product.shopify_inventory_item_id,
      locationId: `gid://shopify/Location/${locationId}`
    };
    
    const shopifyGraphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    
    let currentShopifyInventory = null;
    let shopifyError = null;
    
    try {
      const checkResponse = await axios.post(
        shopifyGraphqlUrl,
        { query: checkQuery, variables: checkVariables },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
          },
        }
      );
      
      currentShopifyInventory = checkResponse.data.data?.inventoryLevel?.available;
      
    } catch (error: any) {
      shopifyError = error.response?.data || error.message;
    }
    
    // Test the exact update that would be sent
    const testMutation = `
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const testVariables = {
      input: {
        quantities: [{
          inventoryItemId: extractIdFromGid(product.shopify_inventory_item_id),
          locationId: `gid://shopify/Location/${locationId}`,
          quantity: quantity
        }],
        reason: "correction",
        name: "available",
        ignoreCompareQuantity: true
      }
    };
    
    let testResult = null;
    let testError = null;
    
    try {
      const testResponse = await axios.post(
        shopifyGraphqlUrl,
        { query: testMutation, variables: testVariables },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
          },
        }
      );
      
      testResult = testResponse.data;
      
    } catch (error: any) {
      testError = error.response?.data || error.message;
    }
    
    // Check inventory again after test update
    let updatedShopifyInventory = null;
    
    if (!testError) {
      try {
        const updatedCheckResponse = await axios.post(
          shopifyGraphqlUrl,
          { query: checkQuery, variables: checkVariables },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
            },
          }
        );
        
        updatedShopifyInventory = updatedCheckResponse.data.data?.inventoryLevel?.available;
        
      } catch (error: any) {
        // Ignore this error
      }
    }
    
    return NextResponse.json({
      success: true,
      sku,
      mappingData: {
        shopify_sku: product.shopify_sku,
        shopify_inventory_item_id: product.shopify_inventory_item_id,
        shopify_variant_id: product.shopify_variant_id,
        product_name: product.product_name
      },
      inventoryData: {
        databaseQuantity: quantity,
        warehouse: inventoryRecord?.warehouse,
        bins: inventoryRecord?.bins,
        lastUpdated: inventoryRecord?.last_updated
      },
      shopifyData: {
        locationId,
        currentInventory: currentShopifyInventory,
        updatedInventory: updatedShopifyInventory,
        inventoryChanged: currentShopifyInventory !== updatedShopifyInventory
      },
      testUpdate: {
        variables: testVariables,
        result: testResult,
        error: testError
      },
      shopifyCheckError: shopifyError,
      analysis: {
        hasInventoryItemId: !!(product.shopify_inventory_item_id),
        hasPositiveQuantity: quantity > 0,
        updateShouldWork: !!(product.shopify_inventory_item_id && quantity > 0),
        inventoryActuallyChanged: currentShopifyInventory !== updatedShopifyInventory
      }
    });
    
  } catch (error) {
    console.error('Error debugging specific SKU:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
