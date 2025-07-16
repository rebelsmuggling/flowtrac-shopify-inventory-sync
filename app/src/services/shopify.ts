// import { shopifyApi, ApiVersion } from '@shopify/shopify-api';

// const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
// const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
// const SHOPIFY_API_VERSION = (process.env.SHOPIFY_API_VERSION as ApiVersion) || ApiVersion.October23;
// const SHOPIFY_HOST_NAME = process.env.SHOPIFY_HOST_NAME!; // e.g., your-app.vercel.app

// Remove shopifyApi initialization for compatibility with Next.js API routes

export async function updateShopifyInventory(mappedData: any[]): Promise<any> {
  // TODO: Implement Shopify inventory update logic using GraphQL or REST
  return [];
}

// Test function to verify Shopify API connectivity
export async function testShopifyConnection(): Promise<any> {
  try {
    // Use the REST API to fetch shop info
    const response = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION}/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    return data;
  } catch (error) {
    return { error: (error as Error).message };
  }
} 