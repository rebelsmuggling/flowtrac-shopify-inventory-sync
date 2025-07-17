const { SellingPartner } = require('amazon-sp-api');
import fs from 'fs';

export async function updateAmazonInventory(amazonSku: string, quantity: number) {
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
    // 1. Generate feed content (tab-delimited)
    const feedContent = `sku	quantity\n${amazonSku}\t${quantity}\n`;

    // 2. Create a feed document (explicitly specify Feeds API endpoint)
    const createDocRes = await sellingPartner.callAPI({
      operation: 'createFeedDocument',
      body: {
        contentType: 'text/tab-separated-values'
      },
      endpoint: 'feeds'
    });
    const { feedDocumentId, url } = createDocRes;

    // 3. Upload the feed file to the provided URL
    await sellingPartner.uploadFeedDocument({
      url,
      body: Buffer.from(feedContent, 'utf-8'),
      contentType: 'text/tab-separated-values'
    });

    // 4. Submit the feed (explicitly specify Feeds API endpoint)
    const submitFeedRes = await sellingPartner.callAPI({
      operation: 'createFeed',
      body: {
        feedType: 'POST_INVENTORY_AVAILABILITY_DATA',
        marketplaceIds: [process.env.AMAZON_MARKETPLACE_ID],
        inputFeedDocumentId: feedDocumentId
      },
      endpoint: 'feeds'
    });
    const { feedId } = submitFeedRes;
    console.log(`[Amazon Sync] Submitted inventory feed for SKU ${amazonSku}, feedId: ${feedId}`);
    return { success: true, feedId };
  } catch (error: any) {
    console.error('[Amazon Sync] Error updating inventory:', error);
    return { success: false, error: error.message };
  }
} 