import { apiRequest } from "./queryClient";

export interface Topic {
  title: string;
  description: string;
  competition: string;
  intent: string;
}

export interface GenerateTopicsResponse {
  topics: Topic[];
}

export interface GenerateContentResponse {
  content: string;
  wordCount: string;
  title: string;
  images?: UnsplashImage[];
}

export interface UnsplashImage {
  id: string;
  url: string;
  thumbUrl: string;
  description: string;
  photographer: string;
  downloadUrl: string;
}

export interface SearchImagesResponse {
  images: UnsplashImage[];
}

export interface SmartSearchImagesResponse {
  images: UnsplashImage[];
  searchTerms: string[];
  total: number;
}

export interface GenerateImageResponse {
  url: string;
  description: string;
}

export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export interface WordPressCategoriesResponse {
  categories: WordPressCategory[];
}

export interface SEOAnalysisResponse {
  suggestedCategory: string;
  seoTags: string[];
  focusKeywords: string[];
  metaDescription: string;
}

export interface PublishResponse {
  success: boolean;
  wordpressUrl: string;
  publishedAt: string;
  categoryId?: number;
  tagIds?: number[];
  metaDescription?: string;
}

export const api = {
  // Topic generation
  generateTopics: async (keyword: string): Promise<GenerateTopicsResponse> => {
    const response = await apiRequest("POST", "/api/blogs/generate-topics", { keyword });
    return response.json();
  },

  // Content generation
  generateContent: async (title: string, keyword: string, articleLength?: string): Promise<GenerateContentResponse> => {
    const response = await apiRequest("POST", "/api/blogs/generate-content", { title, keyword, articleLength });
    return response.json();
  },

  // Image search
  searchImages: async (query: string, perPage = 5): Promise<SearchImagesResponse> => {
    const response = await apiRequest("GET", `/api/images/search?query=${encodeURIComponent(query)}&per_page=${perPage}`);
    return response.json();
  },

  // Smart image search based on blog content
  smartSearchImages: async (blogContent: string, blogTitle: string): Promise<SmartSearchImagesResponse> => {
    const response = await apiRequest("POST", "/api/images/smart-search", { blogContent, blogTitle });
    return response.json();
  },

  // Image generation
  generateImage: async (prompt: string): Promise<GenerateImageResponse> => {
    const response = await apiRequest("POST", "/api/images/generate", { prompt });
    return response.json();
  },

  // WordPress categories
  getWordPressCategories: async (credentials: { wordpressUrl: string; username: string; password: string }): Promise<WordPressCategoriesResponse> => {
    const params = new URLSearchParams(credentials);
    const response = await apiRequest("GET", `/api/wordpress/categories?${params}`);
    return response.json();
  },

  // SEO analysis
  analyzeSEO: async (blog: { title: string; content: string; keyword: string }, categories?: WordPressCategory[]): Promise<SEOAnalysisResponse> => {
    const response = await apiRequest("POST", "/api/blogs/analyze-seo", { ...blog, categories });
    return response.json();
  },

  // Blog publishing with SEO
  publishBlog: async (
    blogId: string, 
    credentials: { wordpressUrl: string; username: string; password: string },
    seoData?: { categoryId?: number; tags?: string[]; metaDescription?: string }
  ): Promise<PublishResponse> => {
    console.log("📡 API Client: Making publish request for blog:", blogId);
    
    try {
      const response = await apiRequest("POST", `/api/blogs/${blogId}/publish`, {
        ...credentials,
        ...seoData
      });
      
      console.log("📨 API Client: Response received, status:", response.status);
      console.log("📨 API Client: Response ok:", response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ API Client: Publishing failed with error:", errorText);
        
        // Check for specific authentication errors vs other failures
        if (response.status === 401 && errorText.toLowerCase().includes('authentication')) {
          throw new Error("WordPress authentication failed. Please check your credentials.");
        } else {
          throw new Error(`Publishing failed: ${response.status} - ${errorText}`);
        }
      }
      
      const jsonData = await response.json();
      console.log("📄 API Client: JSON parsed:", jsonData);
      
      // Validate response structure
      if (!jsonData || typeof jsonData !== 'object') {
        console.error("❌ API Client: Invalid response format");
        throw new Error("Invalid response format from server");
      }
      
      // Ensure success field is present
      if (jsonData.success === undefined && !jsonData.wordpressUrl) {
        console.error("❌ API Client: Response missing success indicators");
        throw new Error("Publishing response missing success confirmation");
      }
      
      console.log("✅ API Client: Publishing completed successfully");
      return jsonData;
      
    } catch (error) {
      console.error("❌ API Client: Publishing error:", error);
      throw error;
    }
  },
  
  // Update blog image
  updateBlogImage: async (blogId: string, imageIndex: number, newImage: UnsplashImage): Promise<any> => {
    console.log(`📡 API: Making PATCH request to /api/blogs/${blogId}/images/${imageIndex}`);
    console.log(`📡 API: Request body:`, { newImage });
    const response = await apiRequest("PATCH", `/api/blogs/${blogId}/images/${imageIndex}`, { newImage });
    const result = await response.json();
    console.log(`📨 API: Response received:`, result);
    return result;
  },
};
