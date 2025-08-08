import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const FLOWTRAC_API_URL = process.env.FLOWTRAC_API_URL;
const FLOWTRAC_BADGE = process.env.FLOWTRAC_BADGE;
const FLOWTRAC_PIN = process.env.FLOWTRAC_PIN;

async function getFlowtracAuthCookie() {
  const loginRes = await fetch(
    `${FLOWTRAC_API_URL}/device-login/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ badge: FLOWTRAC_BADGE!, pin: FLOWTRAC_PIN! }),
    }
  );
  
  const cookies = loginRes.headers.get('set-cookie');
  if (!cookies) throw new Error('No session cookie from Flowtrac login');
  
  const flowAuthCookie = cookies.split(',').find((c: string) => c.trim().startsWith('flow_auth='));
  if (!flowAuthCookie) throw new Error('No flow_auth cookie from Flowtrac login');
  
  return flowAuthCookie.trim();
}

async function fetchFlowtracProducts(flowAuthCookie: string) {
  const productsRes = await fetch(`${FLOWTRAC_API_URL}/products`, {
    headers: { Cookie: flowAuthCookie },
  });
  
  if (!productsRes.ok) {
    throw new Error(`Failed to fetch products: ${productsRes.status} ${productsRes.statusText}`);
  }
  
  return productsRes.json();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skus } = body;
    
    if (!skus || !Array.isArray(skus)) {
      return NextResponse.json({ 
        success: false, 
        error: 'SKUs array is required' 
      }, { status: 400 });
    }

    console.log('Fetching product descriptions for SKUs:', skus);

    // Check if Flowtrac credentials are available
    if (!FLOWTRAC_API_URL || !FLOWTRAC_BADGE || !FLOWTRAC_PIN) {
      return NextResponse.json({ 
        success: false, 
        error: 'Flowtrac credentials not configured' 
      }, { status: 500 });
    }

    // 1. Authenticate to get session cookie
    const flowAuthCookie = await getFlowtracAuthCookie();
    console.log('Successfully authenticated with Flowtrac');

    // 2. Fetch all Flowtrac products
    const products = await fetchFlowtracProducts(flowAuthCookie);
    console.log(`Fetched ${products.length} products from Flowtrac`);

    // 3. Create a map for quick lookup
    const productMap = new Map();
    for (const product of products) {
      if (product.product) {
        productMap.set(product.product, product);
      }
      if (product.barcode) {
        productMap.set(product.barcode, product);
      }
    }

    // 4. Extract descriptions for requested SKUs
    const results: any[] = [];
    const notFound: string[] = [];

    for (const sku of skus) {
      const product = productMap.get(sku);
      if (product) {
        results.push({
          sku: sku,
          product_id: product.product_id,
          product_name: product.product,
          description: product.description || '',
          barcode: product.barcode || '',
          type: product.type || '',
          active: product.active || '',
          list_price: product.list_price || '',
          sell_price: product.sell_price || '',
          cost: product.cost || '',
          weight: product.weight || '',
          sync_to_shopify: product.sync_to_shopify || '',
          created_at: product.created_at || '',
          updated_at: product.updated_at || ''
        });
      } else {
        notFound.push(sku);
      }
    }

    console.log(`Found ${results.length} products, ${notFound.length} not found`);

    return NextResponse.json({
      success: true,
      data: {
        products: results,
        notFound: notFound,
        totalRequested: skus.length,
        totalFound: results.length,
        totalNotFound: notFound.length
      }
    });

  } catch (error) {
    console.error('Failed to fetch product descriptions:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // For testing, return a sample response
  return NextResponse.json({
    success: true,
    message: 'Product descriptions endpoint is ready. Use POST with {"skus": ["SKU1", "SKU2", ...]} to fetch descriptions.',
    example: {
      method: 'POST',
      body: {
        skus: ['IC-KOOL-0045', 'IC-HCPK-0096']
      }
    }
  });
} 