import { NextRequest, NextResponse } from 'next/server';
const { SellingPartner } = require('amazon-sp-api');

export async function GET(request: NextRequest) {
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

    // Check what endpoints are available
    const availableEndpoints = Object.keys(sellingPartner);
    console.log('Available endpoints:', availableEndpoints);

    // Test a known working endpoint (feeds)
    let feedsTest = null;
    try {
      const feedsResponse = await sellingPartner.callAPI({
        operation: 'getFeeds',
        endpoint: 'feeds'
      });
      feedsTest = { success: true, data: feedsResponse };
    } catch (error: any) {
      feedsTest = { success: false, error: error.message };
    }

    // Test sellers endpoint
    let sellersTest = null;
    try {
      const sellersResponse = await sellingPartner.callAPI({
        operation: 'getMarketplaceParticipations',
        endpoint: 'sellers'
      });
      sellersTest = { success: true, data: sellersResponse };
    } catch (error: any) {
      sellersTest = { success: false, error: error.message };
    }

    return NextResponse.json({
      success: true,
      availableEndpoints,
      tests: {
        feeds: feedsTest,
        sellers: sellersTest
      }
    });

  } catch (error) {
    console.error('Test Amazon endpoints error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
