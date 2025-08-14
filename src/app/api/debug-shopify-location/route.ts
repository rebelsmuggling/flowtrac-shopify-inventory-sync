import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
    const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
    const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
    const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-10';
    
    if (!SHOPIFY_API_KEY || !SHOPIFY_API_PASSWORD || !SHOPIFY_STORE_URL) {
      return NextResponse.json({
        success: false,
        error: 'Shopify credentials not configured'
      });
    }
    
    // Get all locations
    const url = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/locations.json`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    const locations = data.locations || [];
    
    // Find Manteca location
    const mantecaLocation = locations.find((loc: any) => 
      loc.name.toLowerCase().includes('manteca') || 
      loc.name.toLowerCase().includes('warehouse') ||
      loc.name.toLowerCase().includes('main')
    );
    
    // Find FBA location
    const fbaLocation = locations.find((loc: any) => 
      loc.name.toLowerCase().includes('fba') || 
      loc.name.toLowerCase().includes('amazon')
    );
    
    // Get current inventory for a test SKU to see which location it's in
    const testSku = 'IC-RBBE-0002';
    const inventoryUrl = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/inventory_levels.json?sku=${testSku}`;
    
    const inventoryResponse = await fetch(inventoryUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const inventoryData = await inventoryResponse.json();
    const inventoryLevels = inventoryData.inventory_levels || [];
    
    return NextResponse.json({
      success: true,
      allLocations: locations.map((loc: any) => ({
        id: loc.id,
        name: loc.name,
        address1: loc.address1,
        city: loc.city,
        province: loc.province,
        country: loc.country,
        active: loc.active
      })),
      mantecaLocation: mantecaLocation ? {
        id: mantecaLocation.id,
        name: mantecaLocation.name,
        address1: mantecaLocation.address1,
        city: mantecaLocation.city,
        province: mantecaLocation.province,
        country: mantecaLocation.country,
        gid: `gid://shopify/Location/${mantecaLocation.id}`
      } : null,
      fbaLocation: fbaLocation ? {
        id: fbaLocation.id,
        name: fbaLocation.name,
        address1: fbaLocation.address1,
        city: fbaLocation.city,
        province: fbaLocation.province,
        country: fbaLocation.country,
        gid: `gid://shopify/Location/${fbaLocation.id}`
      } : null,
      testSkuInventory: inventoryLevels.map((level: any) => ({
        location_id: level.location_id,
        location_name: locations.find((loc: any) => loc.id === level.location_id)?.name || 'Unknown',
        available: level.available,
        gid: `gid://shopify/Location/${level.location_id}`
      })),
      analysis: {
        mantecaFound: !!mantecaLocation,
        fbaFound: !!fbaLocation,
        testSkuInManteca: inventoryLevels.some((level: any) => 
          locations.find((loc: any) => loc.id === level.location_id)?.name.toLowerCase().includes('manteca')
        ),
        testSkuInFBA: inventoryLevels.some((level: any) => 
          locations.find((loc: any) => loc.id === level.location_id)?.name.toLowerCase().includes('fba')
        )
      }
    });
    
  } catch (error) {
    console.error('Error debugging Shopify location:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
