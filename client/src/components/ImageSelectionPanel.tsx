import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api, type UnsplashImage } from "@/lib/api";

interface ImageSelectionPanelProps {
  searchQuery: string;
  selectedImage: UnsplashImage | null;
  onImageSelect: (image: UnsplashImage) => void;
  blogTopic: string;
  currentBlog?: any;
  onReplaceImage?: (imageIndex: number, newImage: UnsplashImage) => void;
}

export default function ImageSelectionPanel({
  searchQuery,
  selectedImage,
  onImageSelect,
  blogTopic,
  currentBlog,
  onReplaceImage,
}: ImageSelectionPanelProps) {
  const [customSearchQuery, setCustomSearchQuery] = useState("");
  const [images, setImages] = useState<UnsplashImage[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const { toast } = useToast();

  // Search images mutation
  const searchImagesMutation = useMutation({
    mutationFn: (query: string) => api.searchImages(query),
    onSuccess: (data) => {
      setImages(data.images);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to search images. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Smart image search mutation (content-aware)
  const smartSearchMutation = useMutation({
    mutationFn: ({ content, title, silent = false }: { content: string; title: string; silent?: boolean }) => 
      api.smartSearchImages(content, title),
    onSuccess: (data, variables) => {
      setImages(data.images);
      // Only show toast if not in silent mode (when triggered by user typing)
      if (!variables.silent) {
        toast({
          title: "Smart Search Complete",
          description: `Found ${data.images.length} images matching your article content`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to perform smart search. Using regular search instead.",
        variant: "destructive",
      });
      // Fallback to regular search
      if (searchQuery) {
        searchImagesMutation.mutate(searchQuery);
      }
    },
  });

  // Generate image with DALL-E mutation
  const generateImageMutation = useMutation({
    mutationFn: (prompt: string) => api.generateImage(prompt),
    onSuccess: (data) => {
      const dalleImage: UnsplashImage = {
        id: `dalle_${Date.now()}`,
        url: data.url,
        thumbUrl: data.url,
        description: data.description,
        photographer: "DALL-E",
        downloadUrl: data.url,
      };
      // Add DallE image to the front of the images array for immediate selection
      setImages(prevImages => [dalleImage, ...prevImages]);
      onImageSelect(dalleImage);
      toast({
        title: "Custom Image Generated",
        description: "DALL·E image added to replacement options",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate custom image. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-search when searchQuery changes - use smart search if blog content is available
  useEffect(() => {
    if (searchQuery) {
      // Debounce the search to prevent excessive API calls and toast notifications
      const timeoutId = setTimeout(() => {
        // Use smart search if we have blog content, otherwise fallback to regular search
        if (currentBlog && currentBlog.content && currentBlog.title) {
          smartSearchMutation.mutate({ content: currentBlog.content, title: currentBlog.title, silent: true });
        } else {
          searchImagesMutation.mutate(searchQuery);
        }
      }, 1000); // Wait 1 second after user stops typing

      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, currentBlog]);

  const handleCustomSearch = () => {
    if (customSearchQuery.trim()) {
      searchImagesMutation.mutate(customSearchQuery);
    }
  };

  const handleRefresh = () => {
    if (searchQuery) {
      searchImagesMutation.mutate(searchQuery);
    }
  };

  const handleSmartSearch = () => {
    if (currentBlog && currentBlog.content && currentBlog.title) {
      smartSearchMutation.mutate({ content: currentBlog.content, title: currentBlog.title });
    } else {
      toast({
        title: "No Content Available",
        description: "Generate blog content first to use smart image search",
        variant: "destructive",
      });
    }
  };

  const handleGenerateWithDALLE = () => {
    const prompt = blogTopic || searchQuery || "blog post image";
    generateImageMutation.mutate(prompt);
  };

  return (
    <div className="lg:col-span-1">
      <Card className="sticky top-24">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Featured Image</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={searchImagesMutation.isPending}
            >
              <RefreshCw className={`w-4 h-4 ${searchImagesMutation.isPending ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Blog Images */}
          {currentBlog?.images && currentBlog.images.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Article Images ({currentBlog.images.length} total)</h3>
              <div className="space-y-2">
                {currentBlog.images.map((image: any, index: number) => (
                  <div 
                    key={index} 
                    className={`flex items-center space-x-3 p-2 rounded-lg border cursor-pointer transition-all ${
                      selectedImageIndex === index 
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                        : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => setSelectedImageIndex(index)}
                  >
                    <img
                      src={image.thumbUrl || image.url}
                      alt={image.description}
                      className="w-12 h-12 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">Image {index + 1}</p>
                      <p className="text-xs text-gray-500 truncate">{image.description}</p>
                      <p className="text-xs text-gray-400">by {image.photographer}</p>
                    </div>
                    <Badge variant={selectedImageIndex === index ? "default" : "outline"} className="text-xs">
                      {selectedImageIndex === index ? "Selected" : "Active"}
                    </Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-blue-600 mt-2 font-medium">
                Step 1: Click an image above to select it for replacement<br/>
                Step 2: Choose a new image from options below or generate with DALL·E
              </p>
            </div>
          )}

          {/* Current Selected Image for new blogs */}
          {selectedImage && !currentBlog?.images?.length && (
            <div className="mb-6">
              <div className="relative group">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.description}
                  className="w-full h-32 object-cover rounded-lg"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">{selectedImage.description}</p>
              <p className="text-xs text-gray-400">Photo by {selectedImage.photographer}</p>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative">
            <Input
              placeholder="Search for different images..."
              value={customSearchQuery}
              onChange={(e) => setCustomSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomSearch()}
              className="pl-10"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          </div>

          {/* Image Options */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">
              {currentBlog?.images?.length > 0 ? `Replacement Options (Click to replace Image ${selectedImageIndex + 1})` : 'Suggested Images'}
            </h3>
            
            {searchImagesMutation.isPending ? (
              <div className="grid grid-cols-2 gap-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {images.slice(0, 4).map((image) => (
                  <div
                    key={image.id}
                    onClick={() => {
                      onImageSelect(image);
                      // If blog exists and has images, replace the selected image
                      if (currentBlog?.images?.length > 0 && onReplaceImage) {
                        onReplaceImage(selectedImageIndex, image);
                        toast({
                          title: "Image Replaced",
                          description: `Image ${selectedImageIndex + 1} has been updated`,
                        });
                      }
                    }}
                    className="relative group cursor-pointer"
                  >
                    <img
                      src={image.thumbUrl}
                      alt={image.description}
                      className={`w-full h-16 object-cover rounded-lg border-2 transition-all ${
                        selectedImage?.id === image.id
                          ? "border-primary"
                          : "border-transparent hover:border-primary"
                      }`}
                    />
                    {image.photographer === "DALL-E" && (
                      <div className="absolute top-1 left-1 bg-purple-600 text-white text-xs px-1 rounded">
                        AI
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-20 transition-all rounded-lg"></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DALL-E Generation */}
          <div className="border-t border-gray-200 pt-4">
            <Button
              onClick={handleGenerateWithDALLE}
              disabled={generateImageMutation.isPending}
              className="w-full bg-secondary hover:bg-purple-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {generateImageMutation.isPending ? "Generating..." : "Generate with DALL·E"}
            </Button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Create a custom image if none of the options work
            </p>
          </div>

          {/* Image Stats */}
          <div className="pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-sm font-medium text-gray-900">12</p>
                <p className="text-xs text-gray-500">Unsplash Used</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">3</p>
                <p className="text-xs text-gray-500">DALL·E Generated</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
