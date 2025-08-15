#!/usr/bin/env node

/**
 * Simple Amazon Feed Test
 * 
 * Tests Amazon SP-API connection and basic functionality without importing the service.
 */

require('dotenv').config({ path: '.env.local' });

async function checkEnvironmentVariables() {
  console.log('🔧 Checking Amazon SP-API Environment Variables...\n');
  
  const requiredVars = [
    'AMAZON_SELLER_ID',
    'AMAZON_MARKETPLACE_ID', 
    'AMAZON_REFRESH_TOKEN',
    'AMAZON_CLIENT_ID',
    'AMAZON_CLIENT_SECRET',
    'AMAZON_AWS_ACCESS_KEY_ID',
    'AMAZON_AWS_SECRET_ACCESS_KEY',
    'AMAZON_ROLE_ARN'
  ];

  const results = {};
  const missingVars = [];

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      missingVars.push(varName);
      results[varName] = { status: 'MISSING', value: null };
    } else {
      const maskedValue = varName.includes('SECRET') || varName.includes('TOKEN') || varName.includes('KEY') 
        ? `${value.substring(0, 4)}***${value.substring(value.length - 4)}`
        : value;
      results[varName] = { status: 'SET', value: maskedValue };
    }
  }

  // Display results
  for (const [varName, result] of Object.entries(results)) {
    const status = result.status === 'SET' ? '✅' : '❌';
    console.log(`${status} ${varName}: ${result.status === 'SET' ? result.value : 'NOT SET'}`);
  }

  if (missingVars.length > 0) {
    console.log(`\n❌ Missing ${missingVars.length} environment variables:`);
    missingVars.forEach(varName => console.log(`   - ${varName}`));
    console.log('\nPlease add these to your .env.local file');
    return false;
  }

  console.log('\n✅ All required environment variables are set!');
  return true;
}

async function testAmazonConnection() {
  console.log('\n🔌 Testing Amazon SP-API Connection...\n');
  
  try {
    const { SellingPartner } = require('amazon-sp-api');
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

    // Test AWS credentials
    console.log('Testing AWS credentials...');
    const sts = new STSClient({
      credentials: {
        accessKeyId: process.env.AMAZON_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AMAZON_AWS_SECRET_ACCESS_KEY,
      },
      region: 'us-east-1',
    });
    
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    console.log(`✅ AWS Account ID: ${identity.Account}`);

    // Test Selling Partner API connection
    console.log('\nTesting Selling Partner API connection...');
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

    // Test getMarketplaceParticipations
    const params = {
      operation: 'getMarketplaceParticipations',
      endpoint: 'sellers'
    };
    
    console.log('Calling getMarketplaceParticipations...');
    const response = await sellingPartner.callAPI(params);
    console.log('✅ SP-API Connection successful!');
    console.log(`   Marketplaces: ${response.payload?.length || 0} found`);
    
    if (response.payload && response.payload.length > 0) {
      console.log('   Marketplace details:');
      response.payload.forEach((marketplace, index) => {
        console.log(`     ${index + 1}. ${marketplace.marketplaceName} (${marketplace.marketplaceId})`);
      });
    } else {
      console.log('   ⚠️  No marketplaces found - this might indicate a configuration issue');
    }
    
    return { success: true, sellingPartner, marketplaces: response.payload?.length || 0 };
  } catch (error) {
    console.error('❌ Amazon SP-API connection failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

async function testFeedDocumentCreation() {
  console.log('\n📄 Testing Feed Document Creation...\n');
  
  try {
    const { SellingPartner } = require('amazon-sp-api');
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

    // Test JSON feed document creation
    console.log('Creating JSON feed document...');
    const createDocRes = await sellingPartner.callAPI({
      operation: 'createFeedDocument',
      body: {
        contentType: 'application/json'
      },
      endpoint: 'feeds'
    });
    
    console.log('✅ JSON feed document created successfully!');
    console.log(`   Document ID: ${createDocRes.feedDocumentId}`);
    console.log(`   Upload URL: ${createDocRes.url.substring(0, 50)}...`);
    
    return { success: true, documentId: createDocRes.feedDocumentId, url: createDocRes.url };
  } catch (error) {
    console.error('❌ Feed document creation failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

async function testInventoryFeed() {
  console.log('\n📦 Testing Inventory Feed Creation...\n');
  
  try {
    const { SellingPartner } = require('amazon-sp-api');
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

    // Create feed document
    console.log('Creating feed document...');
    const createDocRes = await sellingPartner.callAPI({
      operation: 'createFeedDocument',
      body: {
        contentType: 'application/json'
      },
      endpoint: 'feeds'
    });

    // Create test inventory feed
    const testFeed = {
      header: {
        sellerId: process.env.AMAZON_SELLER_ID,
        version: "2.0"
      },
      messages: [
        {
          messageId: 1,
          operationType: "Update",
          inventory: {
            sku: "TEST-SKU-001",
            quantity: 10
          }
        }
      ]
    };

    // Upload feed content
    console.log('Uploading feed content...');
    const uploadResponse = await fetch(createDocRes.url, {
      method: 'PUT',
      body: JSON.stringify(testFeed),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    console.log('✅ Feed content uploaded successfully!');

    // Create feed
    console.log('Creating feed...');
    const createFeedRes = await sellingPartner.callAPI({
      operation: 'createFeed',
      body: {
        feedType: 'JSON_LISTINGS_FEED',
        marketplaceIds: [process.env.AMAZON_MARKETPLACE_ID],
        inputFeedDocumentId: createDocRes.feedDocumentId
      },
      endpoint: 'feeds'
    });

    console.log('✅ Feed created successfully!');
    console.log(`   Feed ID: ${createFeedRes.feedId}`);
    
    return { success: true, feedId: createFeedRes.feedId };
  } catch (error) {
    console.error('❌ Inventory feed test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 Simple Amazon Feed Test');
  console.log('='.repeat(40));
  
  const results = {
    environment: await checkEnvironmentVariables(),
    connection: await testAmazonConnection(),
    feedDocument: await testFeedDocumentCreation(),
    inventoryFeed: await testInventoryFeed()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const tests = [
    { name: 'Environment Variables', result: results.environment },
    { name: 'SP-API Connection', result: results.connection.success },
    { name: 'Feed Document Creation', result: results.feedDocument.success },
    { name: 'Inventory Feed Test', result: results.inventoryFeed.success }
  ];
  
  let passedTests = 0;
  tests.forEach(test => {
    const status = test.result ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${test.name}`);
    if (test.result) passedTests++;
  });
  
  console.log(`\n🎯 Overall: ${passedTests}/${tests.length} tests passed`);
  
  if (passedTests === tests.length) {
    console.log('🎉 All tests passed! Amazon JSON feed is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
  
  // Special note about marketplaces
  if (results.connection.success && results.connection.marketplaces === 0) {
    console.log('\n⚠️  IMPORTANT: No marketplaces found!');
    console.log('   This could be why your Amazon syncs are failing.');
    console.log('   Check your AMAZON_MARKETPLACE_ID and seller account permissions.');
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}
