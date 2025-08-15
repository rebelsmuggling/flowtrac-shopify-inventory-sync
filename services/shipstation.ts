import fetch from 'node-fetch';

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY!;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET!;
const SHIPSTATION_API_BASE = 'https://ssapi.shipstation.com';

function getAuthHeader() {
  const creds = Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64');
  return `Basic ${creds}`;
}

// Helper to fetch a product by SKU
async function getShipStationProductBySku(sku: string) {
  const url = `${SHIPSTATION_API_BASE}/products?sku=${encodeURIComponent(sku)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`ShipStation API error (get product): ${res.status} ${res.statusText} - ${errorText}`);
  }
  const data = await res.json();
  if (!data.products || !data.products.length) {
    throw new Error(`No ShipStation product found for SKU: ${sku}`);
  }
  return data.products[0];
}

// New bulk update function for multiple SKUs
export async function updateShipStationWarehouseLocationBulk(updates: Array<{sku: string, binLocation: string}>) {
  console.log(`[ShipStation Sync] Updating warehouse locations for ${updates.length} SKUs using bulk method`);
  
  try {
    // 1. Fetch all products by SKU in parallel
    console.log(`[ShipStation Sync] Fetching product details for ${updates.length} SKUs...`);
    const productPromises = updates.map(async (update) => {
      try {
        const product = await getShipStationProductBySku(update.sku);
        return {
          sku: update.sku,
          product,
          binLocation: update.binLocation,
          success: true,
          error: null
        };
      } catch (error) {
        return {
          sku: update.sku,
          product: null,
          binLocation: update.binLocation,
          success: false,
          error: (error as Error).message
        };
      }
    });
    
    const productResults = await Promise.all(productPromises);
    
    // 2. Separate successful and failed lookups
    const successfulLookups = productResults.filter(result => result.success);
    const failedLookups = productResults.filter(result => !result.success);
    
    console.log(`[ShipStation Sync] Successfully fetched ${successfulLookups.length} products, ${failedLookups.length} failed`);
    
    // 3. Update all successful products in parallel
    const updatePromises = successfulLookups.map(async (result) => {
      try {
        const updatedProduct = { ...result.product, warehouseLocation: result.binLocation };
        const url = `${SHIPSTATION_API_BASE}/products/${result.product.productId}`;
        
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': getAuthHeader(),
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(updatedProduct),
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`ShipStation API error (update product): ${res.status} ${res.statusText} - ${errorText}`);
        }
        
        return {
          sku: result.sku,
          binLocation: result.binLocation,
          success: true,
          error: null,
          response: await res.json()
        };
      } catch (error) {
        return {
          sku: result.sku,
          binLocation: result.binLocation,
          success: false,
          error: (error as Error).message,
          response: null
        };
      }
    });
    
    const updateResults = await Promise.all(updatePromises);
    
    // 4. Combine results
    const successful = updateResults.filter(result => result.success);
    const failed = [
      ...failedLookups.map(result => ({
        sku: result.sku,
        binLocation: result.binLocation,
        success: false,
        error: result.error,
        response: null
      })),
      ...updateResults.filter(result => !result.success)
    ];
    
    console.log(`[ShipStation Sync] Bulk update completed: ${successful.length} successful, ${failed.length} failed`);
    
    return {
      success: true,
      total: updates.length,
      successful: successful.length,
      failed: failed.length,
      results: {
        successful,
        failed
      }
    };
    
  } catch (error) {
    console.error('[ShipStation Sync] Bulk update failed:', error);
    return {
      success: false,
      error: (error as Error).message,
      total: updates.length,
      successful: 0,
      failed: updates.length,
      results: {
        successful: [],
        failed: updates.map(update => ({
          sku: update.sku,
          binLocation: update.binLocation,
          success: false,
          error: (error as Error).message,
          response: null
        }))
      }
    };
  }
}

export async function updateShipStationWarehouseLocation(sku: string, bin: string) {
  // 1. Fetch product by SKU to get productId and full product object
  const product = await getShipStationProductBySku(sku);
  const productId = product.productId;
  // 2. Update warehouseLocation in the product object
  const updatedProduct = { ...product, warehouseLocation: bin };
  // 3. PUT to /products/{productId} with the full product object
  const url = `${SHIPSTATION_API_BASE}/products/${productId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(updatedProduct),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`ShipStation API error (update product): ${res.status} ${res.statusText} - ${errorText}`);
  }
  return await res.json();
} 