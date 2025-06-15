import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Edit2 } from 'lucide-react';
import { UnsplashImage } from '@/lib/api';
import ImageReplacementDialog from './ImageReplacementDialog';
import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  onImageReplace?: (imageIndex: number, newImage: UnsplashImage) => void;
}

export default function MarkdownRenderer({ content, onImageReplace }: MarkdownRendererProps) {
  const [replacementDialog, setReplacementDialog] = useState({
    open: false,
    imageIndex: 0,
    currentImage: { src: '', alt: '', index: 0 }
  });

  const handleImageReplace = (imageIndex: number, newImage: UnsplashImage) => {
    console.log(`🔄 Replacing image at index ${imageIndex} with: ${newImage.url}`);
    if (onImageReplace) {
      onImageReplace(imageIndex, newImage);
    }
  };

  // Create stable image mapping from content
  const imageUrls = Array.from(content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)).map(match => match[2]);
  console.log(`📊 MarkdownRenderer: Found ${imageUrls.length} images in content:`, imageUrls);
  
  // Debug: Check for duplicate URLs
  const uniqueUrls = Array.from(new Set(imageUrls));
  if (uniqueUrls.length !== imageUrls.length) {
    console.warn(`⚠️ Duplicate image URLs detected! Total: ${imageUrls.length}, Unique: ${uniqueUrls.length}`);
  }

  const customComponents = {
    img: ({ src, alt, ...props }: any) => {
      const currentImageIndex = imageUrls.indexOf(src);
      console.log(`🖼️ Image ${currentImageIndex + 1} of ${imageUrls.length}: ${src.substring(src.lastIndexOf('/') + 1, src.indexOf('?'))}`);
      return (
        <div className="relative my-6 group">
          <img
            src={src}
            alt={alt}
            {...props}
            className="w-full max-w-2xl h-auto rounded-lg shadow-md"
            style={{
              maxHeight: '400px',
              objectFit: 'cover'
            }}
            onLoad={() => console.log(`✅ Markdown image loaded: ${src}`)}
            onError={() => console.error(`❌ Markdown image failed: ${src}`)}
          />
          {onImageReplace && (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/90 hover:bg-gray-800 border border-gray-600 text-white"
                onClick={() => {
                  console.log(`🎯 Replace button clicked for image ${currentImageIndex + 1} (index ${currentImageIndex})`);
                  setReplacementDialog({
                    open: true,
                    imageIndex: currentImageIndex,
                    currentImage: { src: src || '', alt: alt || '', index: currentImageIndex }
                  });
                }}
              >
                <Edit2 className="w-4 h-4 mr-1 text-white" />
                Replace
              </Button>
              <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                Image {currentImageIndex + 1} of {imageUrls.length}
              </div>
              <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded font-bold">
                #{currentImageIndex}
              </div>
            </>
          )}
        </div>
      );
    }
  };

  return (
    <div className="prose prose-gray max-w-none">
      <ReactMarkdown components={customComponents}>
        {content || "# Test Blog with Images\n\n![Test Image 1](https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=600&h=300)\n\nThis is a test blog post with images to verify rendering works correctly.\n\n![Test Image 2](https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=600&h=300)\n\nMore content here with another image."}
      </ReactMarkdown>

      <ImageReplacementDialog
        open={replacementDialog.open}
        onOpenChange={(open) => setReplacementDialog(prev => ({ ...prev, open }))}
        currentImage={replacementDialog.currentImage}
        onReplace={handleImageReplace}
      />
    </div>
  );
}