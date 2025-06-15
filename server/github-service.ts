import type { Blog, GitHubCredentials } from "@shared/schema";

interface GitHubFile {
  name: string;
  path: string;
  sha?: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  content?: string;
  encoding?: string;
}

interface GitHubCommitResponse {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
}

export class GitHubService {
  private credentials: GitHubCredentials;

  constructor(credentials: GitHubCredentials) {
    this.credentials = credentials;
  }

  private getApiUrl(path: string): string {
    return `https://api.github.com/repos/${this.credentials.repositoryOwner}/${this.credentials.repositoryName}/contents/${path}`;
  }

  private getHeaders() {
    return {
      'Authorization': `token ${this.credentials.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  async createOrUpdateFile(path: string, content: string, message: string, sha?: string): Promise<GitHubCommitResponse> {
    const url = this.getApiUrl(path);
    const body: any = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch: this.credentials.branch,
    };

    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return result.commit;
  }

  async getFile(path: string): Promise<GitHubFile | null> {
    const url = this.getApiUrl(path);
    
    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  async backupBlog(blog: Blog): Promise<{ filePath: string; commitSha: string }> {
    const fileName = this.generateFileName(blog);
    const filePath = `${this.credentials.basePath}/${fileName}`;
    const content = this.generateMarkdownContent(blog);
    
    // Check if file already exists
    const existingFile = await this.getFile(filePath);
    const commitMessage = existingFile 
      ? `Update blog post: ${blog.title}`
      : `Add new blog post: ${blog.title}`;

    const commit = await this.createOrUpdateFile(
      filePath,
      content,
      commitMessage,
      existingFile?.sha
    );

    return {
      filePath,
      commitSha: commit.sha,
    };
  }

  private generateFileName(blog: Blog): string {
    const date = new Date(blog.createdAt).toISOString().split('T')[0];
    const slug = blog.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${date}-${slug}.md`;
  }

  private generateMarkdownContent(blog: Blog): string {
    const frontmatter: Record<string, any> = {
      title: blog.title,
      keyword: blog.keyword,
      status: blog.status,
      wordCount: blog.wordCount,
      createdAt: blog.createdAt,
    };

    if (blog.publishedAt) frontmatter.publishedAt = blog.publishedAt;
    if (blog.wordpressUrl) frontmatter.wordpressUrl = blog.wordpressUrl;
    if (blog.wordpressPostId) frontmatter.wordpressPostId = blog.wordpressPostId;
    if (blog.categoryId) frontmatter.categoryId = blog.categoryId;
    if (blog.tagIds) frontmatter.tagIds = blog.tagIds;
    if (blog.metaDescription) frontmatter.metaDescription = blog.metaDescription;

    const yamlFrontmatter = Object.entries(frontmatter)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        }
        return `${key}: ${JSON.stringify(value)}`;
      })
      .join('\n');

    return `---
${yamlFrontmatter}
---

${blog.content}
`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `https://api.github.com/repos/${this.credentials.repositoryOwner}/${this.credentials.repositoryName}`;
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async listFiles(): Promise<GitHubFile[]> {
    const url = this.getApiUrl(this.credentials.basePath);
    
    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    const files = await response.json();
    return Array.isArray(files) ? files : [];
  }
}