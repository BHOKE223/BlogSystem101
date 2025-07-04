import { blogs, users, wordpressCredentials, githubCredentials, type Blog, type InsertBlog, type UpdateBlog, type User, type InsertUser, type WordPressCredentials, type InsertWordPressCredentials, type GitHubCredentials, type InsertGitHubCredentials } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import * as fs from 'fs';
import { randomUUID } from 'crypto';

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Blog methods
  getBlog(id: string): Promise<Blog | undefined>;
  getAllBlogs(): Promise<Blog[]>;
  createBlog(blog: InsertBlog): Promise<Blog>;
  updateBlog(id: string, blog: UpdateBlog): Promise<Blog | undefined>;
  deleteBlog(id: string): Promise<boolean>;

  // WordPress credentials methods
  getWordPressCredentials(): Promise<any | undefined>;
  saveWordPressCredentials(credentials: any): Promise<any>;

  // GitHub credentials methods
  getGitHubCredentials(): Promise<GitHubCredentials | undefined>;
  saveGitHubCredentials(credentials: InsertGitHubCredentials): Promise<GitHubCredentials>;
  getAllGitHubCredentials(): Promise<GitHubCredentials[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private blogs: Map<string, Blog>;
  private currentUserId: number;
  private dataFile: string;
  private wordpressCredentials: any | null;
  private githubCredentials: GitHubCredentials | null;

  constructor() {
    this.users = new Map();
    this.blogs = new Map();
    this.currentUserId = 1;
    this.dataFile = './storage_data.json';
    this.wordpressCredentials = null;
    this.githubCredentials = null;
    // Ensure data loads synchronously during construction
    this.loadDataSync();
  }

  private loadDataSync() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        if (data.blogs) {
          this.blogs = new Map(Object.entries(data.blogs));
        }
        if (data.users) {
          this.users = new Map(Object.entries(data.users).map(([k, v]: [string, any]) => [parseInt(k), v]));
        }
        if (data.currentUserId) {
          this.currentUserId = data.currentUserId;
        }
        if (data.wordpressCredentials) {
          this.wordpressCredentials = data.wordpressCredentials;
        }
        console.log(`Loaded ${this.blogs.size} blogs from persistent storage`);
      } else {
        console.log('No existing storage file found, starting with empty storage');
      }
    } catch (error) {
      console.error('Error loading persistent data:', error);
    }
  }

  private saveData() {
    try {
      const data = {
        blogs: Object.fromEntries(this.blogs),
        users: Object.fromEntries(this.users),
        currentUserId: this.currentUserId,
        wordpressCredentials: this.wordpressCredentials
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
      console.log(`Saved ${this.blogs.size} blogs to persistent storage`);
    } catch (error) {
      console.error('Error saving persistent data:', error);
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    this.saveData();
    return user;
  }

  // Blog methods
  async getBlog(id: string): Promise<Blog | undefined> {
    return this.blogs.get(id);
  }

  async getAllBlogs(): Promise<Blog[]> {
    return Array.from(this.blogs.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createBlog(insertBlog: InsertBlog): Promise<Blog> {
    const id = `blog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const blog: Blog = {
      id,
      keyword: insertBlog.keyword,
      title: insertBlog.title,
      content: insertBlog.content,
      imageUrl: insertBlog.imageUrl || null,
      imageDescription: insertBlog.imageDescription || null,
      images: insertBlog.images || [],
      status: insertBlog.status || "draft",
      generatedTopics: insertBlog.generatedTopics || [],
      wordCount: String(insertBlog.wordCount || 0),
      wordpressUrl: null,
      wordpressPostId: null,
      publishedAt: null,
      categoryId: null,
      tagIds: null,
      metaDescription: null,
      githubFilePath: null,
      githubCommitSha: null,
      backedUpToGithub: "false",
      createdAt: new Date()
    };
    this.blogs.set(id, blog);
    this.saveData();
    return blog;
  }

  async updateBlog(id: string, updateBlog: UpdateBlog): Promise<Blog | undefined> {
    const existingBlog = this.blogs.get(id);
    if (!existingBlog) {
      return undefined;
    }

    const updatedBlog: Blog = {
      ...existingBlog,
      ...updateBlog,
    };
    this.blogs.set(id, updatedBlog);
    this.saveData();
    return updatedBlog;
  }

  async deleteBlog(id: string): Promise<boolean> {
    const result = this.blogs.delete(id);
    if (result) {
      this.saveData();
    }
    return result;
  }

  async getWordPressCredentials(): Promise<any | undefined> {
    return this.wordpressCredentials;
  }

  async saveWordPressCredentials(credentials: any): Promise<any> {
    this.wordpressCredentials = credentials;
    this.saveData();
    return credentials;
  }

  async getGitHubCredentials(): Promise<GitHubCredentials | undefined> {
    return this.githubCredentials || undefined;
  }

  async saveGitHubCredentials(credentials: InsertGitHubCredentials): Promise<GitHubCredentials> {
    const githubCreds: GitHubCredentials = {
      id: Date.now(),
      userId: 1,
      name: credentials.name,
      githubToken: credentials.githubToken,
      repositoryOwner: credentials.repositoryOwner,
      repositoryName: credentials.repositoryName,
      branch: credentials.branch || "main",
      basePath: credentials.basePath || "content/blogs",
      isDefault: credentials.isDefault || "false",
      createdAt: new Date()
    };
    this.githubCredentials = githubCreds;
    this.saveData();
    return githubCreds;
  }

  async getAllGitHubCredentials(): Promise<GitHubCredentials[]> {
    return this.githubCredentials ? [this.githubCredentials] : [];
  }
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getBlog(id: string): Promise<Blog | undefined> {
    const [blog] = await db.select().from(blogs).where(eq(blogs.id, id));
    return blog || undefined;
  }

  async getAllBlogs(): Promise<Blog[]> {
    return await db.select().from(blogs).orderBy(desc(blogs.createdAt));
  }

  async createBlog(insertBlog: InsertBlog): Promise<Blog> {
    const id = randomUUID();
    const blogData = {
      ...insertBlog,
      id,
      createdAt: new Date()
    };
    
    const [blog] = await db
      .insert(blogs)
      .values(blogData)
      .returning();
    return blog;
  }

  async updateBlog(id: string, updateBlog: UpdateBlog): Promise<Blog | undefined> {
    const [blog] = await db
      .update(blogs)
      .set(updateBlog)
      .where(eq(blogs.id, id))
      .returning();
    return blog || undefined;
  }

  async deleteBlog(id: string): Promise<boolean> {
    const result = await db.delete(blogs).where(eq(blogs.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getWordPressCredentials(): Promise<any | undefined> {
    const [credentials] = await db.select().from(wordpressCredentials).limit(1);
    return credentials || undefined;
  }

  async saveWordPressCredentials(credentials: any): Promise<any> {
    const [existing] = await db.select().from(wordpressCredentials).limit(1);
    
    // Filter out undefined/null values and format data properly
    const cleanCredentials = {
      name: credentials.name || existing?.name,
      wordpressUrl: credentials.wordpressUrl || existing?.wordpressUrl,
      username: credentials.username || existing?.username,
      password: credentials.password || existing?.password,
      isDefault: String(credentials.isDefault || existing?.isDefault || "true"),
    };
    
    if (existing) {
      const [updated] = await db
        .update(wordpressCredentials)
        .set(cleanCredentials)
        .where(eq(wordpressCredentials.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(wordpressCredentials)
        .values({
          ...cleanCredentials,
          userId: null,
        })
        .returning();
      return created;
    }
  }

  async getGitHubCredentials(): Promise<GitHubCredentials | undefined> {
    const [credentials] = await db.select().from(githubCredentials).limit(1);
    return credentials || undefined;
  }

  async saveGitHubCredentials(credentials: InsertGitHubCredentials): Promise<GitHubCredentials> {
    const [existing] = await db.select().from(githubCredentials).limit(1);
    
    if (existing) {
      const [updated] = await db
        .update(githubCredentials)
        .set(credentials)
        .where(eq(githubCredentials.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(githubCredentials)
        .values(credentials)
        .returning();
      return created;
    }
  }

  async getAllGitHubCredentials(): Promise<GitHubCredentials[]> {
    return await db.select().from(githubCredentials);
  }
}

// Initialize storage with database connection testing
async function initializeStorage(): Promise<IStorage> {
  try {
    // Test basic database connection by creating tables if they don't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS blogs (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        image_description TEXT,
        images TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        generated_topics TEXT,
        word_count TEXT,
        wordpress_url TEXT,
        wordpress_post_id TEXT,
        published_at TEXT,
        category_id TEXT,
        tag_ids TEXT,
        meta_description TEXT,
        github_file_path TEXT,
        github_commit_sha TEXT,
        backed_up_to_github TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS github_credentials (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        github_token TEXT NOT NULL,
        repository_owner TEXT NOT NULL,
        repository_name TEXT NOT NULL,
        branch TEXT DEFAULT 'main' NOT NULL,
        base_path TEXT DEFAULT 'content/blogs' NOT NULL,
        is_default TEXT DEFAULT 'false',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS file_backup_history (
        id SERIAL PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        file_hash TEXT NOT NULL,
        github_commit_sha TEXT,
        last_backup_at TIMESTAMP DEFAULT NOW() NOT NULL,
        file_size INTEGER NOT NULL
      );
      
      INSERT INTO users (username, password) VALUES ('admin', 'password') ON CONFLICT (username) DO NOTHING;
    `);
    
    console.log("✅ Using PostgreSQL database storage with initialized tables");
    return new DatabaseStorage();
  } catch (error) {
    console.log("⚠️ Database connection failed, using memory storage with file persistence");
    return new MemStorage();
  }
}

// Initialize storage system
let storageInstance: IStorage = new MemStorage();

initializeStorage().then(storage => {
  storageInstance = storage;
}).catch(error => {
  console.log("Storage initialization failed:", error);
});

export const storage = new Proxy({} as IStorage, {
  get(target, prop) {
    return storageInstance[prop as keyof IStorage];
  }
});