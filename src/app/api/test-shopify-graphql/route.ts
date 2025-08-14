import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';

const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-10';

const shopifyGraphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

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
    const sku = url.searchParams.get('sku') || 'IC-HCPK--96';
    
    console.log(`Testing Shopify GraphQL for SKU: ${sku}`);
    
    // Get mapping and inventory data
    const { mapping } = await mappingService.getMappingFresh();
    const product = mapping.products.find((p: any) => p.shopify_sku === sku);
    
    if (!product || !product.shopify_inventory_item_id) {
      return NextResponse.json({
        success: false,
        error: `No Shopify inventory item ID found for SKU: ${sku}`
      });
    }
    
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === sku);
    const quantity = inventoryRecord?.quantity || 0;
    
    console.log(`Testing with quantity: ${quantity}`);
    
    // Get location ID
    const locationId = await getMantecaLocationId();
    console.log(`Manteca location ID: ${locationId}`);
    
    // Test the GraphQL mutation
    const mutation = `
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const variables = {
      input: {
        quantities: [{
          inventoryItemId: product.shopify_inventory_item_id,
          locationId: `gid://shopify/Location/${locationId}`,
          quantity: quantity
        }],
        reason: "correction",
        name: "available",
        ignoreCompareQuantity: true
      }
    };
    
    console.log('GraphQL variables:', JSON.stringify(variables, null, 2));
    
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
    
    console.log('GraphQL response:', JSON.stringify(response.data, null, 2));
    
    // Check for errors
    if (response.data.errors) {
      return NextResponse.json({
        success: false,
        error: 'GraphQL errors',
        errors: response.data.errors
      });
    }
    
    const result = response.data.data?.inventorySetQuantities;
    if (result?.userErrors?.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'User errors',
        userErrors: result.userErrors
      });
    }
    
    // Now let's verify the inventory was actually updated by checking current inventory
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
    
    console.log('Inventory check response:', JSON.stringify(checkResponse.data, null, 2));
    
    const currentInventory = checkResponse.data.data?.inventoryLevel?.available;
    
    return NextResponse.json({
      success: true,
      sku,
      quantityAttempted: quantity,
      currentInventoryInShopify: currentInventory,
      inventoryUpdated: currentInventory === quantity,
      testData: {
        shopify_inventory_item_id: product.shopify_inventory_item_id,
        location_id: locationId,
        graphqlResponse: response.data,
        inventoryCheckResponse: checkResponse.data
      }
    });
    
  } catch (error: any) {
    console.error('Error in GraphQL test:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      response: error.response?.data
    });
  }
}
