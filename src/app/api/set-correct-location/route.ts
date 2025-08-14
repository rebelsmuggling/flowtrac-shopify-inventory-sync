import { NextRequest, NextResponse } from 'next/server';
import { setMantecaLocationId } from '../../../../services/shopify';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const locationId = body.locationId;
    
    if (!locationId) {
      return NextResponse.json({
        success: false,
        error: 'locationId is required'
      });
    }
    
    console.log(`Setting correct location ID: ${locationId}`);
    
    // Set the correct location ID
    setMantecaLocationId(locationId);
    
    return NextResponse.json({
      success: true,
      message: `Location ID set to: ${locationId}`,
      nextSteps: [
        'Run the location diagnostic to verify the correct location is being used',
        'Test Session 2 again to see if it now updates the correct warehouse',
        'If successful, run the full sync process'
      ]
    });
    
  } catch (error) {
    console.error('Error setting location ID:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
