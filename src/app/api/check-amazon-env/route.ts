import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check which Amazon environment variables are set (without exposing values)
    const amazonEnvVars = {
      AMAZON_SELLER_ID: !!process.env.AMAZON_SELLER_ID,
      AMAZON_MARKETPLACE_ID: !!process.env.AMAZON_MARKETPLACE_ID,
      AMAZON_REFRESH_TOKEN: !!process.env.AMAZON_REFRESH_TOKEN,
      AMAZON_CLIENT_ID: !!process.env.AMAZON_CLIENT_ID,
      AMAZON_CLIENT_SECRET: !!process.env.AMAZON_CLIENT_SECRET,
      AMAZON_AWS_ACCESS_KEY_ID: !!process.env.AMAZON_AWS_ACCESS_KEY_ID,
      AMAZON_AWS_SECRET_ACCESS_KEY: !!process.env.AMAZON_AWS_SECRET_ACCESS_KEY,
      AMAZON_ROLE_ARN: !!process.env.AMAZON_ROLE_ARN
    };

    // Show actual values for non-sensitive fields
    const publicValues = {
      AMAZON_SELLER_ID: process.env.AMAZON_SELLER_ID || 'NOT_SET',
      AMAZON_MARKETPLACE_ID: process.env.AMAZON_MARKETPLACE_ID || 'NOT_SET'
    };

    return NextResponse.json({
      success: true,
      environment_variables: amazonEnvVars,
      public_values: publicValues,
      missing_for_json_feed: !process.env.AMAZON_SELLER_ID ? ['AMAZON_SELLER_ID'] : []
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
