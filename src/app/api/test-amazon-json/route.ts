import { NextRequest, NextResponse } from 'next/server';
import { updateAmazonInventory, updateAmazonInventoryBulk } from '../../../../services/amazon';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sku, quantity, testType = 'single' } = body;

    console.log(`🧪 Testing Amazon JSON feed - Type: ${testType}, SKU: ${sku}, Quantity: ${quantity}`);

    if (testType === 'single') {
      // Test single SKU update
      if (!sku || quantity === undefined) {
        return NextResponse.json({
          success: false,
          error: 'Missing required parameters: sku and quantity'
        });
      }

      console.log(`📦 Testing single SKU update for ${sku} with quantity ${quantity}`);
      const result = await updateAmazonInventory(sku, quantity);

      return NextResponse.json({
        success: true,
        testType: 'single',
        sku,
        quantity,
        result
      });

    } else if (testType === 'bulk') {
      // Test bulk SKU update
      const testUpdates = [
        { sku: sku || 'TEST-SKU-001', quantity: quantity || 10 },
        { sku: 'TEST-SKU-002', quantity: 15 },
        { sku: 'TEST-SKU-003', quantity: 20 }
      ];

      console.log(`📦 Testing bulk SKU update for ${testUpdates.length} SKUs`);
      const result = await updateAmazonInventoryBulk(testUpdates);

      return NextResponse.json({
        success: true,
        testType: 'bulk',
        updates: testUpdates,
        result
      });

    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid testType. Use "single" or "bulk"'
      });
    }

  } catch (error) {
    console.error('❌ Amazon JSON feed test failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Amazon JSON Feed Test Endpoint',
    usage: {
      single: 'POST with { "sku": "YOUR-SKU", "quantity": 10, "testType": "single" }',
      bulk: 'POST with { "testType": "bulk" }'
    }
  });
}
