import { NextRequest, NextResponse } from 'next/server';
const { SellingPartner } = require('amazon-sp-api');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sku, quantity } = body;

    if (!sku || quantity === undefined) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: sku and quantity'
      });
    }

    console.log(`Debugging Amazon JSON API for SKU: ${sku}, Quantity: ${quantity}`);

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

    // Test the JSON API call with detailed error logging
    const updateInventoryParams = {
      operation: 'patchListingsItem',
      path: {
        sellerId: process.env.AMAZON_SELLER_ID,
        sku: sku
      },
      query: {
        marketplaceIds: [process.env.AMAZON_MARKETPLACE_ID],
        issueLocale: 'en_US'
      },
      body: [
        {
          op: 'replace',
          path: '/attributes/inventory',
          value: {
            quantity: quantity
          }
        },
        {
          op: 'replace',
          path: '/attributes/fulfillment_availability',
          value: {
            fulfillment_channel_code: 'DEFAULT',
            handling_time: 2
          }
        }
      ],
      endpoint: 'listings'
    };

    console.log('Amazon JSON API Debug - Full params:', JSON.stringify(updateInventoryParams, null, 2));
    console.log('Environment variables check:');
    console.log('- AMAZON_SELLER_ID:', process.env.AMAZON_SELLER_ID ? 'SET' : 'NOT SET');
    console.log('- AMAZON_MARKETPLACE_ID:', process.env.AMAZON_MARKETPLACE_ID ? 'SET' : 'NOT SET');

    try {
      const response = await sellingPartner.callAPI(updateInventoryParams);
      console.log('Amazon JSON API Debug - Success response:', JSON.stringify(response, null, 2));
      
      return NextResponse.json({
        success: true,
        method: 'json_api',
        response: response
      });

    } catch (error: any) {
      console.error('Amazon JSON API Debug - Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });

      return NextResponse.json({
        success: false,
        method: 'json_api',
        error: {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers
        }
      });
    }

  } catch (error) {
    console.error('Debug Amazon JSON API error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
