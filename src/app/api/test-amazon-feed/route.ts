import { NextRequest, NextResponse } from 'next/server';
import { updateAmazonInventory, updateAmazonInventoryBulk } from '../../../../services/amazon';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testType, sku, quantity, bulkUpdates } = body;
    
    console.log(`🧪 Amazon Feed Test: ${testType}`);
    
    let result;
    const startTime = Date.now();
    
    switch (testType) {
      case 'single':
        if (!sku || quantity === undefined) {
          return NextResponse.json({
            success: false,
            error: 'Missing required parameters: sku and quantity'
          });
        }
        
        console.log(`Testing single SKU update: ${sku} -> ${quantity}`);
        result = await updateAmazonInventory(sku, quantity);
        break;
        
      case 'bulk':
        if (!bulkUpdates || !Array.isArray(bulkUpdates) || bulkUpdates.length === 0) {
          return NextResponse.json({
            success: false,
            error: 'Missing required parameter: bulkUpdates (array of {sku, quantity})'
          });
        }
        
        console.log(`Testing bulk update: ${bulkUpdates.length} SKUs`);
        result = await updateAmazonInventoryBulk(bulkUpdates);
        break;
        
      case 'connection':
        // Test just the connection without making feed submissions
        try {
          const { SellingPartner } = require('amazon-sp-api');
          const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
          
          // Test AWS credentials
          const sts = new STSClient({
            credentials: {
              accessKeyId: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
              secretAccessKey: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
            },
            region: 'us-east-1',
          });
          
          const identity = await sts.send(new GetCallerIdentityCommand({}));
          
          // Test SP-API connection
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
          
          const response = await sellingPartner.callAPI({
            operation: 'getMarketplaceParticipations',
            endpoint: 'sellers'
          });
          
          result = {
            success: true,
            awsAccountId: identity.Account,
            marketplaces: response.payload?.length || 0,
            message: 'Connection test successful'
          };
        } catch (error) {
          result = {
            success: false,
            error: (error as Error).message
          };
        }
        break;
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid test type. Use: single, bulk, or connection'
        });
    }
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      testType,
      duration: `${duration}ms`,
      result
    });
    
  } catch (error) {
    console.error('Amazon feed test failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const testType = url.searchParams.get('testType') || 'connection';
    
    console.log(`🧪 Amazon Feed Test (GET): ${testType}`);
    
    let result;
    const startTime = Date.now();
    
    switch (testType) {
      case 'connection':
        // Test just the connection
        try {
          const { SellingPartner } = require('amazon-sp-api');
          const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
          
          // Test AWS credentials
          const sts = new STSClient({
            credentials: {
              accessKeyId: process.env.AMAZON_AWS_ACCESS_KEY_ID!,
              secretAccessKey: process.env.AMAZON_AWS_SECRET_ACCESS_KEY!,
            },
            region: 'us-east-1',
          });
          
          const identity = await sts.send(new GetCallerIdentityCommand({}));
          
          // Test SP-API connection
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
          
          const response = await sellingPartner.callAPI({
            operation: 'getMarketplaceParticipations',
            endpoint: 'sellers'
          });
          
          result = {
            success: true,
            awsAccountId: identity.Account,
            marketplaces: response.payload?.length || 0,
            message: 'Connection test successful'
          };
        } catch (error) {
          result = {
            success: false,
            error: (error as Error).message
          };
        }
        break;
        
      case 'single':
        // Test with default values
        const testSku = 'TEST-SKU-001';
        const testQuantity = 10;
        console.log(`Testing single SKU update: ${testSku} -> ${testQuantity}`);
        result = await updateAmazonInventory(testSku, testQuantity);
        break;
        
      case 'bulk':
        // Test with default values
        const testUpdates = [
          { sku: 'TEST-SKU-002', quantity: 15 },
          { sku: 'TEST-SKU-003', quantity: 20 }
        ];
        console.log(`Testing bulk update: ${testUpdates.length} SKUs`);
        result = await updateAmazonInventoryBulk(testUpdates);
        break;
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid test type. Use: connection, single, or bulk'
        });
    }
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      testType,
      duration: `${duration}ms`,
      result
    });
    
  } catch (error) {
    console.error('Amazon feed test failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
