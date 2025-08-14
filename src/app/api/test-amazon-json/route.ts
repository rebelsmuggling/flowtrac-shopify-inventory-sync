import { NextRequest, NextResponse } from 'next/server';
import { updateAmazonInventory } from '../../../../services/amazon';
import { mappingService } from '../../../services/mapping';
import { getFlowtracInventory } from '../../../lib/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sku } = body;

    if (!sku) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: sku'
      });
    }

    console.log(`Testing Amazon JSON API for SKU: ${sku}`);

    // Get the mapping to find the correct Amazon SKU
    const { mapping } = await mappingService.getMapping();
    
    // Try to find the product by different SKU types
    let product = mapping.products.find((p: any) => p.flowtrac_sku === sku);
    if (!product) {
      product = mapping.products.find((p: any) => p.shopify_sku === sku);
    }
    if (!product) {
      product = mapping.products.find((p: any) => p.amazon_sku === sku);
    }

    if (!product) {
      return NextResponse.json({
        success: false,
        error: `Product not found in mapping for SKU: ${sku}`
      });
    }

    const amazonSku = product.amazon_sku;
    if (!amazonSku || typeof amazonSku !== 'string' || amazonSku.trim() === '') {
      return NextResponse.json({
        success: false,
        error: `No Amazon SKU found for product: ${sku}`,
        product: {
          flowtrac_sku: product.flowtrac_sku,
          shopify_sku: product.shopify_sku,
          amazon_sku: product.amazon_sku
        }
      });
    }

    console.log(`Found product: ${sku} -> Amazon SKU: ${amazonSku}`);

    // Get quantity from database instead of using manually provided quantity
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    
    if (!inventoryResult.success) {
      return NextResponse.json({
        success: false,
        error: `Failed to get inventory from database: ${inventoryResult.error}`
      });
    }

    let quantity = 0;
    if (inventoryResult.data && inventoryResult.data.length > 0) {
      quantity = inventoryResult.data[0].quantity;
    }

    console.log(`Database quantity for ${sku}: ${quantity}`);

    const result = await updateAmazonInventory(amazonSku, quantity);

    return NextResponse.json({
      success: true,
      test: {
        originalSku: sku,
        amazonSku: amazonSku,
        databaseQuantity: quantity,
        result
      }
    });

  } catch (error) {
    console.error('Test Amazon JSON API error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku');

    if (!sku) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: sku'
      });
    }

    console.log(`Testing Amazon JSON API for SKU: ${sku}`);

    // Get the mapping to find the correct Amazon SKU
    const { mapping } = await mappingService.getMapping();
    
    // Try to find the product by different SKU types
    let product = mapping.products.find((p: any) => p.flowtrac_sku === sku);
    if (!product) {
      product = mapping.products.find((p: any) => p.shopify_sku === sku);
    }
    if (!product) {
      product = mapping.products.find((p: any) => p.amazon_sku === sku);
    }

    if (!product) {
      return NextResponse.json({
        success: false,
        error: `Product not found in mapping for SKU: ${sku}`
      });
    }

    const amazonSku = product.amazon_sku;
    if (!amazonSku || typeof amazonSku !== 'string' || amazonSku.trim() === '') {
      return NextResponse.json({
        success: false,
        error: `No Amazon SKU found for product: ${sku}`,
        product: {
          flowtrac_sku: product.flowtrac_sku,
          shopify_sku: product.shopify_sku,
          amazon_sku: product.amazon_sku
        }
      });
    }

    console.log(`Found product: ${sku} -> Amazon SKU: ${amazonSku}`);

    // Get quantity from database instead of using manually provided quantity
    const inventoryResult = await getFlowtracInventory([sku], 'Manteca');
    
    if (!inventoryResult.success) {
      return NextResponse.json({
        success: false,
        error: `Failed to get inventory from database: ${inventoryResult.error}`
      });
    }

    let quantity = 0;
    if (inventoryResult.data && inventoryResult.data.length > 0) {
      quantity = inventoryResult.data[0].quantity;
    }

    console.log(`Database quantity for ${sku}: ${quantity}`);

    const result = await updateAmazonInventory(amazonSku, quantity);

    return NextResponse.json({
      success: true,
      test: {
        originalSku: sku,
        amazonSku: amazonSku,
        databaseQuantity: quantity,
        result
      }
    });

  } catch (error) {
    console.error('Test Amazon JSON API error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
