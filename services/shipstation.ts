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
  
  // Process in batches to avoid timeouts and rate limits
  const BATCH_SIZE = 100; // Maximum batch size for fastest processing
  const batches = [];
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    batches.push(updates.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`[ShipStation Sync] Processing ${updates.length} SKUs in ${batches.length} batches of ${BATCH_SIZE}`);
  
  const allResults = {
    successful: [] as any[],
    failed: [] as any[]
  };
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const progress = Math.round(((batchIndex + 1) / batches.length) * 100);
    
    console.log(`[ShipStation Sync] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} SKUs) - ${progress}% complete`);
    
    try {
      // 1. Fetch all products by SKU sequentially to avoid rate limits
      const productResults = [];
      for (const update of batch) {
        try {
          const product = await getShipStationProductBySku(update.sku);
          productResults.push({
            sku: update.sku,
            product,
            binLocation: update.binLocation,
            success: true,
            error: null
          });
          // Add minimal delay between requests to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 50)); // Minimal 50ms delay
        } catch (error) {
          productResults.push({
            sku: update.sku,
            product: null,
            binLocation: update.binLocation,
            success: false,
            error: (error as Error).message
          });
          // Add delay even on error to maintain rate limiting
          await new Promise(resolve => setTimeout(resolve, 50)); // Minimal 50ms delay
        }
      }
      
      // 2. Separate successful and failed lookups
      const successfulLookups = productResults.filter(result => result.success);
      const failedLookups = productResults.filter(result => !result.success);
      
      console.log(`[ShipStation Sync] Batch ${batchIndex + 1}: Successfully fetched ${successfulLookups.length} products, ${failedLookups.length} failed`);
      
      // 3. Update all successful products sequentially to avoid rate limits
      const updateResults = [];
      for (const result of successfulLookups) {
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
          
          updateResults.push({
            sku: result.sku,
            binLocation: result.binLocation,
            success: true,
            error: null,
            response: await res.json()
          });
          
          // Add minimal delay between requests to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 50)); // Minimal 50ms delay
        } catch (error) {
          updateResults.push({
            sku: result.sku,
            binLocation: result.binLocation,
            success: false,
            error: (error as Error).message,
            response: null
          });
          // Add delay even on error to maintain rate limiting
          await new Promise(resolve => setTimeout(resolve, 50)); // Minimal 50ms delay
        }
      }
      
      // 4. Add batch results to overall results
      const batchSuccessful = updateResults.filter(result => result.success);
      const batchFailed = [
        ...failedLookups.map(result => ({
          sku: result.sku,
          binLocation: result.binLocation,
          success: false,
          error: result.error,
          response: null
        })),
        ...updateResults.filter(result => !result.success)
      ];
      
      allResults.successful.push(...batchSuccessful);
      allResults.failed.push(...batchFailed);
      
      console.log(`[ShipStation Sync] Batch ${batchIndex + 1} completed: ${batchSuccessful.length} successful, ${batchFailed.length} failed`);
      
      // 5. Add minimal delay between batches to complete within timeout
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Minimal 200ms delay between batches
      }
      
    } catch (error) {
      console.error(`[ShipStation Sync] Batch ${batchIndex + 1} failed:`, error);
      // Mark all SKUs in this batch as failed
      const batchFailed = batch.map(update => ({
        sku: update.sku,
        binLocation: update.binLocation,
        success: false,
        error: (error as Error).message,
        response: null
      }));
      allResults.failed.push(...batchFailed);
    }
  }
  
  const totalSuccessful = allResults.successful.length;
  const totalFailed = allResults.failed.length;
  
  console.log(`[ShipStation Sync] Bulk update completed: ${totalSuccessful} successful, ${totalFailed} failed`);
  
  return {
    success: true,
    total: updates.length,
    successful: totalSuccessful,
    failed: totalFailed,
    results: {
      successful: allResults.successful,
      failed: allResults.failed
    }
  };
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