import { NextRequest, NextResponse } from 'next/server';
import { testFlowtracConnection } from '../../../../services/flowtrac';

export async function GET() {
  try {
    console.log('Testing Flowtrac connection...');
    
    // Check environment variables
    const hasCredentials = process.env.FLOWTRAC_API_URL && 
                          process.env.FLOWTRAC_BADGE && 
                          process.env.FLOWTRAC_PIN;
    
    if (!hasCredentials) {
      return NextResponse.json({
        success: false,
        error: 'Flowtrac credentials not configured',
        missing: {
          FLOWTRAC_API_URL: !process.env.FLOWTRAC_API_URL,
          FLOWTRAC_BADGE: !process.env.FLOWTRAC_BADGE,
          FLOWTRAC_PIN: !process.env.FLOWTRAC_PIN
        }
      }, { status: 500 });
    }
    
    // Test the connection
    const result = await testFlowtracConnection();
    
    if (result.error) {
      return NextResponse.json({
        success: false,
        error: result.error,
        details: result
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Flowtrac connection successful',
      productsCount: Array.isArray(result) ? result.length : 'Unknown',
      sampleProducts: Array.isArray(result) ? result.slice(0, 3) : result
    });
    
  } catch (error) {
    console.error('Flowtrac connection test failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}
