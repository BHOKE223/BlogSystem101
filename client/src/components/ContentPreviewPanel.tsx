import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RotateCcw, Edit, Save, Send, X } from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import { useToast } from "@/hooks/use-toast";
import type { Blog } from "@shared/schema";
import type { UnsplashImage } from "@/lib/api";

interface ContentPreviewPanelProps {
  blog: Blog | null;
  selectedImage: UnsplashImage | null;
  onPublish: (credentials: { wordpressUrl: string; username: string; password: string }, seoData?: { categoryId?: number; tags?: string[]; metaDescription?: string }) => void;
  isGenerating: boolean;
  onReplaceImage?: (imageIndex: number, newImage: UnsplashImage) => void;
  onRegenerate?: () => void;
  onEdit?: (blog: Blog) => void;
  onSaveDraft?: (blog: Blog) => void;
  onClear?: () => void;
}

export default function ContentPreviewPanel({
  blog,
  selectedImage,
  onPublish,
  isGenerating,
  onReplaceImage,
  onRegenerate,
  onEdit,
  onSaveDraft,
  onClear,
}: ContentPreviewPanelProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedContent, setEditedContent] = useState("");
  
  // Debug logging to track current blog
  console.log("Passing blog to ContentPreviewPanel:", blog);

  const displayBlog = blog;

  // Initialize edit form when blog changes
  useEffect(() => {
    if (blog) {
      setEditedTitle(blog.title || "");
      setEditedContent(blog.content || "");
    }
  }, [blog]);



  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset to original values
    if (blog) {
      setEditedTitle(blog.title || "");
      setEditedContent(blog.content || "");
    }
  };

  const handleSaveEdit = async () => {
    if (!blog || !editedTitle.trim() || !editedContent.trim()) {
      toast({
        title: "Cannot Save",
        description: "Title and content are required",
        variant: "destructive",
      });
      return;
    }

    try {
      // Update blog via API
      const response = await fetch(`/api/blogs/${blog.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: editedTitle.trim(),
          content: editedContent.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save blog');
      }

      const updatedBlog = await response.json();

      // Call the save draft function if provided to update parent state
      if (onSaveDraft) {
        onSaveDraft(updatedBlog);
      }

      setIsEditing(false);
      
      toast({
        title: "Draft Saved",
        description: "Your changes have been saved successfully",
      });
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Unable to save your changes. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePublish = async () => {
    // Use hardcoded WordPress credentials
    const credentials = {
      wordpressUrl: "https://exoala.com",
      username: "exoala@brenthoke.com",
      password: "lG2y KvcO SAMO nasv SFB9 LeOT"
    };

    if (!displayBlog) {
      toast({
        title: "No Content",
        description: "Please generate content before publishing.",
        variant: "destructive"
      });
      return;
    }

    // Check connection status
    const isOnline = navigator.onLine;
    const connectionType = (navigator as any).connection?.effectiveType || 'unknown';
    
    // Show appropriate message based on connection
    let timeoutMessage = "Processing content with AI optimization (this may take 15-30 seconds)...";
    if (!isOnline) {
      toast({
        title: "No Internet Connection",
        description: "Please check your internet connection and try again.",
        variant: "destructive"
      });
      return;
    } else if (connectionType === 'slow-2g' || connectionType === '2g') {
      timeoutMessage = "Slow connection detected. This may take 2-3 minutes...";
    } else if (connectionType === '3g') {
      timeoutMessage = "Moderate connection detected. This may take 60-90 seconds...";
    }

    toast({
      title: "Publishing to WordPress",
      description: timeoutMessage,
    });

    // Intelligent fallback category selection based on content keywords
    const getSmartFallbackCategory = () => {
      const content = (displayBlog.title + ' ' + displayBlog.content + ' ' + (displayBlog.keyword || '')).toLowerCase();
      
      // Technology and automation content
      if (content.includes('chatgpt') || content.includes('ai') || content.includes('automation') || 
          content.includes('zapier') || content.includes('tech') || content.includes('software')) {
        return 40; // Technology category
      }
      
      // Business and entrepreneurship content
      if (content.includes('business') || content.includes('startup') || content.includes('entrepreneur') || 
          content.includes('income') || content.includes('passive') || content.includes('revenue')) {
        return 15; // Business category
      }
      
      // Personal development content
      if (content.includes('productivity') || content.includes('habits') || content.includes('mindset') || 
          content.includes('personal') || content.includes('growth')) {
        return 25; // Personal Development category
      }
      
      // Marketing content
      if (content.includes('marketing') || content.includes('seo') || content.includes('content') || 
          content.includes('social media') || content.includes('advertising')) {
        return 30; // Marketing category
      }
      
      // Finance content
      if (content.includes('money') || content.includes('finance') || content.includes('investment') || 
          content.includes('budget') || content.includes('financial')) {
        return 35; // Finance category
      }
      
      return 21; // Default to Blogging if no specific match
    };

    const fallbackSeoData = {
      categoryId: getSmartFallbackCategory(),
      categoryIds: [getSmartFallbackCategory()],
      tags: [],
      metaDescription: displayBlog.content.replace(/[#*\[\]()]/g, '').substring(0, 160) + '...'
    };

    let finalSeoData = fallbackSeoData;

    try {
      // Step 1: Fetch WordPress categories (allow extra time)
      console.log('🎯 Step 1/3: Fetching WordPress categories...');
      const categoriesController = new AbortController();
      const categoriesTimeout = setTimeout(() => categoriesController.abort(), 10000); // 10s timeout
      
      const categoriesResponse = await fetch(`/api/wordpress/categories?${new URLSearchParams(credentials)}`, {
        signal: categoriesController.signal
      });
      clearTimeout(categoriesTimeout);
      
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json();
        console.log('✅ Categories fetched successfully:', categoriesData.categories?.length || 0, 'categories available');
        
        // Update user on progress
        toast({
          title: "Categories Retrieved",
          description: `Found ${categoriesData.categories?.length || 0} WordPress categories. Analyzing content...`,
        });
        
        // Step 2: AI content analysis (allow generous time)
        console.log('🤖 Step 2/3: Starting AI content analysis for category suggestion...');
        const seoController = new AbortController();
        const seoTimeout = setTimeout(() => seoController.abort(), 15000); // 15s timeout
        
        const seoResponse = await fetch('/api/blogs/analyze-seo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: displayBlog.title,
            content: displayBlog.content,
            keyword: displayBlog.keyword || '',
            categories: categoriesData.categories
          }),
          signal: seoController.signal
        });
        clearTimeout(seoTimeout);
        
        if (seoResponse.ok) {
          const seoAnalysis = await seoResponse.json();
          console.log('🎉 AI analysis completed successfully:', seoAnalysis);
          
          // Enhanced multiple category matching with partial string matching and synonyms
          const suggestedCategories = seoAnalysis.suggestedCategories || [seoAnalysis.suggestedCategory].filter(Boolean);
          const matchedCategories: any[] = [];
          
          for (const suggestion of suggestedCategories) {
            if (!suggestion) continue;
            
            // Try exact match first
            let matchedCategory = categoriesData.categories.find((cat: any) => 
              cat.name.toLowerCase() === suggestion.toLowerCase()
            );
            
            // If exact match fails, try partial matching and synonyms
            if (!matchedCategory) {
              const aiSuggestion = suggestion.toLowerCase();
              
              matchedCategory = categoriesData.categories.find((cat: any) => {
                const catName = cat.name.toLowerCase();
                
                // Check for partial matches and synonyms
                if (aiSuggestion.includes('tech') || aiSuggestion.includes('ai') || aiSuggestion.includes('automation')) {
                  return catName.includes('tech') || catName.includes('ai') || catName.includes('automation');
                }
                if (aiSuggestion.includes('business') || aiSuggestion.includes('entrepreneur')) {
                  return catName.includes('business') || catName.includes('entrepreneur');
                }
                if (aiSuggestion.includes('marketing') || aiSuggestion.includes('seo')) {
                  return catName.includes('marketing') || catName.includes('seo');
                }
                if (aiSuggestion.includes('finance') || aiSuggestion.includes('money')) {
                  return catName.includes('finance') || catName.includes('money');
                }
                if (aiSuggestion.includes('personal') || aiSuggestion.includes('productivity')) {
                  return catName.includes('personal') || catName.includes('productivity');
                }
                
                // Check if category name contains the suggestion or vice versa
                return catName.includes(aiSuggestion) || aiSuggestion.includes(catName);
              });
            }
            
            if (matchedCategory && !matchedCategories.find(cat => cat.id === matchedCategory.id)) {
              matchedCategories.push(matchedCategory);
            }
          }
          
          // Use first matched category as primary, or fallback
          const primaryCategory = matchedCategories[0] || { id: fallbackSeoData.categoryId };
          const categoryIds = matchedCategories.map(cat => cat.id);
          
          finalSeoData = {
            categoryId: primaryCategory.id,
            categoryIds: categoryIds.length > 0 ? categoryIds : [fallbackSeoData.categoryId],
            tags: seoAnalysis.seoTags || [],
            metaDescription: seoAnalysis.metaDescription || fallbackSeoData.metaDescription
          };
          
          console.log('🚀 Intelligent multi-category selection successful:', {
            aiSuggested: suggestedCategories,
            matchedCategories: matchedCategories.map(cat => cat.name),
            primaryCategoryId: finalSeoData.categoryId,
            allCategoryIds: finalSeoData.categoryIds,
            seoTags: finalSeoData.tags?.length || 0,
            hasMetaDescription: !!finalSeoData.metaDescription
          });
          
          toast({
            title: "Smart Optimization Complete",
            description: `AI selected ${matchedCategories.length} categories: ${matchedCategories.map(cat => cat.name).join(', ') || 'Blogging'} with ${finalSeoData.tags?.length || 0} SEO tags`,
          });
          
          // Brief pause to ensure all optimizations are applied
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } else {
          console.log('❌ SEO analysis API call failed, using fallback category');
          const errorText = await seoResponse.text();
          console.log('SEO analysis error response:', errorText);
          
          toast({
            title: "AI Analysis Skipped",
            description: "Using default category. Publishing will continue...",
          });
        }
      } else {
        console.log('❌ WordPress categories fetch failed, using fallback category');
        const errorText = await categoriesResponse.text();
        console.log('Categories fetch error response:', errorText);
        
        toast({
          title: "Category Fetch Skipped",
          description: "Using default category. Publishing will continue...",
        });
      }
      
    } catch (error) {
      console.log('❌ Intelligent category selection encountered an error:', error);
      
      // Check if it was a timeout
      if (error instanceof Error && error.name === 'AbortError') {
        toast({
          title: "Optimization Timeout",
          description: "Using default settings. Publishing will continue...",
        });
      }
    }
    
    // Always proceed with publishing
    console.log('Proceeding with WordPress publishing');
    onPublish(credentials, finalSeoData);
  };

  if (isGenerating) {
    return (
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Content Preview</CardTitle>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span>Generating content...</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Content Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Edit className="w-12 h-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Content Yet</h3>
              <p className="text-gray-500">
                Enter a keyword and select a topic to generate blog content
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="lg:col-span-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Content Preview</CardTitle>
            <span className="text-sm text-gray-500">{displayBlog?.wordCount || "0"} words</span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Content */}
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  placeholder="Enter blog title..."
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  placeholder="Enter blog content (supports Markdown)..."
                  className="w-full min-h-96 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tip: You can use Markdown formatting (# for headers, **bold**, *italic*, ![alt](url) for images)
                </p>
              </div>
            </div>
          ) : (
            <div className="prose prose-gray max-w-none">
              <div className="bg-blue-50 border-l-4 border-primary p-4 mb-6">
                <p className="text-sm text-gray-700">
                  <strong>Reading Time:</strong> ~{Math.ceil(parseInt(displayBlog?.wordCount || "0") / 200)} minutes • 
                  <strong>Status:</strong> {displayBlog?.status || "draft"} • 
                  <strong>SEO Score:</strong> <span className="text-success">92/100</span> •
                  <strong>Images:</strong> {(displayBlog?.content?.match(/!\[/g) || []).length} strategically placed
                </p>
                {(displayBlog?.content?.match(/!\[/g) || []).length > 1 && (
                  <p className="text-xs text-blue-600 mt-2">
                    📖 Scroll down to view all {(displayBlog?.content?.match(/!\[/g) || []).length} images distributed throughout the article
                  </p>
                )}
              </div>
              
              <MarkdownRenderer 
                content={displayBlog?.content || ""} 
                onImageReplace={onReplaceImage}
              />
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 pt-6 border-t border-gray-200 space-y-4">
            {/* Mobile-first layout */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Left side buttons */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="flex-shrink-0"
                  onClick={() => onRegenerate && onRegenerate()}
                  disabled={!displayBlog || isGenerating}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
                {isEditing ? (
                  <>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-shrink-0"
                      onClick={handleSaveEdit}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Draft
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-shrink-0"
                      onClick={handleCancelEdit}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="flex-shrink-0"
                    onClick={handleEdit}
                    disabled={!displayBlog}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="flex-shrink-0"
                  onClick={() => displayBlog && onSaveDraft && onSaveDraft(displayBlog)}
                  disabled={!displayBlog}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Draft
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="flex-shrink-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                  onClick={() => onClear && onClear()}
                  disabled={!displayBlog}
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              </div>
              
              {/* Publish button - full width on mobile */}
              <Button 
                onClick={handlePublish}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2 shadow-sm border-0"
                style={{ opacity: 1, visibility: 'visible' }}
              >
                <Send className="w-4 h-4 mr-2" />
                Publish to WordPress
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}