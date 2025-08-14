import { NextRequest, NextResponse } from 'next/server';
import { setMantecaLocationId } from '../../../../services/shopify';

export async function POST(request: NextRequest) {
  try {
    console.log('Setting Manteca location ID to: 101557567797');
    
    // Set the correct Manteca location ID
    setMantecaLocationId('101557567797');
    
    return NextResponse.json({
      success: true,
      message: 'Manteca location ID set to: 101557567797',
      nextSteps: [
        'Test Session 2 to see if it now updates the correct warehouse',
        'If successful, run the full sync process'
      ]
    });
    
  } catch (error) {
    console.error('Error setting Manteca location ID:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
