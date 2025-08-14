import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const { sku } = await request.json();
    
    console.log(`Testing specific SKU: ${sku}`);
    
    // Get mapping and inventory data
    const { mapping } = await mappingService.getMapping();
    const product = mapping.products.find((p: any) => 
      p.flowtrac_sku === sku || p.shopify_sku === sku
    );
    
    if (!product) {
      return NextResponse.json({
        success: false,
        error: `Product not found in mapping for SKU: ${sku}`
      });
    }
    
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === sku);
    const databaseQuantity = inventoryRecord?.quantity || 0;
    
    console.log(`Database quantity for ${sku}: ${databaseQuantity}`);
    
    if (!product.shopify_inventory_item_id) {
      return NextResponse.json({
        success: false,
        error: `No shopify_inventory_item_id for SKU ${sku}`
      });
    }
    
    // Check current Shopify inventory BEFORE update
    const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
    const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
    const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
    const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
    const shopifyGraphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

    const locationId = '101557567797'; // Hardcoded Manteca location
    const checkUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/inventory_levels.json?inventory_item_ids=${product.shopify_inventory_item_id.split('/').pop()}&location_ids=${locationId}`;
    
    const checkResponse = await axios.get(checkUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
      },
    });
    
    const currentQuantity = checkResponse.data.inventory_levels?.[0]?.available || 0;
    console.log(`Current Shopify quantity for ${sku}: ${currentQuantity}`);
    
    // Only update if quantities are different
    if (currentQuantity === databaseQuantity) {
      return NextResponse.json({
        success: true,
        sku,
        message: `Quantities are already the same (${currentQuantity}), no update needed`,
        databaseQuantity,
        currentQuantity,
        locationId
      });
    }
    
    // Try a more explicit GraphQL mutation
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
          quantity: databaseQuantity
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
        graphqlErrors: response.data.errors
      });
    }

    const result = response.data.data?.inventorySetQuantities;
    if (result?.userErrors?.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'User errors in GraphQL response',
        userErrors: result.userErrors
      });
    }

    // Wait a moment and check if the quantity actually changed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const finalCheckResponse = await axios.get(checkUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
      },
    });
    
    const finalQuantity = finalCheckResponse.data.inventory_levels?.[0]?.available || 0;
    
    return NextResponse.json({
      success: true,
      sku,
      mappingInfo: {
        flowtrac_sku: product.flowtrac_sku,
        shopify_sku: product.shopify_sku,
        shopify_inventory_item_id: product.shopify_inventory_item_id,
        product_name: product.product_name || ''
      },
      inventoryInfo: {
        database_quantity: databaseQuantity,
        warehouse: 'Manteca',
        last_updated: inventoryRecord?.last_updated
      },
      shopifyInfo: {
        location_id: locationId,
        location_gid: `gid://shopify/Location/${locationId}`,
        current_quantity_before: currentQuantity,
        current_quantity_after: finalQuantity,
        quantity_changed: finalQuantity !== currentQuantity,
        expected_quantity: databaseQuantity,
        update_successful: finalQuantity === databaseQuantity
      },
      graphqlInfo: {
        mutation,
        variables,
        response: response.data,
        success: true,
        userErrors: result?.userErrors || []
      },
      analysis: {
        should_update: product.shopify_inventory_item_id,
        quantity_mismatch: currentQuantity !== databaseQuantity,
        graphql_success: true,
        using_correct_location: true,
        actual_update_successful: finalQuantity === databaseQuantity
      }
    });

  } catch (error: any) {
    console.error('Error in test:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
