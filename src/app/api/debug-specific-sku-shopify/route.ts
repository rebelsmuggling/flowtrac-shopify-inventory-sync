import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'IC-RBBE-0002';
    
    console.log(`Debugging specific SKU Shopify sync: ${sku}`);
    
    // Get fresh mapping data
    const { mapping, source } = await mappingService.getMapping();
    
    // Find the product in mapping
    const product = mapping.products.find(p => 
      p.flowtrac_sku === sku || p.shopify_sku === sku
    );
    
    if (!product) {
      return NextResponse.json({
        success: false,
        error: `Product not found in mapping for SKU: ${sku}`
      });
    }
    
    // Get inventory from database
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === sku);
    
    if (!inventoryRecord) {
      return NextResponse.json({
        success: false,
        error: `Inventory not found in database for SKU: ${sku}`
      });
    }
    
    // Check current Shopify inventory
    const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
    const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
    const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
    
    if (!SHOPIFY_API_KEY || !SHOPIFY_API_PASSWORD || !SHOPIFY_STORE_URL) {
      return NextResponse.json({
        success: false,
        error: 'Shopify credentials not configured'
      });
    }
    
    // Get current Shopify inventory
    const shopifyInventoryUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${product.shopify_inventory_item_id?.split('/').pop()}`;
    
    const shopifyInventoryResponse = await fetch(shopifyInventoryUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const shopifyInventoryData = await shopifyInventoryResponse.json();
    const currentShopifyQuantity = shopifyInventoryData.inventory_levels?.[0]?.available || 0;
    const shopifyLocationId = shopifyInventoryData.inventory_levels?.[0]?.location_id;
    
    // Prepare the exact GraphQL mutation that would be sent
    const graphqlMutation = `
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const graphqlVariables = {
      input: {
        quantities: [
          {
            inventoryItemId: product.shopify_inventory_item_id,
            locationId: `gid://shopify/Location/${shopifyLocationId}`,
            quantity: inventoryRecord.quantity
          }
        ],
        reason: "correction",
        name: "available",
        ignoreCompareQuantity: true
      }
    };
    
    // Perform the actual GraphQL update
    const graphqlResponse = await fetch(`https://${SHOPIFY_STORE_URL}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD
      },
      body: JSON.stringify({
        query: graphqlMutation,
        variables: graphqlVariables
      })
    });
    
    const graphqlResult = await graphqlResponse.json();
    
    // Check Shopify inventory again after update
    const shopifyInventoryResponseAfter = await fetch(shopifyInventoryUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const shopifyInventoryDataAfter = await shopifyInventoryResponseAfter.json();
    const newShopifyQuantity = shopifyInventoryDataAfter.inventory_levels?.[0]?.available || 0;
    
    return NextResponse.json({
      success: true,
      sku,
      mappingInfo: {
        flowtrac_sku: product.flowtrac_sku,
        shopify_sku: product.shopify_sku,
        shopify_inventory_item_id: product.shopify_inventory_item_id,
        product_name: product.product_name
      },
      inventoryInfo: {
        database_quantity: inventoryRecord.quantity,
        warehouse: inventoryRecord.warehouse,
        last_updated: inventoryRecord.last_updated
      },
      shopifyInfo: {
        location_id: shopifyLocationId,
        current_quantity_before: currentShopifyQuantity,
        current_quantity_after: newShopifyQuantity,
        quantity_changed: newShopifyQuantity !== currentShopifyQuantity
      },
      graphqlInfo: {
        mutation: graphqlMutation,
        variables: graphqlVariables,
        response: graphqlResult,
        success: !graphqlResult.errors && !graphqlResult.data?.inventorySetQuantities?.userErrors?.length,
        userErrors: graphqlResult.data?.inventorySetQuantities?.userErrors || []
      },
      analysis: {
        should_update: inventoryRecord.quantity > 0 && product.shopify_inventory_item_id,
        quantity_mismatch: newShopifyQuantity !== inventoryRecord.quantity,
        graphql_success: !graphqlResult.errors && !graphqlResult.data?.inventorySetQuantities?.userErrors?.length
      }
    });
    
  } catch (error) {
    console.error('Error debugging specific SKU Shopify sync:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
