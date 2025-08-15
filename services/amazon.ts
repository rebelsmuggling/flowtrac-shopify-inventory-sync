const { SellingPartner } = require('amazon-sp-api');
import fs from 'fs';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

// New bulk update function for multiple SKUs
export async function updateAmazonInventoryBulk(updates: Array<{sku: string, quantity: number}>) {
  // Log AWS account ID
  try {
    const sts = new STSClient({
      credentials: {
        accessKeyId: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
      },
      region: 'us-east-1',
    });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    console.log('[Amazon Sync] AWS Account ID:', identity.Account);
  } catch (err) {
    console.error('[Amazon Sync] Failed to get AWS Account ID:', err);
  }

  const sellingPartner = new SellingPartner({
    region: 'na',
    refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_CLIENT_ID!,
      SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET!,
      AWS_ACCESS_KEY_ID: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
      AWS_SECRET_ACCESS_KEY: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
      AWS_SELLING_PARTNER_ROLE: process.env.AMAZON_ROLE_ARN!,
    }
  });

  try {
    console.log(`[Amazon Sync] Updating inventory for ${updates.length} SKUs using bulk JSON_LISTINGS_FEED`);

    const sellerId = process.env.AMAZON_SELLER_ID;
    if (!sellerId) {
      throw new Error('AMAZON_SELLER_ID environment variable is required for JSON feed');
    }

    // Create JSON feed content for bulk inventory update
    const messages = updates.map((update, index) => ({
      messageId: index + 1,
      sku: update.sku,
      operationType: "PARTIAL_UPDATE",
      productType: "PRODUCT",
      attributes: {
        fulfillment_availability: [
          {
            fulfillment_channel_code: "DEFAULT",
            quantity: update.quantity
          }
        ]
      }
    }));

    const feedContent = {
      header: {
        sellerId: sellerId,
        version: "2.0",
        issueLocale: "en_US"
      },
      messages: messages
    };

    console.log(`[Amazon Sync] Bulk JSON feed content for ${updates.length} SKUs:`, JSON.stringify(feedContent, null, 2));

    // Create a feed document
    const createDocRes = await sellingPartner.callAPI({
      operation: 'createFeedDocument',
      body: {
        contentType: 'application/json'
      },
      endpoint: 'feeds'
    });
    const { feedDocumentId, url } = createDocRes;

    // Upload the JSON feed file
    const uploadRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(feedContent)
    });
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload bulk JSON feed document: ${uploadRes.status} ${uploadRes.statusText}`);
    }

    // Submit the JSON inventory feed
    const createFeedParams = {
      operation: 'createFeed',
      body: {
        feedType: 'JSON_LISTINGS_FEED',
        marketplaceIds: [process.env.AMAZON_MARKETPLACE_ID],
        inputFeedDocumentId: feedDocumentId
      },
      endpoint: 'feeds'
    };
    console.log('[Amazon Sync] Bulk JSON inventory feed params:', JSON.stringify(createFeedParams, null, 2));
    const submitFeedRes = await sellingPartner.callAPI(createFeedParams);
    console.log('[Amazon Sync] Bulk JSON inventory feed response:', submitFeedRes);
    const { feedId } = submitFeedRes;
    console.log(`[Amazon Sync] Submitted bulk JSON inventory feed for ${updates.length} SKUs, feedId: ${feedId}`);
    
    return { 
      success: true, 
      feedId, 
      method: 'bulk_json_listings_feed',
      skuCount: updates.length,
      skus: updates.map(u => u.sku)
    };
    
  } catch (error: any) {
    console.error('[Amazon Sync] Error updating inventory with bulk JSON feed:', error);
    if (error && error.response) {
      console.error('[Amazon Sync] Error response data:', error.response.data);
      console.error('[Amazon Sync] Error response status:', error.response.status);
      console.error('[Amazon Sync] Error response headers:', error.response.headers);
    }
    
    // If bulk JSON feed fails, try individual updates as fallback
    console.log('[Amazon Sync] Bulk JSON feed failed, trying individual updates as fallback...');
    const results = [];
    for (const update of updates) {
      try {
        const result = await updateAmazonInventory(update.sku, update.quantity);
        results.push({ sku: update.sku, ...result });
      } catch (err) {
        results.push({ 
          sku: update.sku, 
          success: false, 
          error: (err as Error).message,
          method: 'individual_fallback'
        });
      }
    }
    return { 
      success: false, 
      error: 'Bulk update failed, individual updates attempted',
      results,
      method: 'individual_fallback'
    };
  }
}

export async function updateAmazonInventory(amazonSku: string, quantity: number) {
  // Log AWS account ID
  try {
    const sts = new STSClient({
      credentials: {
        accessKeyId: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
      },
      region: 'us-east-1',
    });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    console.log('[Amazon Sync] AWS Account ID:', identity.Account);
  } catch (err) {
    console.error('[Amazon Sync] Failed to get AWS Account ID:', err);
  }

  // Log Seller ID with detailed request/response logging for Amazon support
  try {
    const sellingPartner = new SellingPartner({
      region: 'na',
      refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_CLIENT_ID!,
        SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET!,
        AWS_ACCESS_KEY_ID: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
        AWS_SECRET_ACCESS_KEY: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
        AWS_SELLING_PARTNER_ROLE: process.env.AMAZON_ROLE_ARN!,
      }
    });
    const params = {
      operation: 'getMarketplaceParticipations',
      endpoint: 'sellers'
    };
    console.log('SP-API REQUEST');
    console.log('Endpoint:', params.endpoint);
    console.log('Operation:', params.operation);
    const response = await sellingPartner.callAPI(params);
    console.log('SP-API RESPONSE');
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (err) {
    const error: any = err;
    console.error('SP-API ERROR');
    console.error('Error:', error);
    if (error.response) {
      console.error('Response Headers:', error.response.headers);
      console.error('Response Body:', error.response.data);
    }
  }

  const sellingPartner = new SellingPartner({
    region: 'na', // North America; use 'eu' or 'fe' for other regions
    refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_CLIENT_ID!,
      SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET!,
      AWS_ACCESS_KEY_ID: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
      AWS_SECRET_ACCESS_KEY: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
      AWS_SELLING_PARTNER_ROLE: process.env.AMAZON_ROLE_ARN!,
    }
  });

  try {
    console.log(`[Amazon Sync] Updating inventory for SKU ${amazonSku} to quantity ${quantity} using JSON_LISTINGS_FEED`);

    // Use JSON_LISTINGS_FEED for inventory updates (new recommended approach)
    const sellerId = process.env.AMAZON_SELLER_ID;
    if (!sellerId) {
      throw new Error('AMAZON_SELLER_ID environment variable is required for JSON feed');
    }

    // 1. Create JSON feed content for inventory update
    const feedContent = {
      header: {
        sellerId: sellerId,
        version: "2.0",
        issueLocale: "en_US"
      },
      messages: [
        {
          messageId: 1,
          sku: amazonSku,
          operationType: "PARTIAL_UPDATE",
          productType: "PRODUCT", // Generic product type - can be customized based on your products
          attributes: {
            fulfillment_availability: [
              {
                fulfillment_channel_code: "DEFAULT", // For seller-fulfilled inventory
                quantity: quantity
              }
            ]
          }
        }
      ]
    };

    console.log('[Amazon Sync] JSON feed content:', JSON.stringify(feedContent, null, 2));

    // 2. Create a feed document
    const createDocRes = await sellingPartner.callAPI({
      operation: 'createFeedDocument',
      body: {
        contentType: 'application/json'
      },
      endpoint: 'feeds'
    });
    const { feedDocumentId, url } = createDocRes;

    // 3. Upload the JSON feed file
    const uploadRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(feedContent)
    });
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload JSON feed document: ${uploadRes.status} ${uploadRes.statusText}`);
    }

    // 4. Submit the JSON inventory feed
    const createFeedParams = {
      operation: 'createFeed',
      body: {
        feedType: 'JSON_LISTINGS_FEED',
        marketplaceIds: [process.env.AMAZON_MARKETPLACE_ID],
        inputFeedDocumentId: feedDocumentId
      },
      endpoint: 'feeds'
    };
    console.log('[Amazon Sync] JSON inventory feed params:', JSON.stringify(createFeedParams, null, 2));
    const submitFeedRes = await sellingPartner.callAPI(createFeedParams);
    console.log('[Amazon Sync] JSON inventory feed response:', submitFeedRes);
    const { feedId } = submitFeedRes;
    console.log(`[Amazon Sync] Submitted JSON inventory feed for SKU ${amazonSku}, feedId: ${feedId}`);
    return { success: true, feedId, method: 'json_listings_feed' };
    
  } catch (error: any) {
    console.error('[Amazon Sync] Error updating inventory with JSON feed:', error);
    if (error && error.response) {
      console.error('[Amazon Sync] Error response data:', error.response.data);
      console.error('[Amazon Sync] Error response status:', error.response.status);
      console.error('[Amazon Sync] Error response headers:', error.response.headers);
    }
    
    // If the JSON feed fails, try the legacy flat file approach as fallback
    console.log('[Amazon Sync] JSON feed failed, trying legacy flat file approach as fallback...');
    return await updateAmazonInventoryLegacy(sellingPartner, amazonSku, quantity);
  }
}

