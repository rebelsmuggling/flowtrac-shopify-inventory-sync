import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';
import axios from 'axios';

function extractIdFromGid(gid: string): string {
  return gid.split('/').pop() || gid;
}

export async function POST(request: NextRequest) {
  try {
    const { sku } = await request.json();
    
    console.log(`Testing specific SKU: ${sku}`);
    
    // Get mapping and inventory data (fresh from database)
    const { mapping } = await mappingService.getMappingFresh();
    const product = mapping.products.find((p: any) => 
      p.flowtrac_sku === sku || p.shopify_sku === sku || p.amazon_sku === sku
    );
    
    if (!product) {
      return NextResponse.json({
        success: false,
        error: `Product not found in mapping for SKU: ${sku}`
      });
    }
    
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    const inventoryRecord = inventoryResult.data?.find((record: any) => record.sku === sku);
    let databaseQuantity = inventoryRecord?.quantity || 0;
    
    // Handle bundle SKUs - calculate quantity based on component availability
    if (Array.isArray(product.bundle_components) && product.bundle_components.length > 0) {
      console.log(`Bundle SKU detected: ${sku} with ${product.bundle_components.length} components`);
      
      // Get all component SKUs
      const componentSkus = product.bundle_components.map((comp: any) => comp.flowtrac_sku).filter(Boolean);
      
      if (componentSkus.length > 0) {
        // Get inventory for all component SKUs
        const componentInventoryResult = await getFlowtracInventory(componentSkus, 'Manteca');
        
        if (componentInventoryResult.success && componentInventoryResult.data) {
          // Calculate bundle quantity based on component availability
          const quantities = product.bundle_components.map((comp: any) => {
            const componentRecord = componentInventoryResult.data?.find((record: any) => record.sku === comp.flowtrac_sku);
            const available = componentRecord?.quantity || 0;
            const possibleBundles = Math.floor(available / comp.quantity);
            console.log(`Component ${comp.flowtrac_sku}: available=${available}, required=${comp.quantity}, possible=${possibleBundles}`);
            return possibleBundles;
          });
          
          databaseQuantity = quantities.length > 0 ? Math.min(...quantities) : 0;
          console.log(`Calculated bundle quantity for ${sku}: ${databaseQuantity} (from ${quantities.join(', ')})`);
        }
      }
      
      // Check if bundle has shopify_inventory_item_id
      if (!product.shopify_inventory_item_id) {
        return NextResponse.json({
          success: true,
          sku,
          message: `Bundle SKU ${sku} has no shopify_inventory_item_id - cannot update in Shopify`,
          bundleInfo: {
            componentCount: product.bundle_components.length,
            components: product.bundle_components,
            calculatedQuantity: databaseQuantity,
            hasShopifyId: false
          },
          databaseQuantity,
          currentQuantity: 0
        });
      }
    }
    
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

    // Try different variations of the variables
    const variableVariations = [
      {
        name: "Standard with ignoreCompareQuantity",
        variables: {
          input: {
            quantities: [{
              inventoryItemId: extractIdFromGid(product.shopify_inventory_item_id),
              locationId: `gid://shopify/Location/${locationId}`,
              quantity: databaseQuantity
            }],
            reason: "correction",
            name: "available",
            ignoreCompareQuantity: true
          }
        }
      },
      {
        name: "Without ignoreCompareQuantity",
        variables: {
          input: {
            quantities: [{
              inventoryItemId: extractIdFromGid(product.shopify_inventory_item_id),
              locationId: `gid://shopify/Location/${locationId}`,
              quantity: databaseQuantity
            }],
            reason: "correction",
            name: "available"
          }
        }
      },
      {
        name: "With different reason",
        variables: {
          input: {
            quantities: [{
              inventoryItemId: extractIdFromGid(product.shopify_inventory_item_id),
              locationId: `gid://shopify/Location/${locationId}`,
              quantity: databaseQuantity
            }],
            reason: "inventory_adjustment",
            name: "available",
            ignoreCompareQuantity: true
          }
        }
      }
    ];

    let successfulVariation = null;
    let finalQuantity = currentQuantity;

    for (const variation of variableVariations) {
      console.log(`Trying variation: ${variation.name}`);
      console.log('GraphQL variables:', JSON.stringify(variation.variables, null, 2));

      try {
        const response = await axios.post(
          shopifyGraphqlUrl,
          { query: mutation, variables: variation.variables },
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
          console.log(`Variation ${variation.name} failed with GraphQL errors:`, response.data.errors);
          continue;
        }

        const result = response.data.data?.inventorySetQuantities;
        if (result?.userErrors?.length > 0) {
          console.log(`Variation ${variation.name} failed with user errors:`, result.userErrors);
          continue;
        }

        // Wait a moment and check if the quantity actually changed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const checkResponse = await axios.get(checkUrl, {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_API_PASSWORD,
          },
        });
        
        const newQuantity = checkResponse.data.inventory_levels?.[0]?.available || 0;
        
        if (newQuantity === databaseQuantity) {
          console.log(`✅ Variation ${variation.name} SUCCESSFULLY updated quantity to ${newQuantity}`);
          successfulVariation = variation;
          finalQuantity = newQuantity;
          break;
        } else {
          console.log(`❌ Variation ${variation.name} did not update quantity (got ${newQuantity}, expected ${databaseQuantity})`);
        }
      } catch (error: any) {
        console.log(`Variation ${variation.name} failed with error:`, error.message);
      }
    }
    
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
        successfulVariation: successfulVariation ? {
          name: successfulVariation.name,
          variables: successfulVariation.variables
        } : null,
        allVariationsTested: variableVariations.map(v => v.name)
      },
      analysis: {
        should_update: product.shopify_inventory_item_id,
        quantity_mismatch: currentQuantity !== databaseQuantity,
        graphql_success: successfulVariation !== null,
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
