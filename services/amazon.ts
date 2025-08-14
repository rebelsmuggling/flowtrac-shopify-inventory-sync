const { SellingPartner } = require('amazon-sp-api');
import fs from 'fs';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

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
    console.log(`[Amazon Sync] Updating inventory for SKU ${amazonSku} to quantity ${quantity} using POST_INVENTORY_AVAILABILITY_DATA feed`);

    // Use POST_INVENTORY_AVAILABILITY_DATA feed for inventory updates
    // This is the correct feed type for inventory updates
    
    // 1. Create feed content - Tab-delimited format for POST_INVENTORY_AVAILABILITY_DATA
    const feedContent = `sku\tquantity\thandling-time\n${amazonSku}\t${quantity}\t2\n`;

    console.log('[Amazon Sync] Inventory feed content:', feedContent);

    // 2. Create a feed document
    const createDocRes = await sellingPartner.callAPI({
      operation: 'createFeedDocument',
      body: {
        contentType: 'text/tab-separated-values'
      },
      endpoint: 'feeds'
    });
    const { feedDocumentId, url } = createDocRes;

    // 3. Upload the feed file
    const uploadRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/tab-separated-values'
      },
      body: Buffer.from(feedContent, 'utf-8')
    });
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload JSON feed document: ${uploadRes.status} ${uploadRes.statusText}`);
    }

    // 4. Submit the inventory feed
    const createFeedParams = {
      operation: 'createFeed',
      body: {
        feedType: 'POST_INVENTORY_AVAILABILITY_DATA',
        marketplaceIds: [process.env.AMAZON_MARKETPLACE_ID],
        inputFeedDocumentId: feedDocumentId
      },
      endpoint: 'feeds'
    };
    console.log('[Amazon Sync] Inventory feed params:', JSON.stringify(createFeedParams, null, 2));
    const submitFeedRes = await sellingPartner.callAPI(createFeedParams);
    console.log('[Amazon Sync] Inventory feed response:', submitFeedRes);
    const { feedId } = submitFeedRes;
    console.log(`[Amazon Sync] Submitted inventory feed for SKU ${amazonSku}, feedId: ${feedId}`);
    return { success: true, feedId, method: 'inventory_feed' };
    
  } catch (error: any) {
    console.error('[Amazon Sync] Error updating inventory with inventory feed:', error);
    if (error && error.response) {
      console.error('[Amazon Sync] Error response data:', error.response.data);
      console.error('[Amazon Sync] Error response status:', error.response.status);
      console.error('[Amazon Sync] Error response headers:', error.response.headers);
    }
    
    // If the inventory feed fails, try the legacy feed approach as fallback
    console.log('[Amazon Sync] Inventory feed failed, trying legacy feed approach as fallback...');
    return await updateAmazonInventoryLegacy(sellingPartner, amazonSku, quantity);
  }
}

async function updateAmazonInventoryLegacy(sellingPartner: any, amazonSku: string, quantity: number) {
  try {
    // 1. Generate feed content (tab-delimited, with required columns for POST_FLAT_FILE_INVLOADER_DATA)
    // Required columns: sku, quantity, handling-time
    const feedContent = `sku	quantity	handling-time\n${amazonSku}	${quantity}	1\n`;

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
    console.log('[Amazon Sync] Legacy createFeed params:', JSON.stringify(createFeedParams, null, 2));
    const submitFeedRes = await sellingPartner.callAPI(createFeedParams);
    console.log('[Amazon Sync] Legacy createFeed response:', submitFeedRes);
    const { feedId } = submitFeedRes;
    console.log(`[Amazon Sync] Submitted legacy inventory feed for SKU ${amazonSku}, feedId: ${feedId}`);
    return { success: true, feedId, method: 'legacy' };
  } catch (error: any) {
    console.error('[Amazon Sync] Legacy method also failed:', error);
    if (error && error.response) {
      console.error('[Amazon Sync] Legacy error response data:', error.response.data);
    }
    return { success: false, error: error.message, method: 'legacy' };
  }
} 