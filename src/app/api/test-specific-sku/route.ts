import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import axios from 'axios';
import qs from 'qs';

const FLOWTRAC_API_URL = process.env.FLOWTRAC_API_URL;
const FLOWTRAC_BADGE = process.env.FLOWTRAC_BADGE;
const FLOWTRAC_PIN = process.env.FLOWTRAC_PIN;

async function getFlowtracAuthCookie() {
  const loginRes = await axios.post(
    `${FLOWTRAC_API_URL}/device-login/`,
    qs.stringify({ badge: FLOWTRAC_BADGE, pin: FLOWTRAC_PIN }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, withCredentials: true }
  );
  const cookies = loginRes.headers['set-cookie'];
  if (!cookies) throw new Error('No session cookie from Flowtrac login');
  const flowAuthCookie = cookies.find((c: string) => c.startsWith('flow_auth='));
  if (!flowAuthCookie) throw new Error('No flow_auth cookie from Flowtrac login');
  return flowAuthCookie;
}

async function searchFlowtracProductBySku(sku: string, flowAuthCookie: string) {
  try {
    console.log(`Searching for SKU: ${sku}`);
    
    // Try searching by product name (SKU)
    const params = { product: sku };
    console.log(`Searching with params:`, params);
    
    const searchRes = await axios.get(`${FLOWTRAC_API_URL}/products`, {
      headers: { Cookie: flowAuthCookie },
      params,
      withCredentials: true,
    });
    
    console.log(`Search response for ${sku}:`, {
      status: searchRes.status,
      dataLength: searchRes.data?.length || 0,
      data: searchRes.data
    });
    
    if (searchRes.data && searchRes.data.length > 0) {
      return searchRes.data[0];
    }
    
    // Try searching by barcode
    const barcodeParams = { barcode: sku };
    console.log(`Searching by barcode with params:`, barcodeParams);
    
    const barcodeRes = await axios.get(`${FLOWTRAC_API_URL}/products`, {
      headers: { Cookie: flowAuthCookie },
      params: barcodeParams,
      withCredentials: true,
    });
    
    console.log(`Barcode search response for ${sku}:`, {
      status: barcodeRes.status,
      dataLength: barcodeRes.data?.length || 0,
      data: barcodeRes.data
    });
    
    if (barcodeRes.data && barcodeRes.data.length > 0) {
      return barcodeRes.data[0];
    }
    
    return null;
  } catch (error) {
    console.error(`Error searching for SKU ${sku}:`, (error as Error).message);
    return null;
  }
}

async function getInventoryForProduct(productId: string, flowAuthCookie: string) {
  try {
    console.log(`Fetching inventory for product_id: ${productId}`);
    
    const params = { product_id: productId };
    const binsRes = await axios.get(`${FLOWTRAC_API_URL}/product-warehouse-bins`, {
      headers: { Cookie: flowAuthCookie },
      params,
      withCredentials: true,
      timeout: 10000,
    });
    
    console.log(`Inventory response for ${productId}:`, {
      status: binsRes.status,
      dataLength: binsRes.data?.length || 0,
      data: binsRes.data
    });
    
    return binsRes.data;
  } catch (error) {
    console.error(`Error fetching inventory for product_id ${productId}:`, (error as Error).message);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'QW-ELKW-2390';
    
    console.log(`Testing SKU: ${sku}`);
    
    // Check if SKU exists in mapping
    const mapping = getImportedMapping();
    let skuInMapping = false;
    let productIdInMapping = null;
    
    if (mapping) {
      for (const product of mapping.products) {
        if (product.flowtrac_sku === sku) {
          skuInMapping = true;
          productIdInMapping = product.flowtrac_product_id;
          break;
        }
        if (product.bundle_components) {
          for (const comp of product.bundle_components) {
            if (comp.flowtrac_sku === sku) {
              skuInMapping = true;
              productIdInMapping = comp.flowtrac_product_id;
              break;
            }
          }
        }
      }
    }
    
    // Authenticate with Flowtrac
    const flowAuthCookie = await getFlowtracAuthCookie();
    console.log('Authentication successful');
    
    // Search for the product
    const product = await searchFlowtracProductBySku(sku, flowAuthCookie);
    
    let inventory = null;
    if (product && product.product_id) {
      inventory = await getInventoryForProduct(product.product_id, flowAuthCookie);
    }
    
    return NextResponse.json({
      success: true,
      sku: sku,
      inMapping: skuInMapping,
      productIdInMapping: productIdInMapping,
      productFound: !!product,
      product: product,
      inventory: inventory,
      inventoryCount: inventory?.length || 0
    });
    
  } catch (error) {
    console.error('Test SKU error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
