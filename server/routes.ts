import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBlogSchema, updateBlogSchema, insertGitHubCredentialsSchema } from "@shared/schema";
import { GitHubService } from "./github-service";
import { backgroundServices } from "./background-services";
import { sourceBackupService } from "./source-backup-service";
import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

// Multiple Unsplash API keys for rotation
const UNSPLASH_KEYS = [
  process.env.UNSPLASH_ACCESS_KEY,
  process.env.UNSPLASH_ACCESS_KEY_2,
  process.env.UNSPLASH_ACCESS_KEY_3,
  process.env.UNSPLASH_ACCESS_KEY_4
].filter(Boolean); // Remove undefined keys

console.log(`Loaded ${UNSPLASH_KEYS.length} Unsplash API keys for rotation`);

let currentKeyIndex = 0;

// Function to get next available API key
function getNextUnsplashKey() {
  if (UNSPLASH_KEYS.length === 0) return null;
  const key = UNSPLASH_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % UNSPLASH_KEYS.length;
  return key;
}

// Function to make Unsplash API request with key rotation
async function fetchWithUnsplashRotation(url: string, retries = UNSPLASH_KEYS.length) {
  for (let i = 0; i < retries; i++) {
    const apiKey = getNextUnsplashKey();
    if (!apiKey) return null;
    
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Client-ID ${apiKey}` }
      });
      
      if (response.ok) {
        return response;
      } else if (response.status === 403 && i < retries - 1) {
        // Rate limit exceeded, try next key
        console.log(`Rate limit exceeded for key ${i + 1}, trying next key...`);
        continue;
      }
    } catch (error) {
      console.error(`Error with API key ${i + 1}:`, error);
      if (i < retries - 1) continue;
    }
  }
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Initialize background services
  await backgroundServices.initialize();
  
  // Get all blogs
  app.get("/api/blogs", async (_req, res) => {
    try {
      const blogs = await storage.getAllBlogs();
      res.json(blogs);
    } catch (error) {
      console.error("Error fetching blogs:", error);
      res.status(500).json({ error: "Failed to fetch blogs" });
    }
  });

  // Get single blog
  app.get("/api/blogs/:id", async (req, res) => {
    try {
      const blog = await storage.getBlog(req.params.id);
      if (!blog) {
        return res.status(404).json({ error: "Blog not found" });
      }
      res.json(blog);
    } catch (error) {
      console.error("Error fetching blog:", error);
      res.status(500).json({ error: "Failed to fetch blog" });
    }
  });

  // Generate blog topics from keyword
  app.post("/api/blogs/generate-topics", async (req, res) => {
    try {
      const { keyword } = req.body;
      
      if (!keyword) {
        return res.status(400).json({ error: "Keyword is required" });
      }

      console.log(`Generating topics for keyword: ${keyword}`);

      if (!openai.apiKey) {
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      const prompt = `Generate 5 practical blog topics for "${keyword}" that provide actionable, step-by-step guidance with natural, varied titles.

      CRITICAL REQUIREMENTS:
      - Focus on practical tutorials and step-by-step guides
      - Create titles that promise specific, actionable outcomes
      - Use varied, natural language - avoid repetitive "How to" phrasing
      - Emphasize concrete methods, processes, and implementations
      - Each topic should solve a real problem with clear steps
      - Focus on life-changing, practical knowledge readers can immediately apply
      
      EXAMPLES OF PREFERRED NATURAL TITLES:
      ✓ "Building a Profitable Email List from Scratch in 30 Days"
      ✓ "Complete Guide to Setting Up Automated Workflows"
      ✓ "Creating Professional Videos with Just Your Phone"
      ✓ "Launch Your First Online Course: A Step-by-Step Blueprint"
      ✓ "Master Cold Email Outreach: 7 Templates That Get Results"
      ✓ "Transform Your Website Traffic with These SEO Strategies"
      
      AVOID THESE TYPES:
      ✗ "The Future of Digital Marketing in 2025"
      ✗ "Top Trends in E-commerce"
      ✗ "Understanding the Impact of AI"
      ✗ "Why Social Media Marketing Matters"
      ✗ Repetitive "How to" beginnings
      
      Return JSON:
      {
        "topics": [
          {
            "title": "Natural, action-focused title without repetitive patterns",
            "description": "Step-by-step process description with clear benefits",
            "competition": "Low|Medium|High",
            "intent": "Educational"
          }
        ]
      }`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Using faster model for topic generation
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      console.log("OpenAI response received");
      const result = JSON.parse(response.choices[0].message.content || "{}");
      res.json(result);
    } catch (error) {
      console.error("Error generating topics:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('timeout')) {
        res.status(500).json({ error: "Request timed out. Please try again." });
      } else if (errorMessage.includes('API')) {
        res.status(500).json({ error: "OpenAI API error. Please check your API key." });
      } else {
        res.status(500).json({ error: "Failed to generate topics" });
      }
    }
  });

  // Generate blog content
  app.post("/api/blogs/generate-content", async (req, res) => {
    try {
      const { title, keyword, articleLength = 'long' } = req.body;
      
      if (!title || !keyword) {
        return res.status(400).json({ error: "Title and keyword are required" });
      }

      // Article length configurations
      const lengthConfigs = {
        'short': { words: '300-400', targetWords: 350, images: 1, sections: 2 },
        'medium': { words: '500-700', targetWords: 600, images: 2, sections: 3 },
        'long': { words: '1400-1700', targetWords: 1500, images: 4, sections: 5 },
        'extra-long': { words: '2500-3000', targetWords: 2750, images: 6, sections: 7 }
      };

      const config = lengthConfigs[articleLength as keyof typeof lengthConfigs] || lengthConfigs.long;

      const prompt = `Write a detailed SEO blog post: "${title}" for keyword "${keyword}".

      WORD COUNT TARGET: ${config.words} words (${config.targetWords} target)
      
      STRUCTURE FOR ${articleLength.toUpperCase()} ARTICLE:
      ${articleLength === 'short' ? 
        `- Introduction (80 words): Hook + overview
         - ${config.sections} main sections (100-120 words each): Key points with examples
         - Conclusion (50 words): Summary + call to action` :
        articleLength === 'medium' ?
        `- Introduction (100 words): Hook + overview
         - ${config.sections} main sections (140-180 words each): Detailed explanations
         - FAQ section (100 words): 2-3 questions
         - Conclusion (80 words): Summary + action steps` :
        articleLength === 'long' ?
        `- Introduction (200 words): Hook + overview
         - ${config.sections} main sections (200-300 words each): Deep explanations with examples
         - FAQ section (200 words): 3-4 questions with detailed answers
         - Conclusion (150 words): Summary + action steps` :
        `- Introduction (300 words): Comprehensive hook + detailed overview
         - ${config.sections} main sections (300-400 words each): In-depth analysis with multiple examples
         - FAQ section (300 words): 5-6 questions with thorough answers
         - Case studies/examples section (200 words)
         - Conclusion (200 words): Complete summary + multiple action steps`
      }

      STEP-BY-STEP TUTORIAL FOCUS - ACTIONABLE CONTENT:
      📋 Create practical tutorials:
      - Break down complex processes into numbered steps
      - Include specific actions readers can take immediately
      - Provide exact methods, tools, and implementations
      - Focus on "how to do X" rather than "what is X"
      - Include troubleshooting tips and common mistakes to avoid

      🎯 Structure for maximum actionability:
      - Lead with the outcome: "Here's exactly how to..."
      - Number all major steps clearly (Step 1, Step 2, etc.)
      - Include sub-steps with bullet points for detailed processes
      - Add "Pro Tips" boxes for expert insights
      - End each section with what the reader accomplished

      HUMAN WRITING STYLE - MUST SOUND LIKE A REAL EXPERT, NOT AI:
      ✂️ Remove filler phrases:
      - NEVER use: "It's important to note", "In today's fast-paced world", "Let's dive into", "This article will explore"
      - Just say what you mean directly

      🧠 Natural, conversational tone:
      - Write like you talk to a friend
      - Start sentences with "And" or "But" when natural
      - Avoid robotic or overly formal language
      - Use "you" and "your" throughout

      🗣️ Be direct and clear:
      - Short, punchy sentences mixed with longer ones
      - Cut all fluff and over-explanation
      - Say "Here's how it works" instead of introductory phrases

      🛑 Avoid AI giveaways:
      - No "revolutionary" or "game-changing" hype
      - Be helpful, honest, grounded
      - Write like a smart human expert sharing knowledge

      🔁 Vary sentence structure:
      - Mix short, medium, and long sentences for natural rhythm
      - Use active voice: "The team launched" not "was launched by the team"

      MANDATORY IMAGE PLACEHOLDERS - STRATEGIC PLACEMENT:
      For articles 800-1500 words: Include {{HEADER_IMAGE}}, {{IMAGE_1}}, {{IMAGE_2}}
      For articles 1500-2500 words: Include {{HEADER_IMAGE}}, {{IMAGE_1}}, {{IMAGE_2}}, {{IMAGE_3}}
      For articles 2500+ words: Include {{HEADER_IMAGE}}, {{IMAGE_1}}, {{IMAGE_2}}, {{IMAGE_3}}, {{IMAGE_4}}, {{IMAGE_5}}
      
      PLACEMENT RULES:
      - {{HEADER_IMAGE}} immediately after main title
      - Distribute other images evenly throughout major sections
      - Place images after section headers for maximum impact
      - Never place images in FAQ sections

      LINKING REQUIREMENTS:
      - Link ALL tool/service mentions: [Tool Name](https://officialurl.com)
      - Use clean markdown format without duplicate URLs
      - Include 5-7 authority links (.org, .edu, .gov)
      - NO placeholder brackets like [City], [Tool Name], [Address]

      EXAMPLES OF STEP-BY-STEP TUTORIAL CONTENT:
      ✓ "Here's exactly how to set up your first automated workflow:"
      ✓ "Step 1: Download [Buffer](https://buffer.com) and create your account"
      ✓ "Follow these three steps to avoid the most common mistakes:"
      ✓ "By the end of this section, you'll have a working system that..."
      ✓ "Pro tip: Skip the premium features until you master the basics."
      ✓ "Most people get stuck here, but here's the simple fix..."
      
      WRONG - NEVER USE THESE AI PHRASES:
      ✗ "In today's digital landscape..."
      ✗ "Let's explore the world of..."
      ✗ "It's important to note that..."
      ✗ "This comprehensive guide will..."
      ✗ "The benefits of X include..."
      ✗ "X is a powerful tool that..."

      Return JSON:
      {
        "content": "complete markdown with image placeholders, real external links, and human-like writing",
        "wordCount": "actual count",
        "title": "Professional SEO title"
      }`;

      console.log(`Generating content for: ${title}`);
      
      const response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 4096,
          temperature: 0.8,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Content generation timeout')), 45000)
        )
      ]) as any;

      console.log("Content generation completed");

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      // Auto-fetch images with simple, reliable search terms
      if (UNSPLASH_KEYS.length > 0) {
        try {
          // Generate search queries from keyword based on article length
          const searchQueries = [
            keyword,
            `${keyword} tips`,
            `${keyword} guide`,
            `${keyword} tools`,
            `${keyword} best practices`,
            `${keyword} examples`,
            `${keyword} strategies`,
            `${keyword} methods`
          ];
          
          const allImages = [];
          const imagesNeeded = config.images;
          const queriesNeeded = Math.min(searchQueries.length, imagesNeeded);
          
          console.log(`🖼️ Fetching ${imagesNeeded} images for ${articleLength} article`);
          
          for (let i = 0; i < queriesNeeded; i++) {
            const imageResponse = await fetchWithUnsplashRotation(
              `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQueries[i])}&per_page=2&orientation=landscape`
            );
            
            if (imageResponse && imageResponse.ok) {
              const imageData = await imageResponse.json();
              if (imageData.results.length > 0) {
                // Take the best image from each search query
                const photosToAdd = imageData.results.slice(0, Math.min(2, imageData.results.length));
                for (const photo of photosToAdd) {
                  allImages.push({
                    id: photo.id,
                    url: photo.urls.regular,
                    thumbUrl: photo.urls.thumb,
                    description: photo.alt_description || photo.description || searchQueries[i],
                    photographer: photo.user.name,
                    downloadUrl: photo.links.download_location
                  });
                  
                  // Stop when we have enough images based on article length
                  if (allImages.length >= imagesNeeded) break;
                }
              }
            }
            
            // Stop searching if we already have enough images
            if (allImages.length >= imagesNeeded) break;
          }
          
          console.log(`Collected ${allImages.length} images for content generation`);
          
          if (allImages.length > 0) {
            // Replace all image placeholders with actual images
            let contentWithImages = result.content;
            
            // Strategic image placement based on word count for professional blog layout
            if (allImages.length >= 1) {
              console.log(`Implementing strategic image placement for ${allImages.length} images`);
              
              // Calculate optimal image count based on word count
              const wordCount = result.content.split(/\s+/).length;
              let targetImageCount = 1; // Always include header image
              
              if (wordCount < 800) {
                targetImageCount = Math.min(2, allImages.length); // Short articles: 2 images
              } else if (wordCount < 1500) {
                targetImageCount = Math.min(3, allImages.length); // Medium articles: 3 images
              } else if (wordCount < 2500) {
                targetImageCount = Math.min(4, allImages.length); // Long articles: 4 images
              } else {
                targetImageCount = Math.min(6, allImages.length); // Very long articles: 6 images
              }
              
              console.log(`Article has ${wordCount} words, targeting ${targetImageCount} images`);
              
              // Replace header image placeholder
              if (allImages[0]) {
                const headerImageMd = `![${allImages[0].description}](${allImages[0].url})\n*Photo by ${allImages[0].photographer} on Unsplash*`;
                contentWithImages = contentWithImages.replace(/\{\{HEADER_IMAGE\}\}/g, headerImageMd);
              }
              
              // Replace content image placeholders (support up to 5 content images)
              for (let i = 1; i <= 5 && i < allImages.length; i++) {
                const imageMarkdown = `![${allImages[i].description}](${allImages[i].url})\n*Photo by ${allImages[i].photographer} on Unsplash*`;
                const placeholder = `{{IMAGE_${i}}}`;
                if (contentWithImages.includes(placeholder)) {
                  contentWithImages = contentWithImages.replace(new RegExp(placeholder, 'g'), imageMarkdown);
                  console.log(`Replaced ${placeholder} with actual image`);
                }
              }
              
              // Clean up any remaining placeholders
              contentWithImages = contentWithImages.replace(/\{\{[^}]+\}\}/g, '');
              
              const finalImageCount = (contentWithImages.match(/!\[/g) || []).length;
              console.log(`Enhanced content now contains ${finalImageCount} images optimized for ${wordCount} words`);
            }
            
            result.content = contentWithImages;
            result.images = allImages.slice(0, 4);
            
            console.log(`Returning content with ${contentWithImages.split('![').length - 1} images to client`);
          }
        } catch (error) {
          console.error("Error fetching images:", error);
        }
      }

      // Save the generated blog to database
      try {
        const blogData = {
          keyword: keyword,
          title: title,
          content: result.content,
          wordCount: result.content.split(/\s+/).length.toString(),
          status: "draft" as const
        };
        
        const savedBlog = await storage.createBlog(blogData);
        console.log(`Blog saved to database with ID: ${savedBlog.id}`);
        
        // Schedule source code backup after blog generation
        backgroundServices.scheduleSourceBackup();
        
        // Return the saved blog instead of just the generated content
        res.json(savedBlog);
      } catch (saveError) {
        console.error("Error saving blog to database:", saveError);
        // Return the generated content even if save fails
        res.json(result);
      }
    } catch (error) {
      console.error("Error generating content:", error);
      res.status(500).json({ error: "Failed to generate content" });
    }
  });

  // Search Unsplash images
  app.get("/api/images/search", async (req, res) => {
    try {
      const { query, per_page = 5 } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      if (UNSPLASH_KEYS.length === 0) {
        return res.status(500).json({ error: "Unsplash API key not configured" });
      }

      const response = await fetchWithUnsplashRotation(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query as string)}&per_page=${per_page}&orientation=landscape`
      );

      if (!response || !response.ok) {
        throw new Error(`Unsplash API error: ${response?.status || 'Network error'}`);
      }

      const data = await response.json();
      
      const images = data.results.map((img: any) => ({
        id: img.id,
        url: img.urls.regular,
        thumbUrl: img.urls.thumb,
        description: img.alt_description || img.description || "Unsplash image",
        photographer: img.user.name,
        downloadUrl: img.links.download_location
      }));

      res.json({ images });
    } catch (error) {
      console.error("Error searching images:", error);
      res.status(500).json({ error: "Failed to search images" });
    }
  });

  // Smart image search based on blog content
  app.post("/api/images/smart-search", async (req, res) => {
    try {
      const { blogContent, blogTitle } = req.body;
      
      if (!blogContent || !blogTitle) {
        return res.status(400).json({ error: "Blog content and title are required" });
      }

      console.log("Generating smart image search terms for:", blogTitle);
      
      const imageSearchPrompt = `Analyze this blog article and generate 4 highly specific image search terms that would perfectly match the visual content needed:

Article Title: "${blogTitle}"
Article Content: "${blogContent.substring(0, 1200)}..."

Generate search terms that are:
1. Specific to the actual topics discussed in the article
2. Visually descriptive and concrete
3. Suitable for finding relevant stock photos
4. Avoid generic business or workspace terms

Return exactly 4 search terms as a JSON array.
Example: {"searchTerms": ["sustainable fashion wardrobe", "eco friendly clothing", "minimalist closet organization", "ethical fashion brands"]}`;

      const imageSearchResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: imageSearchPrompt }],
        response_format: { type: "json_object" },
        max_tokens: 150,
        temperature: 0.3
      });

      const searchResult = JSON.parse(imageSearchResponse.choices[0].message.content || "{}");
      const searchTerms = searchResult.searchTerms || [];
      
      console.log("Generated smart search terms:", searchTerms);

      // Search for images using the AI-generated terms
      const allImages = [];
      
      for (const searchTerm of searchTerms) {
        try {
          const response = await fetchWithUnsplashRotation(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchTerm)}&per_page=6&orientation=landscape`
          );

          if (response && response.ok) {
            const data = await response.json();
            const images = data.results.map((photo: any) => ({
              id: photo.id,
              url: photo.urls.regular,
              thumbUrl: photo.urls.thumb,
              description: photo.alt_description || photo.description || searchTerm,
              photographer: photo.user.name,
              downloadUrl: photo.links.download_location,
              searchTerm: searchTerm
            }));
            
            allImages.push(...images);
          }
        } catch (error) {
          console.error(`Error searching for "${searchTerm}":`, error);
        }
      }

      console.log(`Found ${allImages.length} smart-matched images`);
      
      res.json({ 
        images: allImages.slice(0, 24), // Limit to 24 most relevant images
        searchTerms: searchTerms,
        total: allImages.length 
      });

    } catch (error) {
      console.error("Error in smart image search:", error);
      res.status(500).json({ error: "Failed to generate smart image search" });
    }
  });

  // Generate image with DALL-E
  app.post("/api/images/generate", async (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: `Create a professional, high-quality image for a blog post: ${prompt}. Style should be modern, clean, and suitable for web publishing.`,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      });

      if (!response.data || response.data.length === 0) {
        throw new Error("No image generated");
      }

      res.json({ 
        url: response.data[0].url,
        description: prompt
      });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });

  // Create blog
  app.post("/api/blogs", async (req, res) => {
    try {
      const validatedData = insertBlogSchema.parse(req.body);
      const blog = await storage.createBlog(validatedData);
      res.status(201).json(blog);
    } catch (error) {
      console.error("Error creating blog:", error);
      res.status(400).json({ error: "Invalid blog data" });
    }
  });

  // Update blog images
  app.patch("/api/blogs/:id/images", async (req, res) => {
    try {
      const { id } = req.params;
      const { imageIndex, newImage } = req.body;
      
      const blog = await storage.getBlog(id);
      if (!blog) {
        return res.status(404).json({ error: "Blog not found" });
      }
      
      // Update the specific image and replace it in content
      const images = Array.isArray(blog.images) ? [...blog.images] : [];
      const oldImage = images[imageIndex];
      if (images.length > imageIndex) {
        images[imageIndex] = newImage;
      } else {
        images.push(newImage);
      }
      
      // Replace image in content
      let updatedContent = blog.content;
      if (oldImage && newImage) {
        const oldImageMarkdown = `![${oldImage.description}](${oldImage.url})`;
        const newImageMarkdown = `![${newImage.description}](${newImage.url})`;
        updatedContent = updatedContent.replace(oldImageMarkdown, newImageMarkdown);
      }
      
      const updatedBlog = await storage.updateBlog(id, { 
        images, 
        content: updatedContent 
      });
      
      res.json(updatedBlog);
    } catch (error) {
      console.error("Error updating blog images:", error);
      res.status(500).json({ error: "Failed to update blog images" });
    }
  });

  // Update blog
  app.patch("/api/blogs/:id", async (req, res) => {
    try {
      const validatedData = updateBlogSchema.parse(req.body);
      const blog = await storage.updateBlog(req.params.id, validatedData);
      if (!blog) {
        return res.status(404).json({ error: "Blog not found" });
      }
      res.json(blog);
    } catch (error) {
      console.error("Error updating blog:", error);
      res.status(400).json({ error: "Invalid blog data" });
    }
  });

  // Save WordPress credentials
  app.post("/api/wordpress/credentials", async (req, res) => {
    try {
      const { name, wordpressUrl, username, password } = req.body;
      
      if (!name || !wordpressUrl || !username || !password) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const credentials = {
        name,
        wordpressUrl,
        username,
        password,
        createdAt: new Date().toISOString()
      };

      await storage.saveWordPressCredentials(credentials);
      
      res.json({ success: true, message: "WordPress credentials saved successfully" });
    } catch (error) {
      console.error("Error saving WordPress credentials:", error);
      res.status(500).json({ error: "Failed to save credentials" });
    }
  });

  // Get WordPress credentials
  app.get("/api/wordpress/credentials", async (req, res) => {
    try {
      const credentials = await storage.getWordPressCredentials();
      if (credentials) {
        // Don't expose the password in the response
        const { password, ...safeCredentials } = credentials;
        res.json(safeCredentials);
      } else {
        res.json(null);
      }
    } catch (error) {
      console.error("Error fetching WordPress credentials:", error);
      res.status(500).json({ error: "Failed to fetch credentials" });
    }
  });

  // Get WordPress categories
  app.get("/api/wordpress/categories", async (req, res) => {
    try {
      const { wordpressUrl, username, password } = req.query;
      
      if (!wordpressUrl || !username || !password) {
        return res.status(400).json({ error: "WordPress credentials required" });
      }

      const cleanPassword = String(password).replace(/\s+/g, '');
      const authHeader = Buffer.from(`${username}:${cleanPassword}`).toString('base64');
      
      const response = await fetch(`${wordpressUrl}/wp-json/wp/v2/categories?per_page=100`, {
        headers: {
          'Authorization': `Basic ${authHeader}`
        }
      });

      if (!response.ok) {
        throw new Error(`WordPress API error: ${response.status}`);
      }

      const categories = await response.json();
      res.json({ categories });
    } catch (error) {
      console.error("Error fetching WordPress categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Generate SEO tags and suggest category
  app.post("/api/blogs/analyze-seo", async (req, res) => {
    try {
      const { title, content, keyword, categories } = req.body;
      
      if (!title || !content || !keyword) {
        return res.status(400).json({ error: "Title, content, and keyword are required" });
      }

      const prompt = `Analyze this blog post for SEO optimization and intelligent category assignment:
      
      Title: "${title}"
      Keyword: "${keyword}"
      Content: "${content.substring(0, 1000)}..."
      
      Available WordPress categories: ${categories ? categories.map((c: any) => c.name).join(', ') : 'None provided'}
      
      IMPORTANT: WordPress allows multiple categories per post. Choose 1-3 RELEVANT categories from the available list:
      - Primary category: Most specific match for the main topic
      - Secondary categories: Related topics covered in the content
      - Technology content (AI, automation, software) → Technology/Tech categories
      - Business/entrepreneurship content → Business categories  
      - Marketing/SEO content → Marketing categories
      - Finance/money content → Finance categories
      - Personal development content → Personal Development categories
      - Avoid generic "Blogging" category unless content is specifically about blogging
      
      Return JSON with:
      {
        "suggestedCategories": ["Primary category name", "Secondary category name if applicable"],
        "seoTags": ["5-8 relevant SEO tags for WordPress"],
        "focusKeywords": ["2-3 additional focus keywords"],
        "metaDescription": "150-160 character meta description"
      }`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      res.json(result);
    } catch (error) {
      console.error("Error analyzing SEO:", error);
      res.status(500).json({ error: "Failed to analyze SEO" });
    }
  });

  // Enhanced WordPress publishing with network resilience
  app.post("/api/blogs/:id/publish", async (req, res) => {
    console.log("🚀 Starting resilient WordPress publish process...");
    
    // Set extended timeout for weak connections
    req.setTimeout(120000); // 2 minutes
    
    try {
      const blog = await storage.getBlog(req.params.id);
      if (!blog) {
        console.error("❌ Blog not found:", req.params.id);
        return res.status(404).json({ error: "Blog not found" });
      }

      console.log("✅ Found blog:", blog.title);

      let { wordpressUrl, username, password, categoryId, tags, metaDescription, seoData } = req.body;
      
      // Try to get credentials from database first, then fallback to request body
      if (!wordpressUrl || !username || !password) {
        console.log("🔑 Retrieving WordPress credentials from database...");
        const storedCredentials = await storage.getWordPressCredentials();
        
        if (storedCredentials) {
          wordpressUrl = storedCredentials.wordpressUrl || wordpressUrl;
          username = storedCredentials.username || username;
          password = storedCredentials.password || password;
          console.log("✅ Using stored credentials from database");
        } else {
          // Fallback to verified working credentials
          console.log("⚠️ No stored credentials found, using verified fallback");
          wordpressUrl = "https://exoala.com";
          username = "exoala@brenthoke.com";
          password = "lG2y KvcO SAMO nasv SFB9 LeOT";
        }
      }

      // Final validation
      if (!wordpressUrl || !username || !password) {
        console.error("❌ Missing required WordPress credentials");
        return res.status(400).json({ 
          error: "WordPress credentials are incomplete",
          needsCredentials: true
        });
      }

      // Clean and prepare credentials - keep original password format for app passwords
      const cleanPassword = String(password);
      const authHeader = Buffer.from(`${username}:${cleanPassword}`).toString('base64');
      
      console.log(`🔑 Auth debug - URL: ${wordpressUrl}, User: ${username}, Password length: ${password.length}`);
      
      // Test WordPress authentication with robust retry logic
      let authSuccess = false;
      for (let authAttempt = 1; authAttempt <= 3; authAttempt++) {
        try {
          console.log(`🔓 Testing WordPress auth (attempt ${authAttempt}/3)...`);
          
          const authController = new AbortController();
          const authTimeoutId = setTimeout(() => authController.abort(), 15000);
          
          const authTestResponse = await fetch(`${wordpressUrl}/wp-json/wp/v2/users/me`, {
            method: 'GET',
            headers: { 'Authorization': `Basic ${authHeader}` },
            signal: authController.signal
          });
          
          clearTimeout(authTimeoutId);

          if (authTestResponse.ok) {
            const userInfo = await authTestResponse.json();
            console.log(`✅ WordPress auth successful for user: ${userInfo.name || username}`);
            authSuccess = true;
            break;
          } else {
            const authError = await authTestResponse.text();
            console.error(`❌ Auth attempt ${authAttempt} failed: ${authTestResponse.status} - ${authError}`);
            
            if (authAttempt < 3) {
              console.log(`⏳ Retrying auth in ${authAttempt * 1000}ms...`);
              await new Promise(resolve => setTimeout(resolve, authAttempt * 1000));
            }
          }
        } catch (authError) {
          console.error(`💥 Auth attempt ${authAttempt} error:`, authError);
          if (authAttempt < 3) {
            await new Promise(resolve => setTimeout(resolve, authAttempt * 1000));
          }
        }
      }

      if (!authSuccess) {
        console.error("❌ All WordPress authentication attempts failed");
        return res.status(401).json({ 
          error: "WordPress authentication failed after multiple attempts",
          details: "Please verify your WordPress URL, username, and application password",
          needsCredentials: true
        });
      }

      // Generate dynamic, article-specific tags using AI with error handling
      let dynamicTags: string[] = [];
      console.log(`🏷️ Generating dynamic tags for: "${blog.title}"`);
      
      try {
        const tagPrompt = `Generate 6-8 unique, specific tags for this exact blog post. Requirements:
- Extract precise concepts from the actual content
- Focus on specific techniques, tools, benefits mentioned
- Use 1-3 words per tag
- Avoid generic terms like "guide", "tips", "how-to"
- Make tags searchable and specific to this content

Title: "${blog.title}"
Keyword: "${blog.keyword}"
Content excerpt: ${blog.content.substring(0, 1500)}

Analyze the content deeply and return ONLY a comma-separated list of highly specific tags that readers would search for.`;

        const tagController = new AbortController();
        const tagTimeoutId = setTimeout(() => tagController.abort(), 10000);

        const tagResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert content strategist who creates highly specific, unique tags for blog posts. Focus on extracting the most relevant and specific concepts from the actual content, avoiding generic keywords."
            },
            {
              role: "user",
              content: tagPrompt
            }
          ],
          max_tokens: 120,
          temperature: 0.2
        });

        clearTimeout(tagTimeoutId);
        
        const tagString = tagResponse.choices[0].message.content?.trim();
        if (tagString) {
          dynamicTags = tagString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0 && tag.length <= 25);
          console.log(`✅ Generated ${dynamicTags.length} dynamic tags:`, dynamicTags);
        }
      } catch (tagError) {
        console.warn('⚠️ Tag generation failed, using fallback tags:', tagError instanceof Error ? tagError.message : tagError);
        // Robust fallback tags based on content analysis
        dynamicTags = [blog.keyword];
        if (blog.title.toLowerCase().includes('business')) dynamicTags.push('business strategy');
        if (blog.title.toLowerCase().includes('tech')) dynamicTags.push('technology');
        if (blog.title.toLowerCase().includes('marketing')) dynamicTags.push('marketing');
        dynamicTags.push('productivity', 'tips');
        console.log(`📋 Using fallback tags:`, dynamicTags);
      }

      // Process tags with robust error handling - continue even if tags fail
      let tagIds = [];
      console.log(`🏷️ Processing ${dynamicTags.length} tags for WordPress...`);
      
      if (dynamicTags && dynamicTags.length > 0) {
        for (const tagName of dynamicTags) {
          try {
            console.log(`🔍 Processing tag: "${tagName}"`);
            
            // Check if tag exists with timeout
            const searchController = new AbortController();
            const searchTimeoutId = setTimeout(() => searchController.abort(), 5000);
            
            const tagResponse = await fetch(`${wordpressUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, {
              headers: { 'Authorization': `Basic ${authHeader}` },
              signal: searchController.signal
            });
            
            clearTimeout(searchTimeoutId);
            
            if (!tagResponse.ok) {
              console.warn(`⚠️ Failed to search for tag "${tagName}": ${tagResponse.status} - continuing without this tag`);
              continue;
            }
            
            const existingTags = await tagResponse.json();
            
            if (existingTags.length > 0) {
              tagIds.push(existingTags[0].id);
              console.log(`✅ Found existing tag "${tagName}" with ID: ${existingTags[0].id}`);
            } else {
              console.log(`➕ Creating new tag: ${tagName}`);
              
              // Create new tag with timeout
              const createController = new AbortController();
              const createTimeoutId = setTimeout(() => createController.abort(), 5000);
              
              const createTagResponse = await fetch(`${wordpressUrl}/wp-json/wp/v2/tags`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Basic ${authHeader}`
                },
                body: JSON.stringify({ name: tagName }),
                signal: createController.signal
              });
              
              clearTimeout(createTimeoutId);
              
              if (createTagResponse.ok) {
                const newTag = await createTagResponse.json();
                tagIds.push(newTag.id);
                console.log(`✅ Created new tag "${tagName}" with ID: ${newTag.id}`);
              } else {
                console.warn(`⚠️ Failed to create tag "${tagName}": ${createTagResponse.status} - continuing without this tag`);
              }
            }
          } catch (tagError) {
            console.warn(`⚠️ Error processing tag "${tagName}":`, tagError instanceof Error ? tagError.message : tagError);
            // Continue processing other tags
          }
        }
      }
      
      console.log(`📊 Successfully processed ${tagIds.length}/${dynamicTags.length} tags:`, tagIds);

      // Convert markdown to WordPress blocks format that was working earlier
      let htmlContent = blog.content;

      // Extract first image for featured image BEFORE any processing
      const firstImageMatch = blog.content.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      let featuredImageUrl = '';
      if (firstImageMatch) {
        featuredImageUrl = firstImageMatch[2];
        console.log(`Extracted featured image URL: ${featuredImageUrl}`);
      }

      // OPTION A: Remove ALL images from content (only use featured_media)
      const imageMatches = htmlContent.match(/!\[([^\]]*)\]\(([^)]+)\)/g);
      console.log(`Found ${imageMatches ? imageMatches.length : 0} images in markdown content`);
      if (imageMatches) {
        console.log('Images found:', imageMatches);
      }
      
      // Remove ALL markdown images from content
      htmlContent = htmlContent.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
      
      // Remove image captions and photo credits
      htmlContent = htmlContent.replace(/\*Photo by[^*]*\*/g, '');
      htmlContent = htmlContent.replace(/\*[^*]*Unsplash[^*]*\*/g, '');
      htmlContent = htmlContent.replace(/\*[^*]*Photo[^*]*\*/g, '');
      
      console.log(`🖼️ Removed ALL images from content - using featured_media only`);

      // Remove the H1 title to prevent duplicate titles (WordPress handles the post title)
      htmlContent = htmlContent.replace(/^# .+$/gm, '');

      // Convert to classic HTML format to bypass block editor issues
      htmlContent = htmlContent.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      htmlContent = htmlContent.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      htmlContent = htmlContent.replace(/^#### (.+)$/gm, '<h4>$1</h4>');

      // Convert lists to simple HTML
      htmlContent = htmlContent.replace(/^- (.+)$/gm, '<li>$1</li>');
      // Group consecutive list items into unordered lists
      let lines = htmlContent.split('\n');
      let inList = false;
      let result = [];
      for (let line of lines) {
        if (line.includes('<li>')) {
          if (!inList) {
            result.push('<ul>');
            inList = true;
          }
          result.push(line);
        } else {
          if (inList) {
            result.push('</ul>');
            inList = false;
          }
          result.push(line);
        }
      }
      if (inList) result.push('</ul>');
      htmlContent = result.join('\n');

      // Convert markdown links to clickable hyperlinks FIRST
      htmlContent = htmlContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      
      // Convert bare URLs to clickable links (but avoid double-processing already converted links)
      htmlContent = htmlContent.replace(/(^|[^"'>])(https?:\/\/[^\s<>"]+)(?![^<]*<\/a>)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');

      // Convert markdown bold and italic
      htmlContent = htmlContent.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      htmlContent = htmlContent.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      // Convert to simple HTML paragraphs
      const paragraphs = htmlContent.split('\n\n').filter(p => p.trim());
      htmlContent = paragraphs.map(p => {
        // Skip if already HTML
        if (p.includes('<h') || p.includes('<ul') || p.includes('<figure') || p.includes('<li')) {
          return p;
        }
        // Convert to simple paragraph
        return `<p>${p.trim()}</p>`;
      }).join('\n\n');

      // Create a clean version of HTML content without images for excerpt generation ONLY
      let cleanHtmlContentForExcerpt = htmlContent;
      // Remove all image-related HTML completely from excerpt version
      cleanHtmlContentForExcerpt = cleanHtmlContentForExcerpt.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gm, '');
      cleanHtmlContentForExcerpt = cleanHtmlContentForExcerpt.replace(/<img[^>]*>/gm, '');
      cleanHtmlContentForExcerpt = cleanHtmlContentForExcerpt.replace(/<p[^>]*><img[^>]*><\/p>/gm, '');
      cleanHtmlContentForExcerpt = cleanHtmlContentForExcerpt.replace(/<em>Photo by[^<]*<\/em>/gm, '');
      
      // Upload featured image with non-blocking error handling
      let featuredMediaId = null;
      // Set finalHtmlContent to the cleaned version without any images
      let finalHtmlContent = htmlContent;
      if (featuredImageUrl && firstImageMatch) {
        console.log(`🖼️ Attempting featured image upload: ${featuredImageUrl.substring(0, 80)}...`);
        
        try {
          // Single attempt with reasonable timeout - don't let image upload block the entire publish
          const imageController = new AbortController();
          const imageTimeoutId = setTimeout(() => imageController.abort(), 8000);
          
          const imageResponse = await fetch(featuredImageUrl, {
            signal: imageController.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogGen/1.0)' }
          });
          clearTimeout(imageTimeoutId);
          
          if (imageResponse.ok) {
            const imageBuffer = await imageResponse.arrayBuffer();
            
            if (imageBuffer.byteLength > 0 && imageBuffer.byteLength < 10000000) { // Max 10MB
              const contentType = featuredImageUrl.includes('.png') ? 'image/png' : 'image/jpeg';
              const fileName = `featured-${Date.now()}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
              
              const formData = new FormData();
              formData.append('file', new Blob([imageBuffer], { type: contentType }), fileName);
              formData.append('title', firstImageMatch[1] || 'Featured Image');
              formData.append('alt_text', firstImageMatch[1] || '');
              
              const uploadController = new AbortController();
              const uploadTimeoutId = setTimeout(() => uploadController.abort(), 12000);
              
              const uploadResponse = await fetch(`${wordpressUrl}/wp-json/wp/v2/media`, {
                method: 'POST',
                headers: { 'Authorization': `Basic ${authHeader}` },
                body: formData,
                signal: uploadController.signal
              });
              clearTimeout(uploadTimeoutId);
              
              if (uploadResponse.ok) {
                const mediaData = await uploadResponse.json();
                featuredMediaId = mediaData.id;
                console.log(`✅ Featured image uploaded successfully: ID ${featuredMediaId}`);
                
                console.log(`🖼️ Featured image uploaded and will be used as WordPress featured_media only`);
              } else {
                console.warn(`⚠️ Featured image upload failed: ${uploadResponse.status} - continuing without featured image`);
              }
            } else {
              console.warn(`⚠️ Invalid image size: ${imageBuffer.byteLength} bytes - continuing without featured image`);
            }
          } else {
            console.warn(`⚠️ Failed to download image: ${imageResponse.status} - continuing without featured image`);
          }
        } catch (imageError) {
          console.warn(`⚠️ Image upload error: ${imageError instanceof Error ? imageError.message : imageError} - continuing without featured image`);
        }
      }

      // Create completely clean excerpt by processing the original content
      let cleanExcerpt = blog.content;
      
      // Remove title line
      cleanExcerpt = cleanExcerpt.replace(/^# .+$/gm, '');
      
      // Remove ALL image markdown completely - multiple passes to ensure all are caught
      cleanExcerpt = cleanExcerpt.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
      cleanExcerpt = cleanExcerpt.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, ''); // Second pass
      
      // Remove any remaining image URLs that might be standalone
      cleanExcerpt = cleanExcerpt.replace(/https?:\/\/[^\s]*unsplash[^\s]*/gi, '');
      cleanExcerpt = cleanExcerpt.replace(/https?:\/\/images\.[^\s]*/gi, '');
      
      // Remove image captions and credits
      cleanExcerpt = cleanExcerpt.replace(/\*Photo by[^*]*\*/g, '');
      cleanExcerpt = cleanExcerpt.replace(/\*[^*]*Unsplash[^*]*\*/g, '');
      cleanExcerpt = cleanExcerpt.replace(/\*[^*]*Photo[^*]*\*/g, '');
      
      // Remove headers and formatting
      cleanExcerpt = cleanExcerpt.replace(/^#{1,6}\s+/gm, '');
      cleanExcerpt = cleanExcerpt.replace(/[*_`#]/g, '');
      
      // Remove links but keep text
      cleanExcerpt = cleanExcerpt.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      
      // Clean up whitespace and empty lines
      cleanExcerpt = cleanExcerpt.replace(/\n\s*\n/g, '\n');
      cleanExcerpt = cleanExcerpt.replace(/\s+/g, ' ').trim();
      
      // Take first meaningful content - skip if it starts with leftover URL fragments
      const sentences = cleanExcerpt.split(/[.!?]+/);
      let finalExcerpt = '';
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length > 20 && !trimmed.match(/^https?:\/\//) && !trimmed.includes('unsplash')) {
          finalExcerpt = trimmed + '.';
          break;
        }
      }
      
      if (!finalExcerpt && cleanExcerpt.length > 20) {
        finalExcerpt = cleanExcerpt.substring(0, 160).replace(/\s+\S*$/, '');
      }
      
      cleanExcerpt = finalExcerpt || 'A comprehensive guide on sustainable fashion and ethical living.';
      
      // WordPress REST API integration with dynamic category validation
      let categoryIds = seoData?.categoryIds || (categoryId ? [categoryId] : []);
      
      // Fetch current available categories from WordPress
      let availableCategories = [];
      try {
        const categoriesResponse = await fetch(`${wordpressUrl}/wp-json/wp/v2/categories?per_page=100`, {
          headers: { 'Authorization': `Basic ${authHeader}` }
        });
        
        if (categoriesResponse.ok) {
          availableCategories = await categoriesResponse.json();
          console.log(`📂 Found ${availableCategories.length} available categories in WordPress`);
        }
      } catch (error) {
        console.log(`⚠️ Failed to fetch WordPress categories: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Validate requested category IDs against available categories
      const validCategoryIds = [];
      const availableCategoryIds = availableCategories.map((cat: any) => cat.id);
      
      for (const catId of categoryIds) {
        if (availableCategoryIds.includes(catId)) {
          validCategoryIds.push(catId);
          const categoryName = availableCategories.find((cat: any) => cat.id === catId)?.name;
          console.log(`✅ Using valid category: ${categoryName} (ID: ${catId})`);
        } else {
          console.log(`⚠️ Category ID ${catId} not found in current WordPress categories`);
        }
      }
      
      // Smart fallback based on content analysis and available categories
      if (validCategoryIds.length === 0 && availableCategories.length > 0) {
        const title = blog.title.toLowerCase();
        const content = blog.content.toLowerCase();
        
        // Find best matching category based on content
        let bestMatch = null;
        
        // Look for AI/automation content
        if (title.includes('ai') || title.includes('automation') || content.includes('artificial intelligence')) {
          bestMatch = availableCategories.find((cat: any) => 
            cat.name.toLowerCase().includes('ai') || 
            cat.name.toLowerCase().includes('automation') ||
            cat.name.toLowerCase().includes('tool')
          );
        }
        
        // Look for income/business content
        if (!bestMatch && (title.includes('income') || title.includes('money') || content.includes('passive income'))) {
          bestMatch = availableCategories.find((cat: any) => 
            cat.name.toLowerCase().includes('income') || 
            cat.name.toLowerCase().includes('business') ||
            cat.name.toLowerCase().includes('affiliate')
          );
        }
        
        // Look for travel/nomad content
        if (!bestMatch && (title.includes('travel') || title.includes('nomad') || content.includes('digital nomad'))) {
          bestMatch = availableCategories.find((cat: any) => 
            cat.name.toLowerCase().includes('nomad') || 
            cat.name.toLowerCase().includes('travel') ||
            cat.name.toLowerCase().includes('abroad')
          );
        }
        
        // Use first available category as ultimate fallback
        if (!bestMatch && availableCategories.length > 0) {
          bestMatch = availableCategories[0];
        }
        
        if (bestMatch) {
          validCategoryIds.push(bestMatch.id);
          console.log(`📂 Using smart fallback category: ${bestMatch.name} (ID: ${bestMatch.id})`);
        }
      }
      
      console.log(`📂 Final validated category IDs:`, validCategoryIds);

      // Validate tags against WordPress available tags
      let validTagIds = [];
      if (tagIds && tagIds.length > 0) {
        try {
          const tagsResponse = await fetch(`${wordpressUrl}/wp-json/wp/v2/tags?per_page=100`, {
            headers: { 'Authorization': `Basic ${authHeader}` }
          });
          
          if (tagsResponse.ok) {
            const availableTags = await tagsResponse.json();
            const availableTagIds = availableTags.map((tag: any) => tag.id);
            
            for (const tagId of tagIds) {
              if (availableTagIds.includes(tagId)) {
                validTagIds.push(tagId);
                const tagName = availableTags.find((tag: any) => tag.id === tagId)?.name;
                console.log(`✅ Using valid tag: ${tagName} (ID: ${tagId})`);
              } else {
                console.log(`⚠️ Tag ID ${tagId} not found in current WordPress tags`);
              }
            }
          }
        } catch (error) {
          console.log(`⚠️ Failed to validate WordPress tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
          validTagIds = tagIds; // Use original tags if validation fails
        }
      }

      console.log(`🏷️ Final validated tag IDs:`, validTagIds);
      
      const wordpressData = {
        title: blog.title,
        content: finalHtmlContent,
        status: 'publish',
        categories: validCategoryIds,
        tags: validTagIds,
        excerpt: cleanExcerpt, // Always use our clean excerpt
        featured_media: null, // Disable featured image to prevent theme duplication
        meta: {
          _yoast_wpseo_metadesc: metaDescription || cleanExcerpt,
          _thumbnail_id: featuredImageUrl ? 'external' : '',
          _wp_attachment_image_alt: 'Featured image'
        }
      };

      console.log('WordPress post data prepared:', {
        title: wordpressData.title,
        contentLength: wordpressData.content.length,
        categories: wordpressData.categories,
        categoryCount: wordpressData.categories.length,
        tags: wordpressData.tags,
        tagCount: wordpressData.tags.length,
        featuredMedia: wordpressData.featured_media,
        featuredImageUrl: featuredImageUrl,
        featuredMediaId: featuredMediaId
      });
      
      console.log(`📂 Multi-category assignment: ${wordpressData.categories.length} categories selected`);
      
      // Log content with images for debugging
      const imageTagsInFinalContent = finalHtmlContent.match(/<img[^>]*>/g);
      console.log(`Final HTML content contains ${imageTagsInFinalContent ? imageTagsInFinalContent.length : 0} <img> tags`);
      if (imageTagsInFinalContent) {
        console.log('Image tags in final content:', imageTagsInFinalContent);
      }
      
      console.log(`📝 Publishing post: "${blog.title}" (${finalHtmlContent.length} chars)`);
      console.log(`🏷️ Tags: ${tagIds.length} | 🖼️ Featured: ${featuredMediaId ? 'Yes' : 'No'}`);

      // Enhanced WordPress publishing with weak connection resilience
      let response;
      let publishSuccess = false;
      const MAX_ATTEMPTS = 8; // Increased for weak connections
      
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          console.log(`📤 Publishing attempt ${attempt}/${MAX_ATTEMPTS}...`);
          
          const controller = new AbortController();
          // Progressive timeout: 30s, 45s, 60s, 75s, 90s, 105s, 120s, 135s
          const timeout = Math.min(30000 + (attempt - 1) * 15000, 135000);
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          console.log(`⏱️ Request timeout set to ${timeout/1000}s for attempt ${attempt}`);
          
          response = await fetch(`${wordpressUrl}/wp-json/wp/v2/posts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${authHeader}`
            },
            body: JSON.stringify(wordpressData),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (response.ok) {
            console.log(`✅ WordPress post published successfully on attempt ${attempt}`);
            publishSuccess = true;
            break;
          } else {
            const errorText = await response.text();
            console.error(`❌ Attempt ${attempt} failed: ${response.status} - ${errorText.substring(0, 200)}`);
            
            // Check for specific error types that shouldn't be retried
            if (response.status === 401 || response.status === 403) {
              console.error("Authentication failed - stopping retries");
              break;
            }
            
            if (attempt < MAX_ATTEMPTS) {
              // Progressive delay optimized for weak connections: 3s, 6s, 12s, 20s, 30s, 45s, 60s
              const delay = Math.min(3000 * Math.pow(1.5, attempt - 1), 60000);
              console.log(`⏳ Weak connection recovery - waiting ${delay/1000}s before retry ${attempt + 1}...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        } catch (publishError) {
          const errorMsg = publishError instanceof Error ? publishError.message : String(publishError);
          console.error(`💥 Attempt ${attempt} error:`, errorMsg);
          
          // Detect specific error types
          if (errorMsg.includes('AbortError') || errorMsg.includes('timeout')) {
            console.log(`⏱️ Request ${attempt} timed out - connection too slow`);
          } else if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
            console.log(`🌐 Network error on attempt ${attempt}`);
          }
          
          if (attempt < MAX_ATTEMPTS) {
            const delay = Math.min(3000 * Math.pow(1.5, attempt - 1), 60000);
            console.log(`⏳ Network recovery - waiting ${delay/1000}s before retry ${attempt + 1}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // Handle final failure
      if (!publishSuccess || !response?.ok) {
        let errorMessage = `WordPress publishing failed after ${MAX_ATTEMPTS} attempts`;
        
        if (response) {
          try {
            const errorText = await response.text();
            const errorData = JSON.parse(errorText);
            
            if (errorData.message) {
              errorMessage = `WordPress error: ${errorData.message}`;
            } else if (errorData.code) {
              errorMessage = `WordPress error code: ${errorData.code}`;
            }
          } catch {
            errorMessage = `WordPress HTTP ${response.status} error`;
          }
        }
        
        console.error(`❌ Final failure: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      const publishedPost = await response.json();
      
      // Update blog with WordPress publication details
      const updatedBlog = await storage.updateBlog(blog.id, { 
        status: 'published',
        wordpressUrl: publishedPost.link,
        wordpressPostId: publishedPost.id.toString(),
        publishedAt: new Date().toISOString(),
        categoryId: categoryId?.toString(),
        tagIds: tagIds,
        metaDescription: metaDescription
      });

      // Schedule source code backup after publishing
      backgroundServices.scheduleSourceBackup();

      const responseData = { 
        success: true, 
        wordpressUrl: publishedPost.link,
        publishedAt: new Date().toISOString(),
        categoryId,
        tagIds,
        metaDescription
      };
      
      console.log("🎉 Sending success response to client:", responseData);
      res.json(responseData);
    } catch (error) {
      console.error("Error publishing to WordPress:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({ 
        error: "Failed to publish to WordPress",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update blog image
  app.patch("/api/blogs/:id/images/:imageIndex", async (req, res) => {
    try {
      const { id, imageIndex } = req.params;
      const { newImage } = req.body;
      
      console.log(`🔄 Server: Received image replacement request for blog ${id}, image index ${imageIndex}`);
      console.log(`🖼️ Server: New image details:`, {
        url: newImage?.url,
        description: newImage?.description
      });
      
      if (!newImage || !newImage.url) {
        return res.status(400).json({ error: "New image data is required" });
      }

      const blog = await storage.getBlog(id);
      if (!blog) {
        return res.status(404).json({ error: "Blog not found" });
      }

      const imageIndexNum = parseInt(imageIndex);
      console.log(`🔢 Server: Parsed image index: ${imageIndexNum}`);
      
      if (isNaN(imageIndexNum) || imageIndexNum < 0) {
        return res.status(400).json({ error: "Invalid image index" });
      }

      // Extract all images first for debugging
      const allImages = [];
      let match;
      const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
      while ((match = imagePattern.exec(blog.content)) !== null) {
        allImages.push({ alt: match[1], url: match[2], index: allImages.length });
      }
      
      console.log(`📊 Server: Found ${allImages.length} images in content:`);
      allImages.forEach((img, idx) => {
        console.log(`  Image ${idx}: ${img.url.substring(img.url.lastIndexOf('/') + 1, img.url.indexOf('?'))}`);
      });
      
      // Simple image replacement - find and replace the specific image
      imagePattern.lastIndex = 0; // Reset regex
      let updatedContent = blog.content;
      let currentIndex = 0;
      let replaced = false;
      
      updatedContent = updatedContent.replace(imagePattern, (match, alt, url) => {
        console.log(`🔍 Server: Processing image ${currentIndex}, checking if ${currentIndex} === ${imageIndexNum}`);
        if (currentIndex === imageIndexNum) {
          console.log(`🔄 Server: REPLACING image ${currentIndex}: ${url.substring(url.lastIndexOf('/') + 1, url.indexOf('?'))} -> ${newImage.url.substring(newImage.url.lastIndexOf('/') + 1, newImage.url.indexOf('?'))}`);
          replaced = true;
          currentIndex++;
          return `![${newImage.description || newImage.alt_description || alt}](${newImage.url})`;
        }
        console.log(`⏭️ Server: Skipping image ${currentIndex}`);
        currentIndex++;
        return match;
      });
      
      if (!replaced) {
        console.log(`❌ Image index ${imageIndexNum} not found. Total images found: ${currentIndex}`);
        return res.status(400).json({ error: `Image index ${imageIndexNum} not found in content. Total images: ${currentIndex}` });
      }
      
      console.log(`✅ Successfully replaced image at index ${imageIndexNum}`);

      // Update the blog with new content
      const updatedBlog = await storage.updateBlog(id, {
        content: updatedContent
      });

      if (!updatedBlog) {
        console.error(`❌ Failed to update blog ${id} in storage`);
        return res.status(500).json({ error: "Failed to save updated blog" });
      }

      // Schedule source code backup after content update
      backgroundServices.scheduleSourceBackup();

      console.log(`✅ Blog ${id} updated successfully`);
      res.json(updatedBlog);
    } catch (error) {
      console.error("❌ Error updating blog image:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        blogId: req.params.id,
        imageIndex: req.params.imageIndex
      });
      res.status(500).json({ 
        error: "Failed to update image",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Delete blog
  app.delete("/api/blogs/:id", async (req, res) => {
    try {
      const success = await storage.deleteBlog(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Blog not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting blog:", error);
      res.status(500).json({ error: "Failed to delete blog" });
    }
  });

  // GitHub credentials endpoints
  app.get("/api/github/credentials", async (_req, res) => {
    try {
      const credentials = await storage.getGitHubCredentials();
      if (!credentials) {
        return res.status(404).json({ error: "GitHub credentials not found" });
      }
      // Don't send the actual token back for security
      const safeCredentials = { ...credentials, githubToken: '***' };
      res.json(safeCredentials);
    } catch (error) {
      console.error("Error fetching GitHub credentials:", error);
      res.status(500).json({ error: "Failed to fetch GitHub credentials" });
    }
  });

  app.post("/api/github/credentials", async (req, res) => {
    try {
      const validatedData = insertGitHubCredentialsSchema.parse(req.body);
      const credentials = await storage.saveGitHubCredentials(validatedData);
      
      // Test connection immediately
      const githubService = new GitHubService(credentials);
      const isValid = await githubService.testConnection();
      
      if (!isValid) {
        return res.status(400).json({ 
          error: "GitHub credentials are invalid or repository is not accessible" 
        });
      }
      
      const safeCredentials = { ...credentials, githubToken: '***' };
      res.json({ ...safeCredentials, connectionValid: true });
    } catch (error) {
      console.error("Error saving GitHub credentials:", error);
      res.status(500).json({ error: "Failed to save GitHub credentials" });
    }
  });

  // Test GitHub connection
  app.post("/api/github/test-connection", async (req, res) => {
    try {
      const credentials = await storage.getGitHubCredentials();
      if (!credentials) {
        return res.status(404).json({ error: "GitHub credentials not configured" });
      }

      const githubService = new GitHubService(credentials);
      const isValid = await githubService.testConnection();
      
      res.json({ connected: isValid });
    } catch (error) {
      console.error("Error testing GitHub connection:", error);
      res.status(500).json({ error: "Failed to test GitHub connection" });
    }
  });

  // Backup blog to GitHub
  app.post("/api/blogs/:id/backup-to-github", async (req, res) => {
    try {
      const blog = await storage.getBlog(req.params.id);
      if (!blog) {
        return res.status(404).json({ error: "Blog not found" });
      }

      const credentials = await storage.getGitHubCredentials();
      if (!credentials) {
        return res.status(400).json({ error: "GitHub credentials not configured" });
      }

      const githubService = new GitHubService(credentials);
      const result = await githubService.backupBlog(blog);
      
      // Update blog with GitHub backup info
      await storage.updateBlog(req.params.id, {
        githubFilePath: result.filePath,
        githubCommitSha: result.commitSha,
        backedUpToGithub: "true"
      });

      res.json({
        success: true,
        filePath: result.filePath,
        commitSha: result.commitSha,
        repositoryUrl: `https://github.com/${credentials.repositoryOwner}/${credentials.repositoryName}`
      });
    } catch (error) {
      console.error("Error backing up blog to GitHub:", error);
      res.status(500).json({ 
        error: "Failed to backup blog to GitHub",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // List GitHub repository files
  app.get("/api/github/files", async (_req, res) => {
    try {
      const credentials = await storage.getGitHubCredentials();
      if (!credentials) {
        return res.status(404).json({ error: "GitHub credentials not configured" });
      }

      const githubService = new GitHubService(credentials);
      const files = await githubService.listFiles();
      
      res.json(files);
    } catch (error) {
      console.error("Error listing GitHub files:", error);
      res.status(500).json({ error: "Failed to list GitHub files" });
    }
  });

  // Source code backup endpoint
  app.post("/api/source-backup", async (_req, res) => {
    try {
      console.log("🔄 Manual source code backup initiated...");
      await sourceBackupService.backupSourceCode();
      res.json({ success: true, message: "Source code backup completed successfully" });
    } catch (error) {
      console.error("Source backup failed:", error);
      res.status(500).json({ 
        error: "Source backup failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
