import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';

export async function GET(request: NextRequest) {
  try {
    const { mapping, source } = await mappingService.getMapping();
    
    return NextResponse.json({
      success: true,
      mapping,
      source,
      productCount: mapping.products.length,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to load mapping:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 