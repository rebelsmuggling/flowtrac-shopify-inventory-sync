import { NextRequest, NextResponse } from 'next/server';
import { updateAmazonInventory } from '../../../../services/amazon';
import { mappingService } from '../../../services/mapping';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sku, quantity } = body;

    if (!sku || quantity === undefined) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: sku and quantity'
      });
    }

    console.log(`Testing Amazon JSON API for SKU: ${sku}, Quantity: ${quantity}`);

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

    const result = await updateAmazonInventory(amazonSku, quantity);

    return NextResponse.json({
      success: true,
      test: {
        originalSku: sku,
        amazonSku: amazonSku,
        quantity,
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
    const quantity = url.searchParams.get('quantity');

    if (!sku || !quantity) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: sku and quantity'
      });
    }

    const quantityNum = parseInt(quantity, 10);
    if (isNaN(quantityNum)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid quantity parameter'
      });
    }

    console.log(`Testing Amazon JSON API for SKU: ${sku}, Quantity: ${quantityNum}`);

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

    const result = await updateAmazonInventory(amazonSku, quantityNum);

    return NextResponse.json({
      success: true,
      test: {
        originalSku: sku,
        amazonSku: amazonSku,
        quantity: quantityNum,
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
