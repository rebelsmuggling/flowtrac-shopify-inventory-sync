import { NextRequest, NextResponse } from 'next/server';
const { SellingPartner } = require('amazon-sp-api');

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const feedId = url.searchParams.get('feedId');

    if (!feedId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: feedId'
      });
    }

    console.log(`Checking Amazon feed status for feedId: ${feedId}`);

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

    // Get feed status
    const feedStatus = await sellingPartner.callAPI({
      operation: 'getFeed',
      path: {
        feedId: feedId
      },
      endpoint: 'feeds'
    });

    console.log('Feed status response:', feedStatus);

    // Get feed processing report if available
    let processingReport = null;
    if (feedStatus.processingStatus === 'DONE' && feedStatus.resultFeedDocumentId) {
      try {
        const reportDoc = await sellingPartner.callAPI({
          operation: 'getFeedDocument',
          path: {
            feedDocumentId: feedStatus.resultFeedDocumentId
          },
          endpoint: 'feeds'
        });

        if (reportDoc.url) {
          const reportResponse = await fetch(reportDoc.url);
          if (reportResponse.ok) {
            processingReport = await reportResponse.text();
          }
        }
      } catch (reportError) {
        console.error('Error getting processing report:', reportError);
      }
    }

    return NextResponse.json({
      success: true,
      feedId,
      feedStatus,
      processingReport,
      environment: {
        hasMarketplaceId: !!process.env.AMAZON_MARKETPLACE_ID,
        marketplaceId: process.env.AMAZON_MARKETPLACE_ID
      }
    });

  } catch (error) {
    console.error('Error checking Amazon feed status:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
