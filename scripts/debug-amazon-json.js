#!/usr/bin/env node

/**
 * Debug Amazon JSON Feed
 * 
 * Tests the exact JSON feed creation process to identify where it's failing.
 */

require('dotenv').config({ path: '.env.local' });

async function debugAmazonJsonFeed() {
  console.log('🔍 Debugging Amazon JSON Feed Process...\n');
  
  try {
    const { SellingPartner } = require('amazon-sp-api');
    
    console.log('1️⃣ Creating SellingPartner instance...');
    const sellingPartner = new SellingPartner({
      region: 'na',
      refresh_token: process.env.AMAZON_REFRESH_TOKEN,
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_CLIENT_ID,
        SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_CLIENT_SECRET,
        AWS_ACCESS_KEY_ID: process.env.AMAZON_AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AMAZON_AWS_SECRET_ACCESS_KEY,
        AWS_SELLING_PARTNER_ROLE: process.env.AMAZON_ROLE_ARN,
      }
    });
    console.log('✅ SellingPartner created successfully');

    // Check environment variables
    console.log('\n2️⃣ Checking environment variables...');
    console.log('AMAZON_SELLER_ID:', process.env.AMAZON_SELLER_ID);
    console.log('AMAZON_MARKETPLACE_ID:', process.env.AMAZON_MARKETPLACE_ID);
    
    if (!process.env.AMAZON_SELLER_ID) {
      throw new Error('AMAZON_SELLER_ID is not set');
    }

    // Create JSON feed content
    console.log('\n3️⃣ Creating JSON feed content...');
    const feedContent = {
      header: {
        sellerId: process.env.AMAZON_SELLER_ID,
        version: "2.0",
        issueLocale: "en_US"
      },
      messages: [
        {
          messageId: 1,
          sku: "TEST-SKU-001",
          operationType: "PARTIAL_UPDATE",
          productType: "PRODUCT",
          attributes: {
            fulfillment_availability: [
              {
                fulfillment_channel_code: "DEFAULT",
                quantity: 10
              }
            ]
          }
        }
      ]
    };
    console.log('✅ JSON feed content created');
    console.log('Feed content:', JSON.stringify(feedContent, null, 2));

    // Create feed document
    console.log('\n4️⃣ Creating feed document...');
    const createDocRes = await sellingPartner.callAPI({
      operation: 'createFeedDocument',
      body: {
        contentType: 'application/json'
      },
      endpoint: 'feeds'
    });
    console.log('✅ Feed document created');
    console.log('Document ID:', createDocRes.feedDocumentId);
    console.log('Upload URL:', createDocRes.url.substring(0, 50) + '...');

    // Upload feed content
    console.log('\n5️⃣ Uploading feed content...');
    const uploadRes = await fetch(createDocRes.url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(feedContent)
    });
    
    if (!uploadRes.ok) {
      throw new Error(`Upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
    }
    console.log('✅ Feed content uploaded successfully');

    // Create feed
    console.log('\n6️⃣ Creating feed...');
    const createFeedParams = {
      operation: 'createFeed',
      body: {
        feedType: 'JSON_LISTINGS_FEED',
        marketplaceIds: [process.env.AMAZON_MARKETPLACE_ID],
        inputFeedDocumentId: createDocRes.feedDocumentId
      },
      endpoint: 'feeds'
    };
    console.log('Feed parameters:', JSON.stringify(createFeedParams, null, 2));
    
    const submitFeedRes = await sellingPartner.callAPI(createFeedParams);
    console.log('✅ Feed created successfully!');
    console.log('Feed ID:', submitFeedRes.feedId);
    console.log('Method: json_listings_feed');
    
    return { success: true, feedId: submitFeedRes.feedId, method: 'json_listings_feed' };
    
  } catch (error) {
    console.error('❌ Error in JSON feed process:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

// Run the debug
if (require.main === module) {
  debugAmazonJsonFeed()
    .then(result => {
      console.log('\n🎉 JSON feed debug completed successfully!');
      console.log('Result:', result);
    })
    .catch(error => {
      console.error('\n💥 JSON feed debug failed:', error.message);
      process.exit(1);
    });
}
