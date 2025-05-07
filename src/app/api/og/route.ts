import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import React from 'react';

export const runtime = 'edge';

// Function to load the Poetsen One font
async function loadFont(): Promise<ArrayBuffer> {
  const res = await fetch(new URL('/public/fonts/poetsen-one.ttf', import.meta.url));
  return await res.arrayBuffer();
}

// This route handler will generate the same image as opengraph-image.tsx
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get('fid') || '443855'; // Default FID

    // Dynamically import key functions from opengraph-image.tsx
    const { default: generateImage } = await import('../../opengraph-image');
    
    // Generate the image using the same function from opengraph-image.tsx
    const imageResponse = await generateImage({ params: { fid } });
    
    return imageResponse;
  } catch (error) {
    console.error('Error generating OG image:', error);
    
    // Load the font for the error message
    const fontData = await loadFont();
    
    // Return a simple error image
    return new ImageResponse(
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #2b1409, #4a2512, #6b3a1e)',
            color: '#ffffff',
            fontFamily: '"Poetsen One", sans-serif',
          },
        },
        React.createElement(
          'h1',
          {
            key: 'title',
            style: { fontSize: '32px', color: '#f5c542' },
          },
          'Error generating image'
        ),
        React.createElement(
          'p',
          {
            key: 'message',
          },
          'Please try again later'
        )
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Poetsen One',
            data: fontData,
            style: 'normal',
            weight: 400,
          },
        ],
      }
    );
  }
}