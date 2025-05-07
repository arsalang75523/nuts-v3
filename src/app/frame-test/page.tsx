import { Metadata } from 'next';

// Define the metadata for this page
export const metadata: Metadata = {
  title: 'Farcaster Frame Test',
  description: 'Test page for Farcaster Frames',
  openGraph: {
    images: ['/opengraph-image'],
  },
  other: {
    // Frame Metadata
    'fc:frame': 'vNext',
    'fc:frame:image': `${process.env.NEXT_PUBLIC_URL}/opengraph-image`,
    'fc:frame:button:1': process.env.NEXT_PUBLIC_FRAME_BUTTON_TEXT || 'Launch Frame',
    'fc:frame:post_url': `${process.env.NEXT_PUBLIC_URL}/api/webhook`,
  },
};

export default function FrameTest() {
  const appUrl = process.env.NEXT_PUBLIC_URL || 'https://specialt.work.gd';
  
  return (
    <div className="max-w-2xl mx-auto p-6 font-sans">
      <h1 className="text-2xl font-bold mb-4">Farcaster Frame Test Page</h1>
      <p className="mb-2">This page contains the necessary metadata for Farcaster Frame validation.</p>
      
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">Environment Configuration</h2>
        <ul className="list-disc list-inside">
          <li>NEXT_PUBLIC_URL: {process.env.NEXT_PUBLIC_URL || 'Not set'}</li>
          <li>FID: {process.env.FID || 'Not set'}</li>
          <li>Frame Name: {process.env.NEXT_PUBLIC_FRAME_NAME || 'Not set'}</li>
        </ul>
      </div>
      
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Testing Links</h2>
        <ul className="space-y-2">
          <li>
            <a 
              href="https://warpcast.com/~/developers/frames" 
              target="_blank" 
              className="text-blue-600 hover:underline"
            >
              Warpcast Frame Developer Tools
            </a>
          </li>
          <li>
            <a 
              href={`${appUrl}/.well-known/farcaster.json`} 
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              View Your Manifest
            </a>
          </li>
        </ul>
      </div>
      
      <div className="border-l-4 border-yellow-500 pl-4 py-2 bg-yellow-50">
        <h3 className="font-semibold">Debugging Tips</h3>
        <p className="text-sm mt-1">
          If you&#39;re seeing validation issues, make sure:
        </p>
        <ul className="list-disc list-inside text-sm mt-1">
          <li>Your manifest is accessible at <code className="bg-gray-200 px-1">{appUrl}/.well-known/farcaster.json</code></li>
          <li>You&#39;ve set the FID in your environment variables</li>
          <li>All URLs in your manifest use the correct domain</li>
        </ul>
      </div>
    </div>
  )
}
