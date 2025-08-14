import { NextRequest, NextResponse } from 'next/server';
import { updateAmazonInventory } from '../../../../services/amazon';

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

    const result = await updateAmazonInventory(sku, quantity);

    return NextResponse.json({
      success: true,
      test: {
        sku,
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

    const result = await updateAmazonInventory(sku, quantityNum);

    return NextResponse.json({
      success: true,
      test: {
        sku,
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