async function updateAmazonInventoryLegacy(sellingPartner: any, amazonSku: string, quantity: number) {
  try {
    console.log(`[Amazon Sync] Using legacy flat file method for SKU ${amazonSku} with quantity ${quantity}`);

    // 1. Generate feed content (tab-delimited, with required columns for POST_FLAT_FILE_INVLOADER_DATA)
    // Required columns: sku, quantity, handling-time
    const feedContent = `sku	quantity	handling-time\n${amazonSku}	${quantity}	2\n`;

    // Log the feed content for debugging
    console.log('[Amazon Sync] Legacy feed content to upload:\n', feedContent);

    // 2. Create a feed document (explicitly specify Feeds API endpoint)
    const createDocRes = await sellingPartner.callAPI({
      operation: 'createFeedDocument',
      body: {
        contentType: 'text/tab-separated-values'
      },
      endpoint: 'feeds'
    });
    const { feedDocumentId, url } = createDocRes;

    // 3. Upload the feed file to the provided URL using fetch (not uploadFeedDocument)
    const uploadRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/tab-separated-values'
      },
      body: Buffer.from(feedContent, 'utf-8')
    });
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload feed document: ${uploadRes.status} ${uploadRes.statusText}`);
    }

    // 4. Submit the feed (explicitly specify Feeds API endpoint)
    const createFeedParams = {
      operation: 'createFeed',
      body: {
        feedType: 'POST_FLAT_FILE_INVLOADER_DATA',
        marketplaceIds: [process.env.AMAZON_MARKETPLACE_ID],
        inputFeedDocumentId: feedDocumentId
      },
      endpoint: 'feeds'
    };
    console.log('[Amazon Sync] Legacy inventory feed params:', JSON.stringify(createFeedParams, null, 2));
    const submitFeedRes = await sellingPartner.callAPI(createFeedParams);
    console.log('[Amazon Sync] Legacy inventory feed response:', submitFeedRes);
    const { feedId } = submitFeedRes;
    console.log(`[Amazon Sync] Submitted legacy inventory feed for SKU ${amazonSku}, feedId: ${feedId}`);
    return { success: true, feedId, method: 'legacy_inventory_feed' };
  } catch (error: any) {
    console.error('[Amazon Sync] Legacy method also failed:', error);
    if (error && error.response) {
      console.error('[Amazon Sync] Legacy error response data:', error.response.data);
    }
    return { success: false, error: error.message, method: 'legacy' };
  }
} 