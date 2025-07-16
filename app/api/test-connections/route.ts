import { NextRequest, NextResponse } from 'next/server';
import { testFlowtracConnection } from '../../src/services/flowtrac';
import { testShopifyConnection } from '../../src/services/shopify';

export async function GET(request: NextRequest) {
  const flowtracResult = await testFlowtracConnection();
  const shopifyResult = await testShopifyConnection();

  return NextResponse.json({
    flowtrac: flowtracResult,
    shopify: shopifyResult,
  });
} 