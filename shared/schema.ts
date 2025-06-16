import { pgTable, text, serial, uuid, timestamp, json, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const blogs = pgTable("blogs", {
  id: text("id").primaryKey(),
  keyword: text("keyword").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  imageDescription: text("image_description"),
  images: json("images"),
  status: text("status").notNull().default("draft"), // draft or published
  generatedTopics: json("generated_topics"),
  wordCount: text("word_count"),
  // WordPress publishing fields
  wordpressUrl: text("wordpress_url"),
  wordpressPostId: text("wordpress_post_id"),
  publishedAt: text("published_at"),
  categoryId: text("category_id"),
  tagIds: json("tag_ids"),
  metaDescription: text("meta_description"),
  // GitHub backup fields
  githubFilePath: text("github_file_path"),
  githubCommitSha: text("github_commit_sha"),
  backedUpToGithub: text("backed_up_to_github").default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBlogSchema = createInsertSchema(blogs).omit({
  id: true,
  createdAt: true,
});

export const updateBlogSchema = createInsertSchema(blogs).omit({
  id: true,
  createdAt: true,
}).partial();

export type InsertBlog = z.infer<typeof insertBlogSchema>;
export type UpdateBlog = z.infer<typeof updateBlogSchema>;
export type Blog = typeof blogs.$inferSelect;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const wordpressCredentials = pgTable("wordpress_credentials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(), // friendly name for the credential set
  wordpressUrl: text("wordpress_url").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(), // encrypted app password
  isDefault: text("is_default").default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const githubCredentials = pgTable("github_credentials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(), // friendly name for the credential set
  githubToken: text("github_token").notNull(), // GitHub personal access token
  repositoryOwner: text("repository_owner").notNull(), // GitHub username or org
  repositoryName: text("repository_name").notNull(), // Repository name
  branch: text("branch").default("main").notNull(), // Target branch
  basePath: text("base_path").default("content/blogs").notNull(), // Path within repo
  isDefault: text("is_default").default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const fileBackupHistory = pgTable("file_backup_history", {
  id: serial("id").primaryKey(),
  filePath: text("file_path").notNull().unique(),
  fileHash: text("file_hash").notNull(),
  githubCommitSha: text("github_commit_sha"),
  lastBackupAt: timestamp("last_backup_at").defaultNow().notNull(),
  fileSize: integer("file_size").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertWordPressCredentialsSchema = createInsertSchema(wordpressCredentials).omit({
  id: true,
  createdAt: true,
});

export const updateWordPressCredentialsSchema = createInsertSchema(wordpressCredentials).omit({
  id: true,
  createdAt: true,
  userId: true,
}).partial();

export const insertGitHubCredentialsSchema = createInsertSchema(githubCredentials).omit({
  id: true,
  createdAt: true,
});

export const updateGitHubCredentialsSchema = createInsertSchema(githubCredentials).omit({
  id: true,
  createdAt: true,
  userId: true,
}).partial();

export const insertFileBackupHistorySchema = createInsertSchema(fileBackupHistory).omit({
  id: true,
  lastBackupAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertWordPressCredentials = z.infer<typeof insertWordPressCredentialsSchema>;
export type UpdateWordPressCredentials = z.infer<typeof updateWordPressCredentialsSchema>;
export type WordPressCredentials = typeof wordpressCredentials.$inferSelect;
export type InsertGitHubCredentials = z.infer<typeof insertGitHubCredentialsSchema>;
export type UpdateGitHubCredentials = z.infer<typeof updateGitHubCredentialsSchema>;
export type GitHubCredentials = typeof githubCredentials.$inferSelect;
export type InsertFileBackupHistory = z.infer<typeof insertFileBackupHistorySchema>;
export type FileBackupHistory = typeof fileBackupHistory.$inferSelect;
